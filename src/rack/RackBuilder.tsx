import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { exportRackSurveyToExcel, formatRackUnitsForExcel } from '../services/excelExport';
import { buildExportFilename, exportRackElementToPdf } from '../services/pdfExport';

import {
  deviceTypeUsesSurveyMetadata,
  EMPTY_RACK_IDENTITY,
  type RackDeviceType,
  type RackIdentity,
  type RackPlacedBlock,
  type RackProjectData,
} from './rackProjectContract';

type DeviceType = RackDeviceType;
type PlacedBlock = RackPlacedBlock;

const DEVICE_TYPES: DeviceType[] = [
  'Switch',
  'Patch Panel',
  'PDU',
  'UPS',
  'Router',
  'Firewall',
  'Server',
  'Wire Manager',
  'Fiber Shelf',
  'LIU',
  'Shelf',
  'Blank Panel',
  'KVM',
  'NVR',
  'Amplifier',
  'Paging Controller',
  'Custom Device',
];

/** PDF legend: device colors reference (excludes Other/Unknown). */
const PDF_LEGEND_DEVICE_TYPES: DeviceType[] = [
  'Switch',
  'Patch Panel',
  'PDU',
  'UPS',
  'Router',
  'Firewall',
  'Server',
  'Wire Manager',
  'Fiber Shelf',
  'LIU',
  'Shelf',
  'Blank Panel',
  'KVM',
  'NVR',
  'Amplifier',
  'Paging Controller',
  'Custom Device',
];

/** Must match `--rack-unit-height` in global.css */
const RACK_UNIT_PX = 22;

/** Mobile placed-block: long-press before move, double-tap window for edit (see handlers). */
const MOBILE_PLACED_BLOCK_LONG_PRESS_MS = 450;
const MOBILE_PLACED_BLOCK_LONG_PRESS_SLOP_PX = 12;
const MOBILE_PLACED_BLOCK_DOUBLE_TAP_MS = 400;

/** Mobile rack tap: max movement from touch start for a release to count as a tap (not a drag/scroll). */
const MOBILE_RACK_TAP_MAX_SLOP_PX = 10;

/** Mobile empty-rack selection: hold while mostly still before selecting rack space. */
const MOBILE_EMPTY_SELECTION_HOLD_MS = 220;

/** Movement before the hold completes means the user is scrolling, not selecting. */
const MOBILE_EMPTY_SELECTION_HOLD_SLOP_PX = 10;

/** Reject impossibly fast contacts (screen noise / grazing touches). */
const MOBILE_RACK_TAP_MIN_MS = 70;

/** Reject long presses without drag — not a crisp tap. */
const MOBILE_RACK_TAP_MAX_MS = 450;

/** Default / quick-select rack height (most common). */
const DEFAULT_RACK_UNITS = 42;
const MIN_RACK_UNITS = 1;
const MAX_RACK_UNITS = 99;

function clampRackUnits(n: number): number {
  return Math.max(MIN_RACK_UNITS, Math.min(MAX_RACK_UNITS, Math.round(n)));
}

/** Parse legacy `"42U"` / `"44U"` or numeric `rackHeight` from storage. */
function parseStoredRackUnits(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return clampRackUnits(value);
  }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d+)U$/i);
    if (m) {
      return clampRackUnits(parseInt(m[1], 10));
    }
  }
  return null;
}

function blockFitsInRack(block: PlacedBlock, rackUnitsU: number): boolean {
  if (block.size > rackUnitsU) {
    return false;
  }
  const low = block.startUnit - block.size + 1;
  return low >= 1 && block.startUnit <= rackUnitsU;
}

function filterPlacedBlocksForRackUnits(blocks: PlacedBlock[], rackUnitsU: number): PlacedBlock[] {
  return blocks.filter((b) => blockFitsInRack(b, rackUnitsU));
}

function normalizePlacedBlocksForSurvey(blocks: PlacedBlock[]): PlacedBlock[] {
  return blocks.map((block) => {
    const b = block as Partial<PlacedBlock>;
    const deviceType = (typeof b.deviceType === 'string' ? b.deviceType : block.deviceType) as DeviceType;
    const merged: PlacedBlock = {
      ...block,
      deviceType,
      deviceName: typeof b.deviceName === 'string' ? b.deviceName : '',
      serialNumber: typeof b.serialNumber === 'string' ? b.serialNumber : '',
      macAddress: typeof b.macAddress === 'string' ? b.macAddress : '',
      assetTag: typeof b.assetTag === 'string' ? b.assetTag : '',
      openPorts: typeof b.openPorts === 'string' ? b.openPorts : '',
      notes: typeof b.notes === 'string' ? b.notes : '',
    };
    return merged;
  });
}

function normalizeOptionalDescriptor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Avoid showing common placeholder strings.
  if (trimmed === '-' || trimmed.toUpperCase() === 'N/A') {
    return null;
  }
  return trimmed;
}

/** Rack identification is complete when both location and rack number are set (trimmed). */
function isRackIdentityComplete(identity: RackIdentity): boolean {
  return identity.rackLocation.trim() !== '' && identity.rackNumber.trim() !== '';
}

/** Single-line label for app + PDF. Omits empty parts; no placeholders. */
function formatRackIdentityDisplay(identity: RackIdentity): string | null {
  const loc = normalizeOptionalDescriptor(identity.rackLocation);
  const num = normalizeOptionalDescriptor(identity.rackNumber);
  if (loc && num) {
    return `${loc} – Rack ${num}`;
  }
  if (loc) {
    return loc;
  }
  if (num) {
    return `Rack ${num}`;
  }
  return null;
}

/**
 * Single-line rack label: custom device name as entered (trimmed for empty check only), else device type.
 * Does not merge with notes or alter capitalization.
 */
function getRackBlockLabel(block: PlacedBlock): string {
  const raw = block.deviceName ?? '';
  if (raw.trim() !== '') {
    return raw.trim();
  }
  return block.deviceType;
}

/** Live resize: bottom–top U span and total height (matches rack math: top = startUnit). */
function formatBlockResizeFeedback(block: Pick<PlacedBlock, 'startUnit' | 'size'>): string {
  const topU = block.startUnit;
  const bottomU = block.startUnit - block.size + 1;
  if (block.size <= 1) {
    return `${topU} (1U)`;
  }
  return `${bottomU}\u2013${topU} (${block.size}U)`;
}

function getBlockUnits(block: Pick<PlacedBlock, 'startUnit' | 'size'>): number[] {
  return Array.from({ length: block.size }, (_, index) => block.startUnit - index);
}

function nearestValidResize(
  block: PlacedBlock,
  proposedSize: number,
  placedBlocks: PlacedBlock[],
): number {
  const maxSize = block.startUnit;
  let proposed = Math.round(proposedSize);
  proposed = Math.max(1, Math.min(proposed, maxSize));

  const isValidSize = (size: number) => {
    if (size < 1 || size > maxSize) {
      return false;
    }
    const candidateUnits = new Set(getBlockUnits({ startUnit: block.startUnit, size }));
    return !placedBlocks.some(
      (other) =>
        other.id !== block.id && getBlockUnits(other).some((unit) => candidateUnits.has(unit)),
    );
  };

  if (isValidSize(proposed)) {
    return proposed;
  }

  for (let offset = 1; offset <= maxSize; offset += 1) {
    const lower = proposed - offset;
    const upper = proposed + offset;
    if (lower >= 1 && isValidSize(lower)) {
      return lower;
    }
    if (upper <= maxSize && isValidSize(upper)) {
      return upper;
    }
  }

  return block.size;
}

function nearestValidMove(
  block: PlacedBlock,
  proposedStartUnit: number,
  placedBlocks: PlacedBlock[],
  rackUnitsU: number,
): number {
  const { size } = block;
  const minStart = size;
  const maxStart = rackUnitsU;
  let proposed = Math.round(proposedStartUnit);
  proposed = Math.max(minStart, Math.min(proposed, maxStart));

  const isValidStart = (startUnit: number) => {
    if (startUnit < minStart || startUnit > maxStart) {
      return false;
    }
    const candidateUnits = new Set(getBlockUnits({ startUnit, size }));
    return !placedBlocks.some(
      (other) =>
        other.id !== block.id && getBlockUnits(other).some((unit) => candidateUnits.has(unit)),
    );
  };

  if (isValidStart(proposed)) {
    return proposed;
  }

  for (let offset = 1; offset <= rackUnitsU; offset += 1) {
    const higher = proposed + offset;
    const lower = proposed - offset;
    if (higher <= maxStart && isValidStart(higher)) {
      return higher;
    }
    if (lower >= minStart && isValidStart(lower)) {
      return lower;
    }
  }

  return block.startUnit;
}

/** Same rules as `placeBlockAt` — used for palette drop preview validity. */
function isPlaceValidForNewBlock(
  startUnit: number,
  blockSize: number,
  placedBlocks: PlacedBlock[],
): boolean {
  const lowestUnit = startUnit - blockSize + 1;
  if (lowestUnit < 1) {
    return false;
  }
  const candidateBlock = { startUnit, size: blockSize };
  const candidateUnits = new Set(getBlockUnits(candidateBlock));
  return !placedBlocks.some((block) =>
    getBlockUnits(block).some((unit) => candidateUnits.has(unit)),
  );
}

/**
 * Continuous rack unit number at the pointer (1 = bottom, totalU = top),
 * so the center of each row maps to its integer label.
 */
function centerUnitFromRackGridClientY(
  clientY: number,
  gridRect: DOMRectReadOnly,
  rackUnitsU: number,
  rackUnitPx: number,
): number {
  const yTop = Math.max(0, Math.min(gridRect.height, clientY - gridRect.top));
  return rackUnitsU - yTop / rackUnitPx + 0.5;
}

/** Top unit `startUnit` so the block's vertical center sits at `centerUnit`. */
function startUnitFromCenterAnchor(centerUnit: number, blockSize: number): number {
  return Math.round(centerUnit + (blockSize - 1) / 2);
}

function nearestValidStartForNewBlock(
  proposedStartUnit: number,
  blockSize: number,
  placedBlocks: PlacedBlock[],
  rackUnitsU: number,
): number {
  const minStart = blockSize;
  const maxStart = rackUnitsU;
  let proposed = Math.round(proposedStartUnit);
  proposed = Math.max(minStart, Math.min(proposed, maxStart));

  const isValid = (startUnit: number) =>
    isPlaceValidForNewBlock(startUnit, blockSize, placedBlocks);

  if (isValid(proposed)) {
    return proposed;
  }

  for (let offset = 1; offset <= rackUnitsU; offset += 1) {
    const higher = proposed + offset;
    const lower = proposed - offset;
    if (higher <= maxStart && isValid(higher)) {
      return higher;
    }
    if (lower >= minStart && isValid(lower)) {
      return lower;
    }
  }

  return proposed;
}

type PlacementTapPreviewResult = {
  previewStartUnit: number;
  valid: boolean;
};

/** Preview + tap placement: same snap and validity as palette drop (nearest valid start, then collision check). */
function getPlacementTapPreviewAtClient(
  clientX: number,
  clientY: number,
  gridRect: DOMRectReadOnly,
  placementModeSize: number,
  placedBlocks: PlacedBlock[],
  rackUnitsU: number,
): PlacementTapPreviewResult | null {
  const inside =
    clientX >= gridRect.left &&
    clientX <= gridRect.right &&
    clientY >= gridRect.top &&
    clientY <= gridRect.bottom;
  if (!inside) {
    return null;
  }
  const centerUnitFloat = centerUnitFromRackGridClientY(clientY, gridRect, rackUnitsU, RACK_UNIT_PX);
  const proposed = startUnitFromCenterAnchor(centerUnitFloat, placementModeSize);
  const previewStartUnit = nearestValidStartForNewBlock(
    proposed,
    placementModeSize,
    placedBlocks,
    rackUnitsU,
  );
  const valid = isPlaceValidForNewBlock(previewStartUnit, placementModeSize, placedBlocks);
  return { previewStartUnit, valid };
}

