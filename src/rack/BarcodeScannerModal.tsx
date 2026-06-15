import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';

export type BarcodeScannerModalProps = {
  title: string;
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

export function BarcodeScannerModal({ title, onScan, onClose }: BarcodeScannerModalProps) {
  const scannerElementId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const completedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerElementId);
    scannerRef.current = scanner;
    let cancelled = false;

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

    const scanConfig: Parameters<Html5Qrcode['start']>[1] = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
        return { width: size, height: size };
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
      try {
        await scanner.start(
          { facingMode: 'environment' },
          scanConfig,
          handleScanSuccess,
          handleScanMiss,
        );
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
        } catch (defaultCameraError) {
          console.error('Barcode scanner failed to start with default camera:', defaultCameraError);
          if (cancelled) {
            return;
          }
          const detail = formatScannerStartupError(defaultCameraError || rearCameraError);
          setErrorMessage(
            `Camera could not start. Please check camera permission or try opening in Chrome. Details: ${detail}`,
          );
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [onScan, scannerElementId]);

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
        <p className="scanner-modal-hint">Point the rear camera at a QR code or barcode.</p>
        <div id={scannerElementId} className="scanner-camera" />
        {errorMessage ? (
          <p className="scanner-modal-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
