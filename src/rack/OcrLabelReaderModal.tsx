import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Tesseract from 'tesseract.js';

export type OcrApplyTarget = 'deviceName' | 'serialNumber' | 'macAddress' | 'assetTag';

export type OcrLabelReaderModalProps = {
  initialTarget: OcrApplyTarget;
  onApply: (target: OcrApplyTarget, value: string) => void;
  onClose: () => void;
};

const OCR_APPLY_TARGET_LABELS: Record<OcrApplyTarget, string> = {
  deviceName: 'Device Name',
  serialNumber: 'Serial Number',
  macAddress: 'MAC Address',
  assetTag: 'Asset Tag',
};

function normalizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getTargetHint(target: OcrApplyTarget): string {
  switch (target) {
    case 'deviceName':
      return 'Frame the model name or front-panel label inside the rectangle.';
    case 'macAddress':
      return 'Frame only the MAC address label inside the rectangle.';
    case 'assetTag':
      return 'Frame only the asset tag label inside the rectangle.';
    case 'serialNumber':
    default:
      return 'Frame only the serial number label inside the rectangle.';
  }
}

function suggestTextForTarget(text: string, target: OcrApplyTarget): string {
  const normalized = normalizeOcrText(text);
  if (!normalized) {
    return '';
  }

  if (target === 'macAddress') {
    const macMatch = normalized.match(/\b[0-9A-Fa-f]{2}(?::|-|\s)?[0-9A-Fa-f]{2}(?::|-|\s)?[0-9A-Fa-f]{2}(?::|-|\s)?[0-9A-Fa-f]{2}(?::|-|\s)?[0-9A-Fa-f]{2}(?::|-|\s)?[0-9A-Fa-f]{2}\b/);
    if (macMatch) {
      const hex = macMatch[0].replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      return hex.match(/.{1,2}/g)?.join(':') ?? normalized;
    }
  }

  if (target === 'serialNumber' || target === 'assetTag') {
    const withoutLabel = normalized
      .replace(/\b(serial|s\/n|sn|asset|asset tag|tag)\b\s*[:#-]?\s*/gi, '')
      .trim();
    const token = withoutLabel.match(/[A-Z0-9][A-Z0-9._-]{3,}/i)?.[0];
    return token ?? withoutLabel;
  }

  return normalized;
}

type ZoomState = {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
};

type FocusRingState = {
  id: number;
  x: number;
  y: number;
};

const DEFAULT_ZOOM_STATE: ZoomState = {
  supported: false,
  min: 1,
  max: 1,
  step: 0.1,
  value: 1,
};

function getScannerVideoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [
      { focusMode: 'continuous' } as MediaTrackConstraintSet,
      { exposureMode: 'continuous' } as MediaTrackConstraintSet,
      { whiteBalanceMode: 'continuous' } as MediaTrackConstraintSet,
    ],
  };
}