/**
 * Live span for mobile empty-rack vertical drag: anchor U from pointer-down and finger U from pointer Y.
 * If the raw span overlaps placed gear, shrink from the moving edge toward the anchor until valid (or none).
 */
function computeMobileEmptyDragSpan(
  anchorU: number,
  fingerU: number,
  placedBlocks: PlacedBlock[],
  rackUnitsU: number,
): { startUnit: number; size: number } | null {
  let bottomU = Math.min(anchorU, fingerU);
  let topU = Math.max(anchorU, fingerU);
  bottomU = Math.max(1, Math.min(rackUnitsU, bottomU));
  topU = Math.max(1, Math.min(rackUnitsU, topU));
  if (bottomU > topU) {
    return null;
  }
  let b = bottomU;
  let t = topU;
  while (b <= t) {
    const size = t - b + 1;
    const startUnit = t;
    if (isPlaceValidForNewBlock(startUnit, size, placedBlocks)) {
      return { startUnit, size };
    }
    if (fingerU > anchorU) {
      t -= 1;
    } else if (fingerU < anchorU) {
      b += 1;
    } else {
      break;
    }
  }
  return null;
}

/**
 * If the topmost DOM node under the pointer is inside a placed device, the user is
 * interacting with that block — not empty rack space (avoids slot-row clicks “through” blocks).
 */
function isPlacedBlockTopHit(clientX: number, clientY: number): boolean {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }
  try {
    const el = document.elementFromPoint(clientX, clientY);
    return Boolean(el?.closest('.placed-block'));
  } catch {
    return false;
  }
}

const PROJECT_STORAGE_KEY = 'eazerack_project';

type StoredProjectData = {
  /** Total rack height in U (whole units). Legacy: was string `"42U"` or number. */
  rackUnitsU?: number;
  placedBlocks?: PlacedBlock[];
  /** Plain-text notes for the entire rack (MVP; future PDF/export). */
  rackNotes?: string;
  /** Project-level label for exports and context. */
  projectName?: string;
  rackDescription?: string;
  technicianName?: string;
  rackIdentity?: RackIdentity;
};

function parseStoredRackIdentity(raw: unknown): RackIdentity | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? o[k] : '');

  if ('rackLocation' in o) {
    const rackLocation = str('rackLocation');
    const rackNumber = str('rackNumber');
    if (!rackLocation.trim() && !rackNumber.trim()) {
      return null;
    }
    return { rackLocation, rackNumber };
  }

  const legacyLoc = str('location');
  const legacyRoom = str('room');
  const legacyBay = str('bay');
  const legacyNum = str('rackNumber');
  const pieces: string[] = [];
  if (legacyLoc.trim()) {
    pieces.push(legacyLoc.trim());
  }
  if (legacyRoom.trim()) {
    pieces.push(`Room ${legacyRoom.trim()}`);
  }
  if (legacyBay.trim()) {
    pieces.push(`Bay ${legacyBay.trim()}`);
  }
  const mergedLocation = pieces.join(' – ');
  if (!mergedLocation && !legacyNum.trim()) {
    return null;
  }
  return { rackLocation: mergedLocation, rackNumber: legacyNum.trim() };
}

/** Write current layout to localStorage (auto-save + manual Save Layout). `rackHeight` stores U count as number. */
function persistProjectLayout(
  rackUnitsU: number,
  placedBlocks: PlacedBlock[],
  rackNotes: string,
  projectName: string,
  rackDescription: string,
  technicianName: string,
  rackIdentity: RackIdentity,
): void {
  localStorage.setItem(
    PROJECT_STORAGE_KEY,
    JSON.stringify({
      rackHeight: rackUnitsU,
      placedBlocks,
      rackNotes,
      projectName,
      rackDescription,
      technicianName,
      rackIdentity,
    }),
  );
}

/** Read and validate saved project JSON from localStorage (shared by manual Load and initial hydrate). */
function readStoredProjectFromLocalStorage(): StoredProjectData | null {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {
      rackHeight?: unknown;
      placedBlocks?: unknown;
      rackNotes?: unknown;
      projectName?: unknown;
      rackDescription?: unknown;
      technicianName?: unknown;
      rackIdentity?: unknown;
    };
    const out: StoredProjectData = {};
    const units = parseStoredRackUnits(parsed.rackHeight);
    if (units !== null) {
      out.rackUnitsU = units;
    }
    if (Array.isArray(parsed.placedBlocks)) {
      out.placedBlocks = parsed.placedBlocks as PlacedBlock[];
    }
    if (typeof parsed.rackNotes === 'string') {
      out.rackNotes = parsed.rackNotes;
    }
    if (typeof parsed.projectName === 'string') {
      out.projectName = parsed.projectName;
    }
    if (typeof parsed.rackDescription === 'string') {
      out.rackDescription = parsed.rackDescription;
    }
    if (typeof parsed.technicianName === 'string') {
      out.technicianName = parsed.technicianName;
    }
    const rid = parseStoredRackIdentity(parsed.rackIdentity);
    if (rid) {
      out.rackIdentity = rid;
    }
    return out;
  } catch {
    return null;
  }
}

/** Matches responsive CSS `(max-width: 900px)` — stacked layout / touch-first placement. */
function useIsMobileLayout(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = () => setMatches(mq.matches);
    mq.addEventListener('change', handler);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return matches;
}

export type RackBuilderProps = {
  className?: string;
  /** Merged on mount after optional localStorage hydrate. */
  initialProject?: Partial<RackProjectData>;
  /** When true (default), auto-save and manual save use localStorage. Set false when a host app owns persistence. */
  persistToLocalStorage?: boolean;
  /** Fires after hydration and on every subsequent project state change. */
  onProjectChange?: (project: RackProjectData) => void;
  /** Return `false` to cancel the built-in PDF download. */
  onBeforeExportPdf?: (info: {
    project: RackProjectData;
    filename: string;
  }) => void | boolean | Promise<void | boolean>;
  /** Return `false` to cancel the built-in Excel download. */
  onBeforeExportExcel?: (info: {
    project: RackProjectData;
    filename: string;
    rowCount: number;
  }) => void | boolean | Promise<void | boolean>;
  /** Standalone shell header “EazeRack”. */
  showAppHeader?: boolean;
  /** When false, omit full-viewport `.page` shell so the module fits a host container. */
  fullPageLayout?: boolean;
};

export type RackBuilderHandle = {
  getProject: () => RackProjectData;
  /** PDF then Excel (same as primary Export action). */
  exportBoth: () => Promise<void>;
  exportPdf: () => Promise<void>;
  exportExcel: () => Promise<void>;
};

