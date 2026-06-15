import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';

export type BarcodeScannerModalProps = {
  title: string;
  onScan: (value: string) => void;
  onClose: () => void;
};

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

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
              return { width: size, height: size };
            },
          },
          (decodedText: string, _decodedResult: Html5QrcodeResult) => {
            if (completedRef.current) {
              return;
            }
            completedRef.current = true;
            void stopScanner().finally(() => {
              if (!cancelled) {
                onScan(decodedText);
              }
            });
          },
          () => {
            // Decode misses are expected while the camera is scanning.
          },
        );
      } catch {
        if (!cancelled) {
          setErrorMessage('Unable to start camera scanner');
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
