/**
 * Public data contract for embedding the rack builder in host apps (e.g. EazeDoc).
 * Internal persistence JSON may use slightly different field names; map at boundaries.
 */

export type RackDeviceType =
  | 'Switch'
  | 'Patch Panel'
  | 'PDU'
  | 'UPS'
  | 'Router'
  | 'Firewall'
  | 'Server'
  | 'Wire Manager'
  | 'Fiber Shelf'
  | 'LIU'
  | 'Shelf'
  | 'Blank Panel'
  | 'KVM'
  | 'NVR'
  | 'Amplifier'
  | 'Paging Controller'
  | 'Custom Device'
  /** Legacy persisted projects may still contain the old custom label. */
  | 'Custom';

/**
 * Passive rack gear only needs a label; serial / MAC / asset are not collected.
 * All other types are treated as “smart” for survey metadata.
 */
const PASSIVE_DEVICE_TYPES: ReadonlySet<RackDeviceType> = new Set(['Patch Panel', 'Wire Manager']);

export function deviceTypeUsesSurveyMetadata(deviceType: RackDeviceType): boolean {
  return !PASSIVE_DEVICE_TYPES.has(deviceType);
}

export type RackPlacedBlock = {
  id: number;
  startUnit: number;
  size: number;
  deviceType: RackDeviceType;
  deviceName: string;
  /**
   * Survey fields are edited only when {@link deviceTypeUsesSurveyMetadata} is true, but values
   * may be retained while the device is passive so type switches do not lose data.
   */
  serialNumber: string;
  macAddress: string;
  assetTag: string;
  /** Optional; meaningful when device type is Patch Panel (e.g. spare capacity). */
  openPorts: string;
  notes: string;
};

export type RackIdentity = {
  rackLocation: string;
  rackNumber: string;
};

/** Full rack project snapshot — safe to serialize or pass across an embed boundary. */
export type RackProjectData = {
  rackHeightU: number;
  placedBlocks: RackPlacedBlock[];
  rackNotes: string;
  projectName: string;
  siteNumber: string;
  siteAddress: string;
  rackDescription: string;
  technicianName: string;
  rackIdentity: RackIdentity;
};

export const EMPTY_RACK_IDENTITY: RackIdentity = {
  rackLocation: '',
  rackNumber: '',
};

export function createEmptyRackProject(defaultRackHeightU = 42): RackProjectData {
  return {
    rackHeightU: defaultRackHeightU,
    placedBlocks: [],
    rackNotes: '',
    projectName: '',
    siteNumber: '',
    siteAddress: '',
    rackDescription: '',
    technicianName: '',
    rackIdentity: { ...EMPTY_RACK_IDENTITY },
  };
}