export const RackBuilder = forwardRef<RackBuilderHandle, RackBuilderProps>(function RackBuilder(
  {
    className,
    initialProject,
    persistToLocalStorage = true,
    onProjectChange,
    onBeforeExportPdf,
    onBeforeExportExcel,
    showAppHeader = true,
    fullPageLayout = true,
  },
  ref,
) {
  const [rackUnitsU, setRackUnitsU] = useState(DEFAULT_RACK_UNITS);
  const [rackHeightMode, setRackHeightMode] = useState<'standard42' | 'custom'>('standard42');
  /** Draft value for custom rack height input — applied only via Apply / Enter, not while typing. */
  const [customRackDraftU, setCustomRackDraftU] = useState(String(DEFAULT_RACK_UNITS));
  const [customRackHeightError, setCustomRackHeightError] = useState<string | null>(null);
  /** Mobile: full rack height editor vs compact summary (desktop ignores). */
  const [rackHeightMobileExpanded, setRackHeightMobileExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    if (!persistToLocalStorage) {
      return false;
    }
    return readStoredProjectFromLocalStorage() === null;
  });
  const [hydrated, setHydrated] = useState(false);
  const [selectedBlockSize, setSelectedBlockSize] = useState<number>(1);
  /** Device type used for the next palette/drag/tap placement (updated when a block is saved from the details modal). */
  const [armedDeviceType, setArmedDeviceType] = useState<DeviceType>('Switch');
  /** Plain-text notes for the whole rack (persisted with layout). */
  const [rackNotes, setRackNotes] = useState('');
  /** Project-level name for exports (persisted with layout). */
  const [projectName, setProjectName] = useState('');
  const [rackDescription, setRackDescription] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [rackIdentity, setRackIdentity] = useState<RackIdentity>(EMPTY_RACK_IDENTITY);
  const [placedBlocks, setPlacedBlocks] = useState<PlacedBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [draggingBlockSize, setDraggingBlockSize] = useState<number | null>(null);
  /** Pointer = vertical center of the palette block; preview + drop use the same `previewStartUnit`. */
  const [paletteRackHover, setPaletteRackHover] = useState<{
    centerUnitFloat: number;
    previewStartUnit: number;
  } | null>(null);
  const [paletteFloatingGhostPos, setPaletteFloatingGhostPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [resizeSession, setResizeSession] = useState<{
    blockId: number;
    startY: number;
    startSize: number;
  } | null>(null);
  const [moveSession, setMoveSession] = useState<{
    blockId: number;
    startY: number;
    startStartUnit: number;
  } | null>(null);
  const [detailsModal, setDetailsModal] = useState<{
    mode: 'create' | 'edit';
    blockId: number;
  } | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<{
    deviceType: DeviceType;
    deviceName: string;
    serialNumber: string;
    macAddress: string;
    assetTag: string;
    openPorts: string;
    notes: string;
  }>({
    deviceType: 'Switch',
    deviceName: '',
    serialNumber: '',
    macAddress: '',
    assetTag: '',
    openPorts: '',
    notes: '',
  });
  const [deviceTypeSelectorOpen, setDeviceTypeSelectorOpen] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [saveToastKey, setSaveToastKey] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const deviceTypeSelectorRef = useRef<HTMLDivElement>(null);
  const handleDetailsCancelRef = useRef<() => void>(() => {});
  /** True when the current pointer gesture began on the details dialog (e.g. text selection in a field). */
  const detailsModalPointerDownStartedInsideRef = useRef(false);
  const layoutAutoSaveSkipMount = useRef(true);
  const manualSavePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveToastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rackGridRef = useRef<HTMLDivElement>(null);
  const rackFrameRef = useRef<HTMLDivElement>(null);
  const rackScrollContainerRef = useRef<HTMLDivElement>(null);
  const previousRackScrollOverflowRef = useRef<string | null>(null);
  const pdfExportRef = useRef<HTMLDivElement>(null);
  const pdfExportDateRef = useRef<HTMLSpanElement>(null);
  const isMobileLayout = useIsMobileLayout();
  /** Mobile: job info panel (notes column) expanded vs collapsed; desktop ignores. */
  const [mobileJobInfoExpanded, setMobileJobInfoExpanded] = useState(false);
  /** Mobile: temporary pre-placement RU span selection on empty rack; release commits via `placeBlockAt`. */
  const [mobileEmptyDragPreview, setMobileEmptyDragPreview] = useState<{
    startUnit: number;
    size: number;
  } | null>(null);
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const palettePointerSessionRef = useRef<{ pointerId: number; blockSize: number } | null>(null);
  /** After a move/resize drag, suppress the synthetic click so it does not change selection. */
  const moveSessionDragRef = useRef(false);
  const resizeSessionDragRef = useRef(false);
  const suppressNextPlacedBlockClickRef = useRef(false);
  const suppressNextEmptyRackClickRef = useRef(false);
  const mobileEmptyDragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTimeMs: number;
    maxDistanceSq: number;
    anchorUnit: number;
    dragActivated: boolean;
    hasSizedDrag: boolean;
    initialTarget: Element;
  } | null>(null);
  const mobileEmptyDragPreviewRef = useRef<{ startUnit: number; size: number } | null>(null);
  const placedBlocksRef = useRef(placedBlocks);
  placedBlocksRef.current = placedBlocks;
  const rackUnitsURef = useRef(rackUnitsU);
  rackUnitsURef.current = rackUnitsU;
  const sizingHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentGestureStateRef = useRef<
    'IDLE' | 'PENDING_SIZING' | 'PENDING_MOVING' | 'SCROLL' | 'SIZING_ACTIVE' | 'MOVING_ACTIVE'
  >('IDLE');
  const mobilePlacedBlockLongPressCleanupRef = useRef<(() => void) | null>(null);
  const mobilePlacedBlockLastTapRef = useRef<{ blockId: number; time: number } | null>(null);
  const mobilePlacedBlockDoubleTapClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rackUnits = Array.from({ length: rackUnitsU }, (_, index) => rackUnitsU - index);
  const blockSizes = [1, 2] as const;

  const initialProjectRef = useRef(initialProject);
  initialProjectRef.current = initialProject;

  const onProjectChangeRef = useRef(onProjectChange);
  onProjectChangeRef.current = onProjectChange;

  const buildRackProjectSnapshot = useCallback((): RackProjectData => {
    return {
      rackHeightU: rackUnitsU,
      placedBlocks: placedBlocks.map((b) => ({ ...b })),
      rackNotes,
      projectName,
      rackDescription,
      technicianName,
      rackIdentity: { ...rackIdentity },
    };
  }, [rackUnitsU, placedBlocks, rackNotes, projectName, rackDescription, technicianName, rackIdentity]);

  const palettePreviewValid =
    draggingBlockSize !== null &&
    paletteRackHover !== null &&
    isPlaceValidForNewBlock(paletteRackHover.previewStartUnit, draggingBlockSize, placedBlocks);

  const paletteAnchorHighlightUnit =
    paletteRackHover === null
      ? null
      : Math.round(
          Math.min(rackUnitsU, Math.max(1, paletteRackHover.centerUnitFloat)),
        );

  const updatePaletteRackHoverFromClient = useCallback(
    (clientX: number, clientY: number) => {
      if (draggingBlockSize === null || !rackGridRef.current) {
        return;
      }
      const rect = rackGridRef.current.getBoundingClientRect();
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (!inside) {
        setPaletteRackHover(null);
        return;
      }
      const centerUnitFloat = centerUnitFromRackGridClientY(clientY, rect, rackUnitsU, RACK_UNIT_PX);
      const proposed = startUnitFromCenterAnchor(centerUnitFloat, draggingBlockSize);
      const previewStartUnit = nearestValidStartForNewBlock(
        proposed,
        draggingBlockSize,
        placedBlocks,
        rackUnitsU,
      );
      setPaletteRackHover({ centerUnitFloat, previewStartUnit });
    },
    [draggingBlockSize, placedBlocks, rackUnitsU],
  );

  const placePaletteBlockFromClient = useCallback(
    (clientX: number, clientY: number, blockSize: number): boolean => {
      if (!rackGridRef.current) {
        return false;
      }
      const rect = rackGridRef.current.getBoundingClientRect();
      if (isPlacedBlockTopHit(clientX, clientY)) {
        return false;
      }
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (!inside) {
        return false;
      }
      const centerUnitFloat = centerUnitFromRackGridClientY(clientY, rect, rackUnitsU, RACK_UNIT_PX);
      const proposed = startUnitFromCenterAnchor(centerUnitFloat, blockSize);
      const startUnit = nearestValidStartForNewBlock(proposed, blockSize, placedBlocks, rackUnitsU);
      return placeBlockAt(startUnit, blockSize);
    },
    [placedBlocks, rackUnitsU],
  );

  const placeBlockAt = (startUnit: number, blockSize: number): boolean => {
    if (!isPlaceValidForNewBlock(startUnit, blockSize, placedBlocks)) {
      return false;
    }

    const blockId = Date.now() + Math.floor(Math.random() * 1000);
    const typeForNewBlock = armedDeviceType;
    setPlacedBlocks((previousBlocks) => [
      ...previousBlocks,
      {
        id: blockId,
        startUnit,
        size: blockSize,
        deviceType: typeForNewBlock,
        deviceName: '',
        serialNumber: '',
        macAddress: '',
        assetTag: '',
        openPorts: '',
        notes: '',
      },
    ]);
    setActiveBlockId(blockId);
    setDetailsModal({ mode: 'create', blockId });
    setDetailsDraft({
      deviceType: typeForNewBlock,
      deviceName: '',
      serialNumber: '',
      macAddress: '',
      assetTag: '',
      openPorts: '',
      notes: '',
    });
    return true;
  };

  const placeBlockAtRef = useRef(placeBlockAt);
  placeBlockAtRef.current = placeBlockAt;

  const tryPlaceNewBlockFromPointer = (clientX: number, clientY: number, blockSize: number): boolean => {
    if (isPlacedBlockTopHit(clientX, clientY)) {
      return false;
    }
    if (!rackGridRef.current) {
      return false;
    }
    const rect = rackGridRef.current.getBoundingClientRect();
    const preview = getPlacementTapPreviewAtClient(
      clientX,
      clientY,
      rect,
      blockSize,
      placedBlocks,
      rackUnitsU,
    );
    if (!preview || !preview.valid) {
      return false;
    }
    return placeBlockAt(preview.previewStartUnit, blockSize);
  };

  const tryPlaceNewBlockFromPointerRef = useRef(tryPlaceNewBlockFromPointer);
  tryPlaceNewBlockFromPointerRef.current = tryPlaceNewBlockFromPointer;

  const handleDesktopRackEmptySlotClick = (clientX: number, clientY: number) => {
    if (isMobileLayout) {
      return;
    }
    tryPlaceNewBlockFromPointer(clientX, clientY, selectedBlockSize);
  };

  const setRackScrollLocked = (locked: boolean) => {
    const el = rackScrollContainerRef.current;
    if (!el) return;

    if (locked) {
      if (previousRackScrollOverflowRef.current === null) {
        previousRackScrollOverflowRef.current = el.style.overflowY || '';
      }
      el.style.overflowY = 'hidden';
    } else {
      if (previousRackScrollOverflowRef.current !== null) {
        el.style.overflowY = previousRackScrollOverflowRef.current;
        previousRackScrollOverflowRef.current = null;
      } else {
        el.style.overflowY = '';
      }
    }
  };

  const handleMobileEmptyRackPointerDown = useCallback(
    (event: PointerEvent) => {
      if (!isMobileLayout) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      if (isPlacedBlockTopHit(event.clientX, event.clientY)) {
        return;
      }
      const grid = rackGridRef.current;
      if (!grid) {
        return;
      }
      const rect = grid.getBoundingClientRect();
      const preview = getPlacementTapPreviewAtClient(
        event.clientX,
        event.clientY,
        rect,
        1,
        placedBlocks,
        rackUnitsU,
      );
      if (!preview || !preview.valid) {
        return;
      }
      mobileEmptyDragSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTimeMs: performance.now(),
        maxDistanceSq: 0,
        anchorUnit: preview.previewStartUnit,
        dragActivated: false,
        hasSizedDrag: false,
        initialTarget: event.target as Element,
      };
      if (sizingHoldTimerRef.current) {
        clearTimeout(sizingHoldTimerRef.current);
        sizingHoldTimerRef.current = null;
      }

      sizingHoldTimerRef.current = setTimeout(() => {
        const session = mobileEmptyDragSessionRef.current;
        if (!session || session.dragActivated) return;
        const holdSlopSq = MOBILE_EMPTY_SELECTION_HOLD_SLOP_PX * MOBILE_EMPTY_SELECTION_HOLD_SLOP_PX;
        if (session.maxDistanceSq > holdSlopSq) {
          mobileEmptyDragSessionRef.current = null;
          return;
        }
        session.dragActivated = true;
        setRackScrollLocked(true);
        const initialSelection = { startUnit: session.anchorUnit, size: 1 };
        mobileEmptyDragPreviewRef.current = initialSelection;
        setMobileEmptyDragPreview(initialSelection);
        try {
          session.initialTarget.setPointerCapture(session.pointerId);
        } catch {
          // ignore
        }
      }, MOBILE_EMPTY_SELECTION_HOLD_MS);
    },
    [isMobileLayout, placedBlocks, rackUnitsU],
  );

  const updateMobileEmptyRackSelectionFromClient = useCallback(
    (clientX: number, clientY: number, preventDefault: () => void) => {
      const session = mobileEmptyDragSessionRef.current;
      if (!session) {
        return;
      }
      const dx = clientX - session.startX;
      const dy = clientY - session.startY;
      session.maxDistanceSq = Math.max(session.maxDistanceSq, dx * dx + dy * dy);
      if (!session.dragActivated) {
        const holdSlopSq = MOBILE_EMPTY_SELECTION_HOLD_SLOP_PX * MOBILE_EMPTY_SELECTION_HOLD_SLOP_PX;
        if (session.maxDistanceSq > holdSlopSq) {
          if (sizingHoldTimerRef.current) {
            clearTimeout(sizingHoldTimerRef.current);
            sizingHoldTimerRef.current = null;
          }
          mobileEmptyDragSessionRef.current = null;
          mobileEmptyDragPreviewRef.current = null;
          setMobileEmptyDragPreview(null);
          setRackScrollLocked(false);
          return;
        }
        return;
      }

      const grid = rackGridRef.current;
      if (!grid) {
        if (session.dragActivated || session.hasSizedDrag) {
          preventDefault();
        }
        return;
      }
      const rect = grid.getBoundingClientRect();
      const cy = Math.max(rect.top, Math.min(rect.bottom, clientY));
      const centerFloat = centerUnitFromRackGridClientY(cy, rect, rackUnitsURef.current, RACK_UNIT_PX);
      const fingerU = Math.max(1, Math.min(rackUnitsURef.current, Math.round(centerFloat)));
      const preview = computeMobileEmptyDragSpan(
        session.anchorUnit,
        fingerU,
        placedBlocksRef.current,
        rackUnitsURef.current,
      );
      mobileEmptyDragPreviewRef.current = preview;
      setMobileEmptyDragPreview(preview);
      if (preview && (preview.size > 1 || Math.abs(dy) > MOBILE_RACK_TAP_MAX_SLOP_PX)) {
        session.hasSizedDrag = true;
      }
      if (session.dragActivated || session.hasSizedDrag) {
        preventDefault();
      }
    },
    [],
  );

  const handleMobileEmptyRackPointerMove = useCallback(
    (event: PointerEvent) => {
      const session = mobileEmptyDragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      updateMobileEmptyRackSelectionFromClient(event.clientX, event.clientY, () => event.preventDefault());
    },
    [updateMobileEmptyRackSelectionFromClient],
  );

  const finishMobileEmptyRackSelection = useCallback((clientX: number, clientY: number, pointerId?: number) => {
    if (sizingHoldTimerRef.current) {
      clearTimeout(sizingHoldTimerRef.current);
      sizingHoldTimerRef.current = null;
    }
    setRackScrollLocked(false);
    const session = mobileEmptyDragSessionRef.current;
    if (!session || (pointerId !== undefined && pointerId !== session.pointerId)) {
      return;
    }
    const previewSnapshot = mobileEmptyDragPreviewRef.current;
    const tapSlopSq = MOBILE_RACK_TAP_MAX_SLOP_PX * MOBILE_RACK_TAP_MAX_SLOP_PX;
    const durationMs = performance.now() - session.startTimeMs;

    currentGestureStateRef.current = 'IDLE';

    mobileEmptyDragSessionRef.current = null;
    mobileEmptyDragPreviewRef.current = null;
    setMobileEmptyDragPreview(null);
    suppressNextEmptyRackClickRef.current = true;

    const commitSizedPlacement =
      session.hasSizedDrag &&
      previewSnapshot &&
      (session.dragActivated ||
        previewSnapshot.size > 1 ||
        session.maxDistanceSq > tapSlopSq);

    if (
      commitSizedPlacement &&
      typeof placeBlockAtRef.current === 'function' &&
      isPlaceValidForNewBlock(
        previewSnapshot.startUnit,
        previewSnapshot.size,
        placedBlocksRef.current,
      )
    ) {
      placeBlockAtRef.current(previewSnapshot.startUnit, previewSnapshot.size);
    } else if (
      !session.dragActivated &&
      durationMs >= MOBILE_RACK_TAP_MIN_MS &&
      durationMs <= MOBILE_RACK_TAP_MAX_MS &&
      session.maxDistanceSq <= tapSlopSq &&
      !isPlacedBlockTopHit(clientX, clientY)
    ) {
      const tryPlace = tryPlaceNewBlockFromPointerRef.current;
      if (typeof tryPlace === 'function') {
        void tryPlace(clientX, clientY, 1);
      }
    }

    try {
      const target = session.initialTarget;
      if (target.hasPointerCapture(session.pointerId)) {
        target.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Ignore.
    }
  }, []);

  const handleMobileEmptyRackPointerEnd = useCallback((event: PointerEvent) => {
    finishMobileEmptyRackSelection(event.clientX, event.clientY, event.pointerId);
  }, [finishMobileEmptyRackSelection]);

  const handleMobileEmptyRackPointerCancel = useCallback((event: PointerEvent) => {
    const session = mobileEmptyDragSessionRef.current;
    if (session?.dragActivated) {
      return;
    }
    if (sizingHoldTimerRef.current) {
      clearTimeout(sizingHoldTimerRef.current);
      sizingHoldTimerRef.current = null;
    }

    setRackScrollLocked(false);
    mobileEmptyDragSessionRef.current = null;
    mobileEmptyDragPreviewRef.current = null;
    setMobileEmptyDragPreview(null);

    try {
      const target = session?.initialTarget ?? (event.target as Element);
      if (target.hasPointerCapture(event.pointerId)) {
        target.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleMobileEmptyRackTouchMove = useCallback(
    (event: TouchEvent) => {
      const session = mobileEmptyDragSessionRef.current;
      if (!session || event.touches.length === 0) {
        return;
      }
      const touch = event.touches[0];
      updateMobileEmptyRackSelectionFromClient(touch.clientX, touch.clientY, () => event.preventDefault());
    },
    [updateMobileEmptyRackSelectionFromClient],
  );

  const handleMobileEmptyRackTouchEnd = useCallback(
    (event: TouchEvent) => {
      const session = mobileEmptyDragSessionRef.current;
      if (!session) {
        return;
      }
      const touch = event.changedTouches[0];
      finishMobileEmptyRackSelection(
        touch?.clientX ?? session.startX,
        touch?.clientY ?? session.startY,
      );
    },
    [finishMobileEmptyRackSelection],
  );

  const handleMobileEmptyRackTouchCancel = useCallback(() => {
    if (sizingHoldTimerRef.current) {
      clearTimeout(sizingHoldTimerRef.current);
      sizingHoldTimerRef.current = null;
    }

    setRackScrollLocked(false);
    mobileEmptyDragSessionRef.current = null;
    mobileEmptyDragPreviewRef.current = null;
    setMobileEmptyDragPreview(null);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) return;
    const grid = rackGridRef.current;
    if (!grid) return;

    grid.addEventListener('pointerdown', handleMobileEmptyRackPointerDown, { passive: true });
    grid.addEventListener('pointermove', handleMobileEmptyRackPointerMove, { passive: false });
    grid.addEventListener('pointerup', handleMobileEmptyRackPointerEnd);
    grid.addEventListener('pointercancel', handleMobileEmptyRackPointerCancel);
    grid.addEventListener('touchmove', handleMobileEmptyRackTouchMove, { passive: false });
    grid.addEventListener('touchend', handleMobileEmptyRackTouchEnd);
    grid.addEventListener('touchcancel', handleMobileEmptyRackTouchCancel);

    return () => {
      grid.removeEventListener('pointerdown', handleMobileEmptyRackPointerDown);
      grid.removeEventListener('pointermove', handleMobileEmptyRackPointerMove);
      grid.removeEventListener('pointerup', handleMobileEmptyRackPointerEnd);
      grid.removeEventListener('pointercancel', handleMobileEmptyRackPointerCancel);
      grid.removeEventListener('touchmove', handleMobileEmptyRackTouchMove);
      grid.removeEventListener('touchend', handleMobileEmptyRackTouchEnd);
      grid.removeEventListener('touchcancel', handleMobileEmptyRackTouchCancel);
    };
  }, [
    isMobileLayout,
    handleMobileEmptyRackPointerDown,
    handleMobileEmptyRackPointerMove,
    handleMobileEmptyRackPointerEnd,
    handleMobileEmptyRackPointerCancel,
    handleMobileEmptyRackTouchMove,
    handleMobileEmptyRackTouchEnd,
    handleMobileEmptyRackTouchCancel,
  ]);

  const handlePalettePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, size: number) => {
    if (isMobileLayout || event.button !== 0) {
      return;
    }
    palettePointerSessionRef.current = { pointerId: event.pointerId, blockSize: size };
    setSelectedBlockSize(size);
    setDraggingBlockSize(size);
    lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
    setPaletteFloatingGhostPos({ x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No-op if capture is unavailable for this pointer target.
    }
  };

  const clearManualSaveTimers = useCallback(() => {
    if (manualSavePersistTimerRef.current !== null) {
      window.clearTimeout(manualSavePersistTimerRef.current);
      manualSavePersistTimerRef.current = null;
    }
  }, []);

  const showManualSaveToast = useCallback(() => {
    if (saveToastHideTimerRef.current !== null) {
      window.clearTimeout(saveToastHideTimerRef.current);
      saveToastHideTimerRef.current = null;
    }
    setSaveToastKey((key) => key + 1);
    setSaveToastVisible(true);
    saveToastHideTimerRef.current = window.setTimeout(() => {
      setSaveToastVisible(false);
      saveToastHideTimerRef.current = null;
    }, 1500);
  }, []);

  const handleSaveLayout = useCallback(() => {
    clearManualSaveTimers();
    setIsManualSaving(true);
    // Defer persistence briefly so the busy state can paint before the synchronous write.
    manualSavePersistTimerRef.current = window.setTimeout(() => {
      if (persistToLocalStorage) {
        persistProjectLayout(
          rackUnitsU,
          placedBlocks,
          rackNotes,
          projectName,
          rackDescription,
          technicianName,
          rackIdentity,
        );
      }
      onProjectChangeRef.current?.(buildRackProjectSnapshot());
      setIsManualSaving(false);
      showManualSaveToast();
      manualSavePersistTimerRef.current = null;
    }, 50);
  }, [
    clearManualSaveTimers,
    persistToLocalStorage,
    rackUnitsU,
    placedBlocks,
    rackNotes,
    projectName,
    rackDescription,
    technicianName,
    rackIdentity,
    buildRackProjectSnapshot,
    showManualSaveToast,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (!pdfExportRef.current) {
      return;
    }
    const dateStr = new Date().toLocaleDateString('en-CA');
    if (pdfExportDateRef.current) {
      pdfExportDateRef.current.textContent = `Generated on: ${dateStr}`;
    }
    const filename = buildExportFilename({
      projectName,
      rackLocation: rackIdentity.rackLocation,
      rackNumber: rackIdentity.rackNumber,
    });
    if (onBeforeExportPdf) {
      const gate = await onBeforeExportPdf({
        project: buildRackProjectSnapshot(),
        filename,
      });
      if (gate === false) {
        return;
      }
    }
    await exportRackElementToPdf(pdfExportRef.current, filename);
  }, [
    projectName,
    rackIdentity.rackLocation,
    rackIdentity.rackNumber,
    onBeforeExportPdf,
    buildRackProjectSnapshot,
  ]);

  const handleExportExcel = useCallback(async () => {
    const dateStr = new Date().toLocaleDateString('en-CA');
    const orderedBlocks = [...placedBlocks].sort((a, b) => b.startUnit - a.startUnit || a.id - b.id);
    const rows = orderedBlocks.map((block) => {
      const survey = deviceTypeUsesSurveyMetadata(block.deviceType);
      return {
        'Project Name': projectName.trim(),
        'Rack Location': rackIdentity.rackLocation.trim(),
        'Rack Number': rackIdentity.rackNumber.trim(),
        'Rack Units': formatRackUnitsForExcel(block),
        'Device Type': block.deviceType,
        'Device Name': block.deviceName.trim(),
        'Serial Number': survey ? block.serialNumber.trim() : '',
        'MAC Address': survey ? block.macAddress.trim() : '',
        'Asset Tag': survey ? block.assetTag.trim() : '',
        'Technician Name': technicianName.trim(),
        'Export Date': dateStr,
      };
    });

    const pdfLike = buildExportFilename({
      projectName,
      rackLocation: rackIdentity.rackLocation,
      rackNumber: rackIdentity.rackNumber,
    });
    const base = pdfLike.replace(/\.pdf$/i, '');
    const filename = `${base}_Survey.xlsx`;
    if (onBeforeExportExcel) {
      const gate = await Promise.resolve(
        onBeforeExportExcel({
          project: buildRackProjectSnapshot(),
          filename,
          rowCount: rows.length,
        }),
      );
      if (gate === false) {
        return;
      }
    }
    exportRackSurveyToExcel(rows, filename);
  }, [
    placedBlocks,
    projectName,
    rackIdentity.rackLocation,
    rackIdentity.rackNumber,
    technicianName,
    onBeforeExportExcel,
    buildRackProjectSnapshot,
  ]);

  const handleExportBoth = useCallback(async () => {
    await handleExportPdf();
    await handleExportExcel();
  }, [handleExportPdf, handleExportExcel]);

  useImperativeHandle(
    ref,
    () => ({
      getProject: () => buildRackProjectSnapshot(),
      exportBoth: () => handleExportBoth(),
      exportPdf: () => handleExportPdf(),
      exportExcel: () => handleExportExcel(),
    }),
    [buildRackProjectSnapshot, handleExportBoth, handleExportPdf, handleExportExcel],
  );

  const applyRackUnitsU = useCallback((nextUnits: number) => {
    const u = clampRackUnits(nextUnits);
    setRackUnitsU(u);
    setPlacedBlocks((blocks) => filterPlacedBlocksForRackUnits(blocks, u));
    setResizeSession(null);
    setMoveSession(null);
  }, []);

  const applyCustomRackFromDraft = useCallback(() => {
    setCustomRackHeightError(null);
    const trimmed = customRackDraftU.trim();
    if (trimmed === '') {
      setCustomRackHeightError(`Enter a rack height (${MIN_RACK_UNITS}–${MAX_RACK_UNITS} U).`);
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n) || !Number.isFinite(n)) {
      setCustomRackHeightError('Enter a whole number.');
      return;
    }
    if (n < MIN_RACK_UNITS || n > MAX_RACK_UNITS) {
      setCustomRackHeightError(`Use a number between ${MIN_RACK_UNITS} and ${MAX_RACK_UNITS}.`);
      return;
    }
    applyRackUnitsU(n);
    setCustomRackDraftU(String(n));
    if (isMobileLayout) {
      setRackHeightMobileExpanded(false);
    }
  }, [customRackDraftU, applyRackUnitsU, isMobileLayout]);

  const handleCustomRackDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCustomRackHeightError(null);
    const digitsOnly = event.target.value.replace(/\D/g, '');
    setCustomRackDraftU(digitsOnly);
  };

  const handleCustomRackDraftKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCustomRackFromDraft();
    }
  };

  const handleLoadLayout = () => {
    if (!persistToLocalStorage) {
      return;
    }
    const data = readStoredProjectFromLocalStorage();
    if (!data) {
      return;
    }

    const units = data.rackUnitsU ?? DEFAULT_RACK_UNITS;
    setRackUnitsU(units);
    setRackHeightMode(units === DEFAULT_RACK_UNITS ? 'standard42' : 'custom');
    setCustomRackDraftU(String(units));
    setCustomRackHeightError(null);
    if (data.placedBlocks) {
      setPlacedBlocks(normalizePlacedBlocksForSurvey(filterPlacedBlocksForRackUnits(data.placedBlocks, units)));
    }
    setRackNotes(data.rackNotes ?? '');
    setProjectName(data.projectName ?? '');
    setRackDescription(data.rackDescription ?? '');
    setTechnicianName(data.technicianName ?? '');
    setRackIdentity(data.rackIdentity ?? EMPTY_RACK_IDENTITY);

    // Clear selection/editing sessions to avoid stale UI.
    setActiveBlockId(null);
    setResizeSession(null);
    setMoveSession(null);
    setDetailsModal(null);
    setRackHeightMobileExpanded(false);
  };

  const handleClearRack = () => {
    const hasRackSpecificContent =
      placedBlocks.length > 0 ||
      rackNotes.trim() !== '' ||
      rackDescription.trim() !== '' ||
      rackIdentity.rackNumber.trim() !== '' ||
      rackIdentity.rackLocation.trim() !== '';
    if (!hasRackSpecificContent) {
      return;
    }
    if (
      !window.confirm(
        'Clear rack devices, rack identification (location & number), notes, and rack description? Project name and technician are kept.',
      )
    ) {
      return;
    }
    setPlacedBlocks([]);
    setRackNotes('');
    setRackDescription('');
    setRackIdentity(EMPTY_RACK_IDENTITY);
    setActiveBlockId(null);
    setResizeSession(null);
    setMoveSession(null);
    setDetailsModal(null);
    setRackHeightMobileExpanded(false);
  };

  const handleClearProject = () => {
    if (
      !window.confirm(
        'Reset the entire project? All metadata, rack fields, notes, and devices will be cleared. Rack height (U) is unchanged.',
      )
    ) {
      return;
    }
    setProjectName('');
    setTechnicianName('');
    setRackDescription('');
    setRackNotes('');
    setRackIdentity(EMPTY_RACK_IDENTITY);
    setPlacedBlocks([]);
    setActiveBlockId(null);
    setResizeSession(null);
    setMoveSession(null);
    setDetailsModal(null);
    setRackHeightMobileExpanded(false);
  };

  useEffect(() => {
    let units = DEFAULT_RACK_UNITS;
    let blocks: PlacedBlock[] = [];
    let notes = '';
    let pname = '';
    let rdesc = '';
    let tech = '';
    let rid: RackIdentity = { ...EMPTY_RACK_IDENTITY };
    let rackHeightModeVal: 'standard42' | 'custom' = 'standard42';
    let customDraft = String(DEFAULT_RACK_UNITS);

    if (persistToLocalStorage) {
      const data = readStoredProjectFromLocalStorage();
      if (data) {
        units = data.rackUnitsU ?? DEFAULT_RACK_UNITS;
        rackHeightModeVal = units === DEFAULT_RACK_UNITS ? 'standard42' : 'custom';
        customDraft = String(units);
        if (data.placedBlocks) {
          blocks = normalizePlacedBlocksForSurvey(
            filterPlacedBlocksForRackUnits(data.placedBlocks, units),
          );
        }
        notes = data.rackNotes ?? '';
        pname = data.projectName ?? '';
        rdesc = data.rackDescription ?? '';
        tech = data.technicianName ?? '';
        rid = data.rackIdentity ?? EMPTY_RACK_IDENTITY;
      }
    }

    const p = initialProjectRef.current;
    if (p) {
      if (p.rackHeightU !== undefined) {
        units = clampRackUnits(p.rackHeightU);
        rackHeightModeVal = units === DEFAULT_RACK_UNITS ? 'standard42' : 'custom';
        customDraft = String(units);
      }
      if (p.placedBlocks !== undefined) {
        blocks = normalizePlacedBlocksForSurvey(filterPlacedBlocksForRackUnits(p.placedBlocks, units));
      }
      if (p.rackNotes !== undefined) {
        notes = p.rackNotes;
      }
      if (p.projectName !== undefined) {
        pname = p.projectName;
      }
      if (p.rackDescription !== undefined) {
        rdesc = p.rackDescription;
      }
      if (p.technicianName !== undefined) {
        tech = p.technicianName;
      }
      if (p.rackIdentity !== undefined) {
        rid = {
          rackLocation: p.rackIdentity.rackLocation ?? rid.rackLocation,
          rackNumber: p.rackIdentity.rackNumber ?? rid.rackNumber,
        };
      }
    }

    setRackUnitsU(units);
    setRackHeightMode(rackHeightModeVal);
    setCustomRackDraftU(customDraft);
    setCustomRackHeightError(null);
    setPlacedBlocks(blocks);
    setRackNotes(notes);
    setProjectName(pname);
    setRackDescription(rdesc);
    setTechnicianName(tech);
    setRackIdentity(rid);
    setHydrated(true);
  }, [persistToLocalStorage]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    onProjectChangeRef.current?.(buildRackProjectSnapshot());
  }, [hydrated, buildRackProjectSnapshot, rackUnitsU, placedBlocks, rackNotes, projectName, rackDescription, technicianName, rackIdentity]);

  useEffect(() => {
    if (!isMobileLayout) {
      lastPointerClientRef.current = null;
      if (sizingHoldTimerRef.current) {
        clearTimeout(sizingHoldTimerRef.current);
        sizingHoldTimerRef.current = null;
      }
      setRackScrollLocked(false);
      currentGestureStateRef.current = 'IDLE';
      mobileEmptyDragSessionRef.current = null;
      mobileEmptyDragPreviewRef.current = null;
      setMobileEmptyDragPreview(null);
    }
  }, [isMobileLayout]);

  useEffect(() => {
    if (!persistToLocalStorage) {
      return;
    }
    if (layoutAutoSaveSkipMount.current) {
      layoutAutoSaveSkipMount.current = false;
      return;
    }
    persistProjectLayout(
      rackUnitsU,
      placedBlocks,
      rackNotes,
      projectName,
      rackDescription,
      technicianName,
      rackIdentity,
    );
  }, [
    persistToLocalStorage,
    rackUnitsU,
    placedBlocks,
    rackNotes,
    projectName,
    rackDescription,
    technicianName,
    rackIdentity,
  ]);

  useEffect(() => {
    setActiveBlockId((id) => {
      if (id === null) {
        return null;
      }
      return placedBlocks.some((b) => b.id === id) ? id : null;
    });
    setDetailsModal((modal) => {
      if (!modal) {
        return null;
      }
      return placedBlocks.some((b) => b.id === modal.blockId) ? modal : null;
    });
  }, [placedBlocks]);

  useEffect(() => {
    return () => {
      clearManualSaveTimers();
      if (saveToastHideTimerRef.current !== null) {
        window.clearTimeout(saveToastHideTimerRef.current);
      }
    };
  }, [clearManualSaveTimers]);

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }
    const onDocPointerDown = (event: PointerEvent) => {
      const node = exportMenuRef.current;
      if (node && !node.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  const handleDeleteBlock = (blockId: number) => {
    setPlacedBlocks((previousBlocks) => previousBlocks.filter((block) => block.id !== blockId));
    setActiveBlockId((currentActiveBlockId) =>
      currentActiveBlockId === blockId ? null : currentActiveBlockId,
    );
    setResizeSession((session) => (session?.blockId === blockId ? null : session));
    setMoveSession((session) => (session?.blockId === blockId ? null : session));
    setDetailsModal((modal) => (modal?.blockId === blockId ? null : modal));
  };

  const openDetailsModalEdit = (blockId: number) => {
    const block = placedBlocks.find((b) => b.id === blockId);
    if (!block) {
      return;
    }
    setDetailsModal({ mode: 'edit', blockId });
    setDetailsDraft({
      deviceType: block.deviceType,
      deviceName: block.deviceName,
      serialNumber: block.serialNumber ?? '',
      macAddress: block.macAddress ?? '',
      assetTag: block.assetTag ?? '',
      openPorts: block.openPorts ?? '',
      notes: block.notes,
    });
  };

  const clearMobilePlacedBlockLongPressSetup = () => {
    if (movingHoldTimerRef.current !== null) {
      window.clearTimeout(movingHoldTimerRef.current);
      movingHoldTimerRef.current = null;
      if (
        currentGestureStateRef.current === 'PENDING_MOVING' ||
        currentGestureStateRef.current === 'MOVING_ACTIVE'
      ) {
        currentGestureStateRef.current = 'IDLE';
      }
    }
    mobilePlacedBlockLongPressCleanupRef.current?.();
    mobilePlacedBlockLongPressCleanupRef.current = null;
  };

  const onPlacedBlockPointerDownMobile = (
    event: React.PointerEvent<HTMLDivElement>,
    block: PlacedBlock,
  ) => {
    const startY = event.clientY;
    const pointerId = event.pointerId;
    clearMobilePlacedBlockLongPressSetup();

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      if (Math.abs(ev.clientY - startY) > MOBILE_PLACED_BLOCK_LONG_PRESS_SLOP_PX) {
        clearMobilePlacedBlockLongPressSetup();
      }
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      clearMobilePlacedBlockLongPressSetup();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);

    mobilePlacedBlockLongPressCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    currentGestureStateRef.current = 'PENDING_MOVING';
    movingHoldTimerRef.current = window.setTimeout(() => {
      movingHoldTimerRef.current = null;
      mobilePlacedBlockLongPressCleanupRef.current?.();
      mobilePlacedBlockLongPressCleanupRef.current = null;
      if (currentGestureStateRef.current !== 'PENDING_MOVING') {
        return;
      }
      currentGestureStateRef.current = 'MOVING_ACTIVE';
      if (mobilePlacedBlockDoubleTapClearTimerRef.current !== null) {
        window.clearTimeout(mobilePlacedBlockDoubleTapClearTimerRef.current);
        mobilePlacedBlockDoubleTapClearTimerRef.current = null;
      }
      mobilePlacedBlockLastTapRef.current = null;
      suppressNextPlacedBlockClickRef.current = true;
      moveSessionDragRef.current = false;
      setMoveSession({
        blockId: block.id,
        startY,
        startStartUnit: block.startUnit,
      });
    }, MOBILE_PLACED_BLOCK_LONG_PRESS_MS);
  };

  useEffect(() => {
    return () => {
      if (movingHoldTimerRef.current !== null) {
        window.clearTimeout(movingHoldTimerRef.current);
        movingHoldTimerRef.current = null;
      }
      mobilePlacedBlockLongPressCleanupRef.current?.();
      mobilePlacedBlockLongPressCleanupRef.current = null;
      if (mobilePlacedBlockDoubleTapClearTimerRef.current !== null) {
        window.clearTimeout(mobilePlacedBlockDoubleTapClearTimerRef.current);
        mobilePlacedBlockDoubleTapClearTimerRef.current = null;
      }
    };
  }, []);

  const handleDetailsSave = () => {
    if (!detailsModal) {
      return;
    }
    setPlacedBlocks((previousBlocks) =>
      previousBlocks.map((block) =>
        block.id === detailsModal.blockId
          ? {
              ...block,
              deviceType: detailsDraft.deviceType,
              deviceName: detailsDraft.deviceName,
              serialNumber: detailsDraft.serialNumber,
              macAddress: detailsDraft.macAddress,
              assetTag: detailsDraft.assetTag,
              openPorts: detailsDraft.deviceType === 'Patch Panel' ? detailsDraft.openPorts : '',
              notes: detailsDraft.notes,
            }
          : block,
      ),
    );
    setArmedDeviceType(detailsDraft.deviceType);
    setDetailsModal(null);
  };

  const handleDetailsCancel = () => {
    if (!detailsModal) {
      return;
    }
    if (detailsModal.mode === 'create') {
      handleDeleteBlock(detailsModal.blockId);
    } else {
      setDetailsModal(null);
    }
  };

  handleDetailsCancelRef.current = handleDetailsCancel;

  useEffect(() => {
    if (detailsModal) {
      detailsModalPointerDownStartedInsideRef.current = false;
    }
  }, [detailsModal]);

  const handleDetailsModalBackdropPointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget) {
      detailsModalPointerDownStartedInsideRef.current = false;
    }
  };

  const handleDetailsModalSurfacePointerDownCapture = () => {
    detailsModalPointerDownStartedInsideRef.current = true;
  };

  const handleDetailsModalBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (detailsModalPointerDownStartedInsideRef.current) {
      detailsModalPointerDownStartedInsideRef.current = false;
      return;
    }
    handleDetailsCancel();
  };

  useEffect(() => {
    if (!resizeSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const deltaY = event.clientY - resizeSession.startY;
      if (Math.abs(deltaY) > 5) {
        resizeSessionDragRef.current = true;
      }
      const proposedSize = resizeSession.startSize + Math.round(deltaY / RACK_UNIT_PX);

      setPlacedBlocks((previousBlocks) => {
        const block = previousBlocks.find((b) => b.id === resizeSession.blockId);
        if (!block) {
          return previousBlocks;
        }
        const nextSize = nearestValidResize(block, proposedSize, previousBlocks);
        if (nextSize === block.size) {
          return previousBlocks;
        }
        return previousBlocks.map((b) =>
          b.id === resizeSession.blockId ? { ...b, size: nextSize } : b,
        );
      });
    };

    const endResize = () => {
      const blockId = resizeSession.blockId;
      if (resizeSessionDragRef.current) {
        suppressNextPlacedBlockClickRef.current = true;
      }
      resizeSessionDragRef.current = false;
      setResizeSession(null);
      setActiveBlockId(blockId);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    };
  }, [resizeSession]);

  useEffect(() => {
    if (!moveSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      const deltaY = event.clientY - moveSession.startY;
      if (Math.abs(deltaY) > 5) {
        moveSessionDragRef.current = true;
      }
      const proposedStartUnit = moveSession.startStartUnit - Math.round(deltaY / RACK_UNIT_PX);

      setPlacedBlocks((previousBlocks) => {
        const block = previousBlocks.find((b) => b.id === moveSession.blockId);
        if (!block) {
          return previousBlocks;
        }
        const nextStart = nearestValidMove(block, proposedStartUnit, previousBlocks, rackUnitsU);
        if (nextStart === block.startUnit) {
          return previousBlocks;
        }
        return previousBlocks.map((b) =>
          b.id === moveSession.blockId ? { ...b, startUnit: nextStart } : b,
        );
      });
    };

    const endMove = () => {
      const blockId = moveSession.blockId;
      if (moveSessionDragRef.current) {
        suppressNextPlacedBlockClickRef.current = true;
      }
      moveSessionDragRef.current = false;
      setMoveSession(null);
      setActiveBlockId(blockId);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endMove);
    window.addEventListener('pointercancel', endMove);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endMove);
      window.removeEventListener('pointercancel', endMove);
    };
  }, [moveSession, rackUnitsU]);

  useEffect(() => {
    if (isMobileLayout || draggingBlockSize === null) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const session = palettePointerSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY };
      setPaletteFloatingGhostPos({ x: event.clientX, y: event.clientY });
      updatePaletteRackHoverFromClient(event.clientX, event.clientY);
    };
    const endPalettePointerDrag = (event: PointerEvent) => {
      const session = palettePointerSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      try {
        const target = event.target;
        if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // No-op if release is unavailable for this pointer target.
      }
      placePaletteBlockFromClient(event.clientX, event.clientY, session.blockSize);
      palettePointerSessionRef.current = null;
      setDraggingBlockSize(null);
      setPaletteFloatingGhostPos(null);
      setPaletteRackHover(null);
      lastPointerClientRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endPalettePointerDrag);
    window.addEventListener('pointercancel', endPalettePointerDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endPalettePointerDrag);
      window.removeEventListener('pointercancel', endPalettePointerDrag);
    };
  }, [isMobileLayout, draggingBlockSize, updatePaletteRackHoverFromClient, placePaletteBlockFromClient]);

  useEffect(() => {
    if (draggingBlockSize === null && moveSession === null) {
      return;
    }
    const EDGE_PX = 52;
    const MAX_DELTA = 11;
    let rafId = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      const frameEl = rackFrameRef.current;
      const pt = lastPointerClientRef.current;
      const innerH = window.innerHeight;
      if (frameEl && pt) {
        const rect = frameEl.getBoundingClientRect();
        const inX = pt.x >= rect.left && pt.x <= rect.right;
        if (inX) {
          const distTop = pt.y;
          const distBottom = innerH - pt.y;
          if (distTop < EDGE_PX && distTop <= distBottom) {
            const t = distTop <= 0 ? 1 : 1 - distTop / EDGE_PX;
            window.scrollBy(0, -(t * t * MAX_DELTA));
          } else if (distBottom < EDGE_PX && distBottom < distTop) {
            const t = distBottom <= 0 ? 1 : 1 - distBottom / EDGE_PX;
            window.scrollBy(0, t * t * MAX_DELTA);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [draggingBlockSize, moveSession]);

  useEffect(() => {
    if (!detailsModal) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (deviceTypeSelectorOpen) {
          setDeviceTypeSelectorOpen(false);
        } else {
          handleDetailsCancelRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [detailsModal, deviceTypeSelectorOpen]);

  useEffect(() => {
    if (!deviceTypeSelectorOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const menu = deviceTypeSelectorRef.current;
      if (menu && !menu.contains(event.target as Node)) {
        setDeviceTypeSelectorOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [deviceTypeSelectorOpen]);

  const renderRackUnitsPalette = () => (
    <section className="sidebar-section-rack-units">
      <h2 id="rack-units-heading">Rack Units</h2>
      <div className="block-palette" aria-labelledby="rack-units-heading">
        {blockSizes.map((size) => (
          <button
            key={size}
            type="button"
            draggable={false}
            className={`block-option${selectedBlockSize === size ? ' block-option-selected' : ''}${
              draggingBlockSize === size ? ' block-option-dragging' : ''
            }`}
            style={{ height: size * RACK_UNIT_PX }}
            onClick={() => setSelectedBlockSize(size)}
            onPointerDown={(event) => handlePalettePointerDown(event, size)}
            aria-pressed={selectedBlockSize === size}
          >
            {size}U
          </button>
        ))}
      </div>
    </section>
  );

  const renderMobileRackPlacementHint = () => (
    <section className="sidebar-section-rack-units sidebar-section-mobile-rack-hint" aria-label="Rack placement">
      <h2 id="rack-units-heading">Rack placement</h2>
      <p className="mobile-rack-placement-hint">
        Touch empty rack space and drag vertically to select the device height, then release to define the device
        details. A quick tap still creates a 1U device.
      </p>
    </section>
  );

  const showFullRackHeightInSidebar = !isMobileLayout || rackHeightMobileExpanded;
  const rackIdentityDisplayLine = formatRackIdentityDisplay(rackIdentity);
  const projectNameDisplay = normalizeOptionalDescriptor(projectName);
  const rackDescriptionDisplay = normalizeOptionalDescriptor(rackDescription);
  const technicianDisplay = normalizeOptionalDescriptor(technicianName);

  const canClearRack =
    placedBlocks.length > 0 ||
    rackNotes.trim() !== '' ||
    rackDescription.trim() !== '' ||
    rackIdentity.rackNumber.trim() !== '' ||
    rackIdentity.rackLocation.trim() !== '';

  const showRackInfoPrompt = hydrated && !isRackIdentityComplete(rackIdentity);

  const usedDeviceTypesInRack = new Set(placedBlocks.map((b) => b.deviceType));
  const pdfLegendDeviceTypes =
    placedBlocks.length === 0
      ? PDF_LEGEND_DEVICE_TYPES
      : (() => {
          const filtered = PDF_LEGEND_DEVICE_TYPES.filter((t) => usedDeviceTypesInRack.has(t));
          return filtered.length > 0 ? filtered : PDF_LEGEND_DEVICE_TYPES;
        })();

  const detailsModalShowSurveyFields =
    detailsModal !== null && deviceTypeUsesSurveyMetadata(detailsDraft.deviceType);

  /** Rack row U numbers occupied during vertical resize or move (live; same span math as placement). */
  const rackSpanHighlightUnitSet = useMemo(() => {
    const blockId = resizeSession?.blockId ?? moveSession?.blockId;
    if (!blockId) {
      return null;
    }
    const block = placedBlocks.find((b) => b.id === blockId);
    if (!block) {
      return null;
    }
    const bottomU = block.startUnit - block.size + 1;
    const topU = block.startUnit;
    const next = new Set<number>();
    for (let u = bottomU; u <= topU; u += 1) {
      next.add(u);
    }
    return next;
  }, [resizeSession, moveSession, placedBlocks]);

  /** U row labels to highlight when a placed device is selected (same span as the block). */
  const selectedBlockUnitSet = useMemo(() => {
    if (activeBlockId === null) {
      return null;
    }
    const block = placedBlocks.find((b) => b.id === activeBlockId);
    if (!block) {
      return null;
    }
    const bottomU = block.startUnit - block.size + 1;
    const topU = block.startUnit;
    const next = new Set<number>();
    for (let u = bottomU; u <= topU; u += 1) {
      next.add(u);
    }
    return next;
  }, [activeBlockId, placedBlocks]);

  const rootClassName = [fullPageLayout ? 'page' : 'rack-builder-root', className].filter(Boolean).join(' ');

  const renderWorkspaceNotesPanel = () => (
    <aside
      className={`workspace-notes-panel${isMobileLayout ? ' workspace-notes-panel--mobile' : ''}`}
      aria-label="Project, rack identification, and notes"
    >
      {isMobileLayout ? (
        <button
          type="button"
          className="workspace-notes-panel__toggle"
          aria-expanded={mobileJobInfoExpanded}
          aria-controls="workspace-notes-panel-body"
          onClick={() => setMobileJobInfoExpanded((v) => !v)}
        >
          Job info
          <span className="workspace-notes-panel__toggle-chevron" aria-hidden>
            {mobileJobInfoExpanded ? ' ▲' : ' ▼'}
          </span>
        </button>
      ) : null}
      <div
        id="workspace-notes-panel-body"
        hidden={isMobileLayout && !mobileJobInfoExpanded}
      >
        <section className="project-name-section" aria-labelledby="project-name-heading">
          <h2 id="project-name-heading">Project</h2>
          <p className="rack-notes-hint">Optional — appears as the main title on PDF exports when set.</p>
          <label className="form-field project-name-field" htmlFor="project-name-input">
            <span>Project Name</span>
            <input
              id="project-name-input"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="e.g. HSC Hospital – Houston, TX"
              autoComplete="off"
              aria-label="Project Name"
            />
          </label>
          <label className="form-field technician-name-field" htmlFor="technician-name-input">
            <span>Technician Name</span>
            <input
              id="technician-name-input"
              type="text"
              value={technicianName}
              onChange={(event) => setTechnicianName(event.target.value)}
              placeholder="e.g. Adam"
              autoComplete="name"
              aria-label="Technician Name"
            />
          </label>
        </section>
        <section className="rack-identity-section" aria-labelledby="rack-identity-heading">
          <h2 id="rack-identity-heading">Rack identification</h2>
          <p className="rack-notes-hint">Optional — shown above the rack and on PDF exports.</p>
          <div className="rack-identity-fields">
            <label className="form-field rack-identity-field" htmlFor="rack-identity-location">
              <span>Rack location</span>
              <input
                id="rack-identity-location"
                type="text"
                value={rackIdentity.rackLocation}
                onChange={(event) =>
                  setRackIdentity((prev) => ({ ...prev, rackLocation: event.target.value }))
                }
                placeholder="e.g. IDF B, Room 227, Closet A"
                autoComplete="off"
              />
            </label>
            <label className="form-field rack-identity-field" htmlFor="rack-identity-rack-number">
              <span>Rack number</span>
              <input
                id="rack-identity-rack-number"
                type="text"
                value={rackIdentity.rackNumber}
                onChange={(event) =>
                  setRackIdentity((prev) => ({ ...prev, rackNumber: event.target.value }))
                }
                placeholder="e.g. 3, 1-7, 2-5"
                autoComplete="off"
              />
            </label>
          </div>
          <label className="form-field rack-description-field" htmlFor="rack-description-input">
            <span>Rack description</span>
            <input
              id="rack-description-input"
              type="text"
              value={rackDescription}
              onChange={(event) => setRackDescription(event.target.value)}
              placeholder="e.g. POS Network Rack, West Wing IDF"
              autoComplete="off"
              aria-label="Rack description"
            />
          </label>
        </section>
        <h2 id="rack-notes-heading">Notes</h2>
        <p className="rack-notes-hint">Plain-text notes for this rack (saved with your layout).</p>
        <label className="form-field rack-notes-field" htmlFor="rack-notes-textarea">
          <span className="rack-notes-label-text">Rack notes</span>
          <textarea
            id="rack-notes-textarea"
            className="rack-notes-textarea"
            value={rackNotes}
            onChange={(event) => setRackNotes(event.target.value)}
            rows={5}
            placeholder="e.g. power circuits, labeling plan, spare U reserved…"
            aria-label="Rack notes"
          />
        </label>
      </div>
    </aside>
  );

  return (
    <div className={rootClassName}>
      {draggingBlockSize !== null &&
        paletteRackHover === null &&
        paletteFloatingGhostPos !== null && (
          <div
            className="palette-floating-ghost"
            aria-hidden="true"
            style={{
              left: paletteFloatingGhostPos.x,
              top: paletteFloatingGhostPos.y,
              height: draggingBlockSize * RACK_UNIT_PX,
            }}
          />
        )}
      {showAppHeader ? (
        <header className="header">
          <h1>EazeRack</h1>
        </header>
      ) : null}
      {showRackInfoPrompt ? (
        <div
          className="details-modal-backdrop rack-info-prompt-backdrop"
          role="presentation"
          aria-hidden={false}
        >
          <div
            className="details-modal rack-info-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rack-info-prompt-title"
            aria-describedby="rack-info-prompt-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="rack-info-prompt-title" className="details-modal-title">
              Rack identification required
            </h2>
            <p id="rack-info-prompt-desc" className="rack-info-prompt-desc">
              Enter rack location and rack number for this rack. This dialog closes when both are
              filled. Project name and technician are separate and stay available in the panel after
              this step.
            </p>
            <div className="details-modal-body">
              <div className="rack-identity-fields">
                <label className="form-field rack-identity-field" htmlFor="rack-info-prompt-location">
                  <span>Rack location</span>
                  <input
                    id="rack-info-prompt-location"
                    type="text"
                    value={rackIdentity.rackLocation}
                    onChange={(event) =>
                      setRackIdentity((prev) => ({ ...prev, rackLocation: event.target.value }))
                    }
                    placeholder="e.g. IDF B, Room 227, Closet A"
                    autoComplete="off"
                    autoFocus
                  />
                </label>
                <label className="form-field rack-identity-field" htmlFor="rack-info-prompt-number">
                  <span>Rack number</span>
                  <input
                    id="rack-info-prompt-number"
                    type="text"
                    value={rackIdentity.rackNumber}
                    onChange={(event) =>
                      setRackIdentity((prev) => ({ ...prev, rackNumber: event.target.value }))
                    }
                    placeholder="e.g. 3, 1-7, 2-5"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-content">
            {showFullRackHeightInSidebar ? (
              <>
                <section className="sidebar-section-rack-settings">
                  <h2>Rack Settings</h2>
              <div className="rack-height-field">
                <span className="rack-height-field-label">Rack Height</span>
                <div className="rack-height-quick" role="group" aria-label="Rack height preset">
                  <button
                    type="button"
                    className={`rack-height-chip${rackHeightMode === 'standard42' ? ' rack-height-chip-selected' : ''}`}
                    onClick={() => {
                      setRackHeightMode('standard42');
                      setCustomRackHeightError(null);
                      applyRackUnitsU(DEFAULT_RACK_UNITS);
                      setCustomRackDraftU(String(DEFAULT_RACK_UNITS));
                      if (isMobileLayout) {
                        setRackHeightMobileExpanded(false);
                      }
                    }}
                  >
                    42U
                  </button>
                  <button
                    type="button"
                    className={`rack-height-chip${rackHeightMode === 'custom' ? ' rack-height-chip-selected' : ''}`}
                    onClick={() => {
                      setRackHeightMode('custom');
                      setCustomRackDraftU(String(rackUnitsU));
                      setCustomRackHeightError(null);
                    }}
                  >
                    Custom
                  </button>
                </div>
                {rackHeightMode === 'custom' ? (
                  <div className="rack-height-custom">
                    <label className="form-field rack-height-custom-field" htmlFor="rack-height-custom-u">
                      <span>Enter rack height (U)</span>
                      <input
                        id="rack-height-custom-u"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={3}
                        value={customRackDraftU}
                        onChange={handleCustomRackDraftChange}
                        onKeyDown={handleCustomRackDraftKeyDown}
                        aria-invalid={customRackHeightError !== null}
                        aria-describedby={
                          customRackHeightError ? 'rack-height-custom-error' : undefined
                        }
                        aria-label="Custom rack height in rack units"
                      />
                    </label>
                    {customRackHeightError ? (
                      <p id="rack-height-custom-error" className="rack-height-custom-error" role="alert">
                        {customRackHeightError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="rack-height-apply-btn"
                      onClick={applyCustomRackFromDraft}
                    >
                      Apply
                    </button>
                  </div>
                ) : null}
              </div>
                </section>
                {isMobileLayout ? renderMobileRackPlacementHint() : renderRackUnitsPalette()}
              </>
            ) : (
              <>
                {isMobileLayout ? renderMobileRackPlacementHint() : renderRackUnitsPalette()}
                <section className="rack-height-mobile-compact" aria-label="Rack height summary">
                  <div className="rack-height-compact-row">
                    <span className="rack-height-compact-summary">Rack Height: {rackUnitsU}U</span>
                    <button
                      type="button"
                      className="rack-height-compact-edit"
                      onClick={() => setRackHeightMobileExpanded(true)}
                    >
                      Edit
                    </button>
                  </div>
                </section>
              </>
            )}

            <section className="project-section">
              <h2>Project</h2>
              <p className="project-auto-save-hint">
                {persistToLocalStorage ? 'Auto-saving enabled' : 'Embedded mode — host app handles persistence'}
              </p>
              <div className="project-actions">
                <button
                  type="button"
                  className="project-action-btn project-action-btn-primary"
                  onClick={handleSaveLayout}
                  disabled={isManualSaving}
                  aria-busy={isManualSaving}
                >
                  Save Layout
                </button>
                <button
                  type="button"
                  className="project-action-btn project-action-btn-secondary"
                  onClick={handleLoadLayout}
                  disabled={!persistToLocalStorage}
                  title={
                    persistToLocalStorage
                      ? 'Load the last saved layout from this browser'
                      : 'Load from browser storage is disabled in embedded mode'
                  }
                >
                  Load Last Layout
                </button>
                <div className="project-export-wrap" ref={exportMenuRef}>
                  <div className="project-export-split">
                    <button
                      type="button"
                      className="project-export-btn-main project-action-btn project-action-btn-secondary-emphasis"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExportMenuOpen(true);
                      }}
                      title="Choose export format"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="project-export-btn-caret project-action-btn project-action-btn-secondary-emphasis"
                      aria-expanded={exportMenuOpen}
                      aria-haspopup="menu"
                      aria-label="More export options"
                      title="Export options"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExportMenuOpen((open) => !open);
                      }}
                    >
                      <span aria-hidden>▾</span>
                    </button>
                  </div>
                  {exportMenuOpen ? (
                    <ul className="project-export-menu" role="menu">
                      <li role="none">
                        <button
                          type="button"
                          className="project-export-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setExportMenuOpen(false);
                            void handleExportBoth();
                          }}
                        >
                          Export PDF + Excel
                        </button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          className="project-export-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setExportMenuOpen(false);
                            void handleExportPdf();
                          }}
                        >
                          Export PDF
                        </button>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          className="project-export-menu-item"
                          role="menuitem"
                          disabled={placedBlocks.length === 0}
                          title={
                            placedBlocks.length === 0 ? 'No devices to export' : 'Export placed devices to Excel'
                          }
                          onClick={() => {
                            if (placedBlocks.length === 0) {
                              return;
                            }
                            setExportMenuOpen(false);
                            void handleExportExcel();
                          }}
                        >
                          Export Excel
                        </button>
                      </li>
                    </ul>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="project-action-btn project-action-btn-destructive"
                  onClick={handleClearRack}
                  disabled={!canClearRack}
                  title={
                    canClearRack
                      ? 'Clear devices, rack identification, notes, and rack description (keeps project name and technician)'
                      : 'Nothing to clear on this rack'
                  }
                >
                  Clear Rack
                </button>
                <button
                  type="button"
                  className="project-action-btn project-action-btn-destructive"
                  onClick={handleClearProject}
                  title="Reset all project fields, metadata, and rack contents (rack height in U unchanged)"
                >
                  Clear Project
                </button>
              </div>
            </section>
          </div>
        </aside>
        <main className="workspace">
          <div
            className="workspace-rack-and-notes"
            onPointerDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('.placed-block')) {
                return;
              }
              setActiveBlockId(null);
            }}
          >
          <div className="workspace-rack-column">
          {rackIdentityDisplayLine || rackDescriptionDisplay ? (
            <div className="rack-context-display" aria-label="Rack context">
              {rackIdentityDisplayLine ? (
                <div className="rack-identity-display-line">{rackIdentityDisplayLine}</div>
              ) : null}
              {rackDescriptionDisplay ? (
                <div className="rack-description-display-line">{rackDescriptionDisplay}</div>
              ) : null}
            </div>
          ) : null}
          <div ref={rackScrollContainerRef} className="rack-scroll-region">
          <div ref={rackFrameRef} className="rack-frame">
            <div
              ref={rackGridRef}
              className={`rack-grid${draggingBlockSize !== null ? ' rack-grid-palette-drag' : ''}`}
              aria-label={`Rack grid with ${rackUnitsU}U`}
            >
              {rackUnits.map((unitNumber) => (
                <button
                  key={unitNumber}
                  type="button"
                  className={`rack-unit${paletteAnchorHighlightUnit === unitNumber ? ' rack-unit-drop-target' : ''}${
                    selectedBlockUnitSet?.has(unitNumber) ? ' rack-unit-selected' : ''
                  }${rackSpanHighlightUnitSet?.has(unitNumber) ? ' rack-unit-resize-range' : ''}${
                    isMobileLayout ? ' rack-unit--mobile-touch' : ''
                  }`}
                  onClick={(event) => {
                    if (isPlacedBlockTopHit(event.clientX, event.clientY)) {
                      return;
                    }
                    if (isMobileLayout) {
                      if (suppressNextEmptyRackClickRef.current) {
                        suppressNextEmptyRackClickRef.current = false;
                      }
                      event.preventDefault();
                      return;
                    }
                    event.preventDefault();
                    handleDesktopRackEmptySlotClick(event.clientX, event.clientY);
                  }}
                >
                  <span className="rack-unit-label">{unitNumber}U</span>
                  <span className="rack-unit-slot" aria-hidden="true" />
                </button>
              ))}
              {draggingBlockSize !== null && paletteRackHover !== null && (
                <div
                  className={`palette-drop-preview${
                    palettePreviewValid ? ' palette-drop-preview-valid' : ' palette-drop-preview-invalid'
                  }`}
                  aria-hidden="true"
                  style={{
                    top: `${(rackUnitsU - paletteRackHover.previewStartUnit) * RACK_UNIT_PX}px`,
                    height: `${draggingBlockSize * RACK_UNIT_PX}px`,
                  }}
                />
              )}
              {isMobileLayout && mobileEmptyDragPreview && (
                  <div
                    className="mobile-empty-drag-preview placement-tap-preview placement-tap-preview-valid"
                    aria-hidden="true"
                    style={{
                      top: `${(rackUnitsU - mobileEmptyDragPreview.startUnit) * RACK_UNIT_PX}px`,
                      height: `${mobileEmptyDragPreview.size * RACK_UNIT_PX}px`,
                    }}
                  />
                )}
              {placedBlocks.map((block) => {
              const topOffset = (rackUnitsU - block.startUnit) * RACK_UNIT_PX;
              const rackLabel = getRackBlockLabel(block);
              const isResizingBlock = resizeSession?.blockId === block.id;
              return (
                <div
                  key={block.id}
                  data-device-type={block.deviceType}
                  className={`placed-block${activeBlockId === block.id ? ' placed-block-active' : ''}${moveSession?.blockId === block.id ? ' placed-block-moving' : ''}${isResizingBlock ? ' placed-block--resizing' : ''}`}
                  style={{
                    top: `${topOffset}px`,
                    height: `${block.size * RACK_UNIT_PX}px`,
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (suppressNextPlacedBlockClickRef.current) {
                      suppressNextPlacedBlockClickRef.current = false;
                      return;
                    }
                    if (isMobileLayout) {
                      const now = Date.now();
                      const last = mobilePlacedBlockLastTapRef.current;
                      if (
                        last &&
                        last.blockId === block.id &&
                        now - last.time <= MOBILE_PLACED_BLOCK_DOUBLE_TAP_MS
                      ) {
                        mobilePlacedBlockLastTapRef.current = null;
                        if (mobilePlacedBlockDoubleTapClearTimerRef.current !== null) {
                          window.clearTimeout(mobilePlacedBlockDoubleTapClearTimerRef.current);
                          mobilePlacedBlockDoubleTapClearTimerRef.current = null;
                        }
                        openDetailsModalEdit(block.id);
                        return;
                      }
                      mobilePlacedBlockLastTapRef.current = { blockId: block.id, time: now };
                      if (mobilePlacedBlockDoubleTapClearTimerRef.current !== null) {
                        window.clearTimeout(mobilePlacedBlockDoubleTapClearTimerRef.current);
                      }
                      mobilePlacedBlockDoubleTapClearTimerRef.current = window.setTimeout(() => {
                        mobilePlacedBlockDoubleTapClearTimerRef.current = null;
                        if (mobilePlacedBlockLastTapRef.current?.blockId === block.id) {
                          mobilePlacedBlockLastTapRef.current = null;
                        }
                      }, MOBILE_PLACED_BLOCK_DOUBLE_TAP_MS + 50);
                      setActiveBlockId(block.id);
                    } else {
                      setActiveBlockId(block.id);
                    }
                  }}
                  onDoubleClick={(event) => {
                    if (isMobileLayout) {
                      return;
                    }
                    const target = event.target as HTMLElement;
                    if (target.closest('.placed-block-delete') || target.closest('.placed-block-resize')) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    suppressNextPlacedBlockClickRef.current = false;
                    openDetailsModalEdit(block.id);
                  }}
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('.placed-block-delete') || target.closest('.placed-block-resize')) {
                      return;
                    }
                    event.stopPropagation();
                    if (isMobileLayout) {
                      if (event.button !== 0) {
                        return;
                      }
                      onPlacedBlockPointerDownMobile(event, block);
                      return;
                    }
                    moveSessionDragRef.current = false;
                    setMoveSession({
                      blockId: block.id,
                      startY: event.clientY,
                      startStartUnit: block.startUnit,
                    });
                  }}
                >
                  <button
                    type="button"
                    className="placed-block-delete"
                    aria-label={`Delete ${block.size}U ${block.deviceType}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteBlock(block.id);
                    }}
                  >
                    X
                  </button>
                  <span
                    className={`placed-block-primary${isResizingBlock ? ' placed-block-primary--resize' : ''}`}
                    title={isResizingBlock ? formatBlockResizeFeedback(block) : rackLabel}
                  >
                    {isResizingBlock ? formatBlockResizeFeedback(block) : rackLabel}
                  </span>
                  {activeBlockId === block.id && (
                    <button
                      type="button"
                      className="placed-block-resize"
                      aria-label="Resize block height"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        resizeSessionDragRef.current = false;
                        setResizeSession({
                          blockId: block.id,
                          startY: event.clientY,
                          startSize: block.size,
                        });
                      }}
                    />
                  )}
                </div>
              );
              })}
            </div>
          </div>
          </div>
          </div>
          {!isMobileLayout ? renderWorkspaceNotesPanel() : null}
          </div>
        </main>
        {isMobileLayout ? renderWorkspaceNotesPanel() : null}
      </div>

      {/* Print-only rack for PDF: no controls, not visible on screen */}
      <div
        ref={pdfExportRef}
        className="pdf-export-root"
        aria-hidden
        data-rack-notes={rackNotes}
      >
        <header className="pdf-export-header">
          {projectNameDisplay && rackIdentityDisplayLine ? (
            <>
              <h1 className="pdf-export-doc-title">{projectNameDisplay}</h1>
              <p className="pdf-export-doc-subtitle">{rackIdentityDisplayLine}</p>
            </>
          ) : projectNameDisplay ? (
            <h1 className="pdf-export-doc-title">{projectNameDisplay}</h1>
          ) : rackIdentityDisplayLine ? (
            <h1 className="pdf-export-doc-title">{rackIdentityDisplayLine}</h1>
          ) : null}
          {rackDescriptionDisplay ? (
            <p className="pdf-export-doc-description">{rackDescriptionDisplay}</p>
          ) : null}
          <div className="pdf-export-doc-meta-group">
            <p className="pdf-export-doc-meta">
              <span ref={pdfExportDateRef} />
            </p>
            {technicianDisplay ? (
              <p className="pdf-export-doc-meta">Technician: {technicianDisplay}</p>
            ) : null}
          </div>
        </header>
        <div className="pdf-export-layout">
          <div className="pdf-export-legend-panel" role="group" aria-label="Device color legend">
            <p className="pdf-export-legend-heading">Device types</p>
            <ul className="pdf-export-legend-list">
              {pdfLegendDeviceTypes.map((deviceType) => (
                <li key={deviceType} className="pdf-export-legend-item">
                  <span
                    className="pdf-legend-swatch"
                    data-device-type={deviceType}
                    aria-hidden="true"
                  />
                  <span className="pdf-export-legend-label">{deviceType}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pdf-export-rack-frame">
            <div className="rack-grid pdf-export-grid">
            {rackUnits.map((unitNumber) => (
              <div key={unitNumber} className="rack-unit pdf-export-rack-row">
                <span className="rack-unit-label">{unitNumber}U</span>
                <span className="rack-unit-slot" aria-hidden="true" />
              </div>
            ))}
            {placedBlocks.map((block) => {
              const topOffset = (rackUnitsU - block.startUnit) * RACK_UNIT_PX;
              const rackLabel = getRackBlockLabel(block);
              return (
                <div
                  key={block.id}
                  data-device-type={block.deviceType}
                  className="placed-block pdf-placed-block"
                  style={{
                    top: `${topOffset}px`,
                    height: `${block.size * RACK_UNIT_PX}px`,
                  }}
                >
                  <span className="placed-block-primary" title={rackLabel}>
                    {rackLabel}
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        </div>
        {rackNotes.trim() ? (
          <section className="pdf-export-notes-section" aria-label="Rack notes">
            <div className="pdf-export-notes-card">
              <h2 className="pdf-export-notes-heading">Notes</h2>
              <div className="pdf-export-notes-body">{rackNotes}</div>
            </div>
          </section>
        ) : null}
      </div>

      {detailsModal && (
        <div
          className="details-modal-backdrop"
          role="presentation"
          onPointerDownCapture={handleDetailsModalBackdropPointerDownCapture}
          onClick={handleDetailsModalBackdropClick}
        >
          <div
            className="details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-modal-title"
            onPointerDownCapture={handleDetailsModalSurfacePointerDownCapture}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="details-modal-title" className="details-modal-title">
              {detailsModal.mode === 'create' ? 'New block' : 'Edit block'}
            </h2>
            <form
              className="details-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleDetailsSave();
              }}
            >
              <div className="details-modal-body">
                <div className="form-field device-type-field" ref={deviceTypeSelectorRef}>
                  <span>Device Type</span>
                  <button
                    type="button"
                    className="device-type-selector-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={deviceTypeSelectorOpen}
                    onClick={() => setDeviceTypeSelectorOpen((open) => !open)}
                  >
                    <span>{detailsDraft.deviceType}</span>
                    <span aria-hidden="true" className="device-type-selector-caret">v</span>
                  </button>
                  {deviceTypeSelectorOpen ? (
                    <div
                      className="device-type-selector-list"
                      role="listbox"
                      aria-label="Device Type"
                      tabIndex={-1}
                    >
                      {DEVICE_TYPES.map((deviceType) => (
                        <button
                          key={deviceType}
                          type="button"
                          role="option"
                          aria-selected={detailsDraft.deviceType === deviceType}
                          className={`device-type-selector-option${
                            detailsDraft.deviceType === deviceType ? ' device-type-selector-option-selected' : ''
                          }`}
                          onClick={() => {
                            setDetailsDraft((draft) => ({
                              ...draft,
                              deviceType,
                            }));
                            setDeviceTypeSelectorOpen(false);
                          }}
                        >
                          {deviceType}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <label className="form-field">
                  <span>Device Name</span>
                  <input
                    type="text"
                    value={detailsDraft.deviceName}
                    onChange={(event) =>
                      setDetailsDraft((draft) => ({ ...draft, deviceName: event.target.value }))
                    }
                    placeholder={
                      detailsDraft.deviceType === 'Patch Panel' ? 'e.g. PP3-2-1' : 'e.g. Cisco 9300'
                    }
                  />
                </label>
                {detailsModalShowSurveyFields ? (
                  <>
                    <label className="form-field">
                      <span>Serial Number</span>
                      <input
                        type="text"
                        value={detailsDraft.serialNumber}
                        onChange={(event) =>
                          setDetailsDraft((draft) => ({ ...draft, serialNumber: event.target.value }))
                        }
                        placeholder="e.g. FOC1234ABC"
                      />
                    </label>
                    <label className="form-field">
                      <span>MAC Address</span>
                      <input
                        type="text"
                        value={detailsDraft.macAddress}
                        onChange={(event) =>
                          setDetailsDraft((draft) => ({ ...draft, macAddress: event.target.value }))
                        }
                        placeholder="e.g. 00:1A:2B:3C:4D:5E"
                      />
                    </label>
                    <label className="form-field">
                      <span>Asset Tag</span>
                      <input
                        type="text"
                        value={detailsDraft.assetTag}
                        onChange={(event) =>
                          setDetailsDraft((draft) => ({ ...draft, assetTag: event.target.value }))
                        }
                        placeholder="e.g. HSC-IT-4471"
                      />
                    </label>
                  </>
                ) : null}
                {detailsDraft.deviceType === 'Patch Panel' ? (
                  <label className="form-field">
                    <span>Open Ports</span>
                    <input
                      type="text"
                      value={detailsDraft.openPorts}
                      onChange={(event) =>
                        setDetailsDraft((draft) => ({ ...draft, openPorts: event.target.value }))
                      }
                      placeholder="Optional"
                      autoComplete="off"
                      aria-label="Open ports"
                    />
                  </label>
                ) : null}
                <label className="form-field">
                  <span>Notes</span>
                  <textarea
                    value={detailsDraft.notes}
                    onChange={(event) =>
                      setDetailsDraft((draft) => ({ ...draft, notes: event.target.value }))
                    }
                    placeholder="Optional notes"
                    rows={3}
                  />
                </label>
              </div>
              <div className="details-modal-actions">
                <button type="submit" className="details-modal-btn details-modal-btn-primary">
                  Save
                </button>
                <button type="button" className="details-modal-btn" onClick={handleDetailsCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {saveToastVisible ? (
        <div
          key={saveToastKey}
          className="save-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Layout saved
        </div>
      ) : null}
    </div>
  );
});

RackBuilder.displayName = 'RackBuilder';
