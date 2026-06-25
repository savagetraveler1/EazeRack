import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';

export type BarcodeScannerModalProps = {
  title: string;
  scanMode?: 'barcode' | 'qr';
  onScan: (value: string) => void;
  onClose: () => void;
};

function formatScannerStartupError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown camera startup error';
  }
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

function getZoomRange(capabilities: MediaTrackCapabilities): { min: number; max: number; step: number } | null {
  const zoom = (capabilities as unknown as Record<string, unknown>).zoom;
  if (!zoom || typeof zoom !== 'object') {
    return null;
  }
  const range = zoom as { min?: unknown; max?: unknown; step?: unknown };
  if (typeof range.min === 'number' && typeof range.max === 'number' && range.max > range.min) {
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
    // Some browsers report capabilities but still reject camera controls.
  }
}

async function applyScannerCameraQuality(scanner: Html5Qrcode): Promise<void> {
  try {
    await scanner.applyVideoConstraints(getScannerVideoConstraints());
  } catch {
    // Quality hints are optional; scanning should continue if unsupported.
  }
}

export function BarcodeScannerModal({ title, scanMode = 'barcode', onScan, onClose }: BarcodeScannerModalProps) {
  const scannerElementId = useId().replace(/:/g, '');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startScannerRef = useRef<(() => void) | null>(null);
  const completedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<'starting' | 'preview' | 'scanning' | 'error'>('starting');
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM_STATE);
  const [focusMessage, setFocusMessage] = useState<string | null>(null);
  const [focusRing, setFocusRing] = useState<FocusRingState | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerElementId);
    scannerRef.current = scanner;
    let cancelled = false;

    const updateCameraCapabilities = (stream: MediaStream) => {
      const track = stream.getVideoTracks()[0];
      if (!track) {
        setZoomState(DEFAULT_ZOOM_STATE);
        return;
      }
      const zoomRange = getZoomRange(track.getCapabilities());
      const settingsZoom = (track.getSettings() as unknown as Record<string, unknown>).zoom;
      if (zoomRange) {
        setZoomState({
          supported: true,
          min: zoomRange.min,
          max: zoomRange.max,
          step: zoomRange.step,
          value: typeof settingsZoom === 'number' ? settingsZoom : zoomRange.min,
        });
      } else {
        setZoomState(DEFAULT_ZOOM_STATE);
      }
    };

    const stopPreview = () => {
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      previewStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const stopScanner = async () => {
      const activeScanner = scannerRef.current;
      if (!activeScanner) {
        return;
      }
      try {
        if (activeScanner.isScanning) {
          await activeScanner.stop();
        }
      } catch {
        // Camera may already be stopped by the browser or a prior cleanup.
      }
      try {
        activeScanner.clear();
      } catch {
        // Ignore cleanup errors from an already-cleared scanner.
      }
      if (scannerRef.current === activeScanner) {
        scannerRef.current = null;
      }
    };

    const startPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: getScannerVideoConstraints(),
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        updateCameraCapabilities(stream);
        void applyContinuousCameraModes(stream.getVideoTracks()[0]);
        setPhase('preview');
      } catch (previewError) {
        console.error('Barcode scanner preview camera failed to start:', previewError);
        if (!cancelled) {
          setPhase('error');
          setErrorMessage(
            `Camera could not start. Please check camera permission or try opening in Chrome. Details: ${formatScannerStartupError(previewError)}`,
          );
        }
      }
    };

    const scanConfig: Parameters<Html5Qrcode['start']>[1] = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        if (scanMode === 'qr') {
          const size = Math.floor(Math.min(viewfinderWidth * 0.68, viewfinderHeight * 0.68));
          return { width: size, height: size };
        }
        const width = Math.floor(viewfinderWidth * 0.82);
        const height = Math.floor(Math.min(viewfinderHeight * 0.34, width * 0.42));
        return { width, height };
      },
    };
    const handleScanSuccess = (decodedText: string, _decodedResult: Html5QrcodeResult) => {
      if (completedRef.current) {
        return;
      }
      completedRef.current = true;
      void stopScanner().finally(() => {
        if (!cancelled) {
          onScan(decodedText);
        }
      });
    };
    const handleScanMiss = () => {
      // Decode misses are expected while the camera is scanning.
    };

    const startScanner = async () => {
      setErrorMessage(null);
      setPhase('scanning');
      stopPreview();
      try {
        await scanner.start(
          getScannerVideoConstraints(),
          scanConfig,
          handleScanSuccess,
          handleScanMiss,
        );
        await applyScannerCameraQuality(scanner);
      } catch (rearCameraError) {
        console.error('Barcode scanner failed to start with rear camera:', rearCameraError);
        if (cancelled) {
          return;
        }
        try {
          const cameras = await Html5Qrcode.getCameras();
          const defaultCameraId = cameras[0]?.id;
          if (!defaultCameraId) {
            throw new Error('No camera devices were found');
          }
          await scanner.start(defaultCameraId, scanConfig, handleScanSuccess, handleScanMiss);
          await applyScannerCameraQuality(scanner);
        } catch (defaultCameraError) {
          console.error('Barcode scanner failed to start with default camera:', defaultCameraError);
          if (cancelled) {
            return;
          }
          const detail = formatScannerStartupError(defaultCameraError || rearCameraError);
          setPhase('error');
          setErrorMessage(
            `Camera could not start. Please check camera permission or try opening in Chrome. Details: ${detail}`,
          );
        }
      }
    };

    startScannerRef.current = () => {
      void startScanner();
    };
    void startPreview();

    return () => {
      cancelled = true;
      stopPreview();
      void stopScanner();
      startScannerRef.current = null;
    };
  }, [onScan, scanMode, scannerElementId]);

  const handleClose = () => {
    completedRef.current = true;
    const scanner = scannerRef.current;
    if (!scanner) {
      onClose();
      return;
    }
    void (async () => {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // Ignore stop errors during explicit close.
      }
      try {
        scanner.clear();
      } catch {
        // Ignore clear errors during explicit close.
      }
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }
      onClose();
    })();
  };

  const handleStartScan = () => {
    startScannerRef.current?.();
  };

  const applyZoom = async (nextValue: number) => {
    if (!zoomState.supported) {
      return;
    }
    const clamped = Math.min(zoomState.max, Math.max(zoomState.min, nextValue));
    const track = previewStreamRef.current?.getVideoTracks()[0];
    try {
      if (phase === 'scanning' && scannerRef.current?.isScanning) {
        await scannerRef.current.applyVideoConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
      } else if (track) {
        await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
      }
      setZoomState((prev) => ({ ...prev, value: clamped }));
    } catch {
      setZoomState((prev) => ({ ...prev, supported: false }));
    }
  };

  const getActiveVideoTrack = (): MediaStreamTrack | undefined => {
    const previewTrack = previewStreamRef.current?.getVideoTracks()[0];
    if (previewTrack) {
      return previewTrack;
    }

    const scannerVideo = document.getElementById(scannerElementId)?.querySelector<HTMLVideoElement>('video');
    const scannerStream = scannerVideo?.srcObject instanceof MediaStream ? scannerVideo.srcObject : null;
    return scannerStream?.getVideoTracks()[0];
  };

  const handleCameraTap = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const frame = previewFrameRef.current;
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

    const focused = await (async () => {
      const track = getActiveVideoTrack();
      if (track && await tryApplyFocus(track, point)) {
        return true;
      }

      if (phase === 'scanning' && scannerRef.current?.isScanning) {
        try {
          await scannerRef.current.applyVideoConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          });
          return true;
        } catch {
          return false;
        }
      }

      return false;
    })();

    if (focused) {
      setFocusMessage(null);
    } else {
      setFocusMessage('Focus not supported on this device');
      window.setTimeout(() => setFocusMessage(null), 1600);
    }
  };

  return (
    <div className="scanner-modal-backdrop" role="presentation">
      <div className="scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-modal-title">
        <div className="scanner-modal-header">
          <h2 id="scanner-modal-title" className="scanner-modal-title">
            {title}
          </h2>
          <button type="button" className="scanner-modal-close" onClick={handleClose}>
            Close
          </button>
        </div>
        <p className="scanner-modal-hint">
          {scanMode === 'qr'
            ? 'Position the QR code inside the square, then tap Start Scan.'
            : 'Position the barcode inside the rectangle, then tap Start Scan.'}
        </p>
        <div ref={previewFrameRef} className="scanner-camera-frame">
          {phase !== 'scanning' ? (
            <video ref={videoRef} className="scanner-preview-video" playsInline muted />
          ) : null}
          <div id={scannerElementId} className={`scanner-camera${phase === 'scanning' ? ' scanner-camera-active' : ''}`} />
          <div className="camera-tap-layer" onPointerUp={handleCameraTap} aria-hidden="true" />
          {focusRing ? (
            <span
              key={focusRing.id}
              className="camera-focus-ring"
              style={{ left: `${focusRing.x}%`, top: `${focusRing.y}%` }}
              aria-hidden="true"
            />
          ) : null}
          {phase !== 'scanning' ? (
            <div className={`capture-target-box ${scanMode === 'qr' ? 'qr-target-box' : 'barcode-target-box'}`} aria-hidden="true">
              <span className="capture-target-label">{scanMode === 'qr' ? 'Align QR' : 'Align Code'}</span>
            </div>
          ) : null}
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
        <button type="button" className="scanner-start-btn" onClick={handleStartScan} disabled={phase !== 'preview'}>
          {phase === 'scanning' ? 'Scanning...' : 'Start Scan'}
        </button>
        {errorMessage ? (
          <p className="scanner-modal-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