function getNumericCapability(capabilities: MediaTrackCapabilities, key: string): number | undefined {
  const value = (capabilities as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

function getStringArrayCapability(capabilities: MediaTrackCapabilities, key: string): string[] {
  const value = (capabilities as unknown as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getNumericRangeCapability(
  capabilities: MediaTrackCapabilities,
  key: string,
): { min: number; max: number; step: number } | null {
  const value = (capabilities as unknown as Record<string, unknown>)[key];
  if (!value || typeof value !== 'object') {
    return null;
  }
  const range = value as { min?: unknown; max?: unknown; step?: unknown };
  if (typeof range.min === 'number' && typeof range.max === 'number' && range.max >= range.min) {
    return {
      min: range.min,
      max: range.max,
      step: typeof range.step === 'number' && range.step > 0 ? range.step : Math.max((range.max - range.min) / 10, 0.1),
    };
  }
  return null;
}

function getFocusDistance(track: MediaStreamTrack, capabilities: MediaTrackCapabilities): number | undefined {
  const range = getNumericRangeCapability(capabilities, 'focusDistance');
  if (!range) {
    return undefined;
  }
  const current = (track.getSettings() as unknown as Record<string, unknown>).focusDistance;
  if (typeof current === 'number') {
    return current;
  }
  return range.min + (range.max - range.min) / 2;
}

async function tryApplyFocus(track: MediaStreamTrack, point: { x: number; y: number }): Promise<boolean> {
  if (typeof track.getCapabilities !== 'function') {
    return false;
  }

  const capabilities = track.getCapabilities();
  const capabilityKeys = capabilities as unknown as Record<string, unknown>;
  const focusModes = getStringArrayCapability(capabilities, 'focusMode');
  const focusDistance = getFocusDistance(track, capabilities);
  const supportsPointOfInterest = 'pointsOfInterest' in capabilityKeys;
  const attempts: MediaTrackConstraintSet[] = [];

  if (focusModes.includes('manual')) {
    attempts.push({
      focusMode: 'manual',
      ...(supportsPointOfInterest ? { pointsOfInterest: [point] } : {}),
      ...(focusDistance !== undefined ? { focusDistance } : {}),
    } as MediaTrackConstraintSet);
  }

  if (focusModes.includes('single-shot')) {
    attempts.push({
      focusMode: 'single-shot',
      ...(supportsPointOfInterest ? { pointsOfInterest: [point] } : {}),
    } as MediaTrackConstraintSet);
  }

  if (focusModes.includes('continuous')) {
    attempts.push({ focusMode: 'continuous' } as MediaTrackConstraintSet);
  }

  for (const constraints of attempts) {
    try {
      await track.applyConstraints({ advanced: [constraints] });
      return true;
    } catch {
      // Try the next supported focus strategy.
    }
  }

  return false;
}

async function applyContinuousCameraModes(track: MediaStreamTrack | undefined): Promise<void> {
  if (!track || typeof track.getCapabilities !== 'function') {
    return;
  }

  const capabilities = track.getCapabilities();
  const advanced: MediaTrackConstraintSet[] = [];
  if (getStringArrayCapability(capabilities, 'focusMode').includes('continuous')) {
    advanced.push({ focusMode: 'continuous' } as MediaTrackConstraintSet);
  }
  if (getStringArrayCapability(capabilities, 'exposureMode').includes('continuous')) {
    advanced.push({ exposureMode: 'continuous' } as MediaTrackConstraintSet);
  }
  if (getStringArrayCapability(capabilities, 'whiteBalanceMode').includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' } as MediaTrackConstraintSet);
  }

  if (!advanced.length) {
    return;
  }

  try {
    await track.applyConstraints({ advanced });
  } catch {
    // Optional camera controls are ignored when a browser rejects them.
  }
}

export function OcrLabelReaderModal({ initialTarget, onApply, onClose }: OcrLabelReaderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraFrameRef = useRef<HTMLDivElement | null>(null);
  const targetBoxRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'reading' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [activeTarget, setActiveTarget] = useState<OcrApplyTarget>(initialTarget);
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM_STATE);
  const [focusMessage, setFocusMessage] = useState<string | null>(null);
  const [focusRing, setFocusRing] = useState<FocusRingState | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const updateCameraCapabilities = (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      setZoomState(DEFAULT_ZOOM_STATE);
      return;
    }

    const capabilities = track.getCapabilities();
    const settings = track.getSettings();
    const min = getNumericCapability(capabilities, 'zoom');
    const max = getNumericCapability(capabilities, 'maxZoom') ?? getNumericCapability(capabilities, 'zoomMax');
    const zoomMin = getNumericCapability(capabilities, 'minZoom') ?? min;
    const currentZoom = typeof (settings as unknown as Record<string, unknown>).zoom === 'number'
      ? ((settings as unknown as Record<string, number>).zoom)
      : (zoomMin ?? 1);

    if (zoomMin !== undefined && max !== undefined && max > zoomMin) {
      setZoomState({
        supported: true,
        min: zoomMin,
        max,
        step: Math.max((max - zoomMin) / 10, 0.1),
        value: currentZoom,
      });
    } else {
      setZoomState(DEFAULT_ZOOM_STATE);
    }
  };

  const applyZoom = async (nextValue: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomState.supported) {
      return;
    }
    const clamped = Math.min(zoomState.max, Math.max(zoomState.min, nextValue));
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
      setZoomState((prev) => ({ ...prev, value: clamped }));
    } catch {
      setZoomState((prev) => ({ ...prev, supported: false }));
    }
  };

  const handleCameraTap = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    const frame = cameraFrameRef.current;
    if (!frame) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };

    const ringId = Date.now();
    setFocusRing({ id: ringId, x: point.x * 100, y: point.y * 100 });
    window.setTimeout(() => {
      setFocusRing((current) => (current?.id === ringId ? null : current));
    }, 650);

    const focused = track ? await tryApplyFocus(track, point) : false;
    if (focused) {
      setFocusMessage(null);
    } else {
      setFocusMessage('Focus not supported on this device');
      window.setTimeout(() => setFocusMessage(null), 1600);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getScannerVideoConstraints(),
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        updateCameraCapabilities(stream);
        void applyContinuousCameraModes(stream.getVideoTracks()[0]);
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('Unable to start camera for OCR');
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, []);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleReadLabel = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus('error');
      setErrorMessage('Camera is not ready yet');
      return;
    }

    setStatus('reading');
    setErrorMessage(null);
    setOcrText('');

    const frame = cameraFrameRef.current;
    const targetBox = targetBoxRef.current;
    if (!frame || !targetBox) {
      setStatus('error');
      setErrorMessage('Unable to find OCR target window');
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const targetRect = targetBox.getBoundingClientRect();
    const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (videoRect.width - renderedWidth) / 2;
    const offsetY = (videoRect.height - renderedHeight) / 2;
    const sourceX = Math.max(0, Math.round((targetRect.left - videoRect.left - offsetX) / scale));
    const sourceY = Math.max(0, Math.round((targetRect.top - videoRect.top - offsetY) / scale));
    const sourceWidth = Math.min(video.videoWidth - sourceX, Math.round(targetRect.width / scale));
    const sourceHeight = Math.min(video.videoHeight - sourceY, Math.round(targetRect.height / scale));

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setStatus('error');
      setErrorMessage('Unable to capture camera image');
      return;
    }

    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    const imageDataUrl = canvas.toDataURL('image/png');

    try {
      const result = await Tesseract.recognize(imageDataUrl, 'eng');
      const nextText = suggestTextForTarget(result.data.text, activeTarget);
      if (!nextText) {
        setStatus('error');
        setErrorMessage('No readable label text found');
        return;
      }
      setOcrText(nextText);
      setStatus('ready');
    } catch {
      setStatus('error');
      setErrorMessage('Unable to read label text');
    }
  };

  const handleApply = (target: OcrApplyTarget) => {
    const value = ocrText.trim();
    if (!value) {
      return;
    }
    onApply(target, value);
    stopCamera();
    onClose();
  };

  const readDisabled = status === 'starting' || status === 'reading';
  const hasText = ocrText.trim() !== '';

  return (
    <div className="ocr-modal-backdrop" role="presentation">
      <div className="ocr-modal" role="dialog" aria-modal="true" aria-labelledby="ocr-modal-title">
        <div className="ocr-modal-header">
          <h2 id="ocr-modal-title" className="ocr-modal-title">
            Read {OCR_APPLY_TARGET_LABELS[activeTarget]}
          </h2>
          <button type="button" className="ocr-modal-close" onClick={handleClose}>
            Close
          </button>
        </div>
        <p className="ocr-modal-hint">
          {getTargetHint(activeTarget)} OCR can misread O/0, I/1, and B/8. Verify before applying.
        </p>
        <div ref={cameraFrameRef} className="ocr-camera-frame" onPointerUp={handleCameraTap}>
          <video ref={videoRef} className="ocr-camera" playsInline muted />
          {focusRing ? (
            <span
              key={focusRing.id}
              className="camera-focus-ring"
              style={{ left: `${focusRing.x}%`, top: `${focusRing.y}%` }}
              aria-hidden="true"
            />
          ) : null}
          <div ref={targetBoxRef} className={`capture-target-box capture-target-box-${activeTarget}`} aria-hidden="true">
            <span className="capture-target-label">{OCR_APPLY_TARGET_LABELS[activeTarget]}</span>
          </div>
        </div>
        {focusMessage ? <p className="camera-control-note">{focusMessage}</p> : null}
        {zoomState.supported ? (
          <div className="camera-zoom-controls" aria-label="Camera zoom controls">
            <button type="button" onClick={() => void applyZoom(zoomState.value - zoomState.step)}>
              Zoom -
            </button>
            <button type="button" onClick={() => void applyZoom(zoomState.value + zoomState.step)}>
              Zoom +
            </button>
            <button type="button" onClick={() => void applyZoom(zoomState.min)}>
              Reset
            </button>
          </div>
        ) : null}
        {errorMessage ? (
          <p className="ocr-modal-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <button type="button" className="ocr-read-btn" onClick={handleReadLabel} disabled={readDisabled}>
          {status === 'reading' ? 'Reading cropped label...' : 'Capture'}
        </button>
        {hasText ? (
          <div className="ocr-result-panel">
            <p className="ocr-result-label">Extracted text</p>
            <p className="ocr-result-text">{ocrText}</p>
            <div className="ocr-target-choice" role="group" aria-label="OCR target field">
              {(Object.keys(OCR_APPLY_TARGET_LABELS) as OcrApplyTarget[]).map((target) => (
                <button
                  key={target}
                  type="button"
                  className={`ocr-target-choice-btn${activeTarget === target ? ' ocr-target-choice-btn-active' : ''}`}
                  onClick={() => setActiveTarget(target)}
                >
                  {OCR_APPLY_TARGET_LABELS[target]}
                </button>
              ))}
            </div>
            <div className="ocr-apply-actions" aria-label="Apply extracted text">
              {(Object.keys(OCR_APPLY_TARGET_LABELS) as OcrApplyTarget[]).map((target) => (
                <button key={target} type="button" className="ocr-apply-btn" onClick={() => handleApply(target)}>
                  Apply to {OCR_APPLY_TARGET_LABELS[target]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
