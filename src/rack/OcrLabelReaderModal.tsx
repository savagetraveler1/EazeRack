import { useEffect, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';

export type OcrApplyTarget = 'deviceName' | 'serialNumber' | 'macAddress' | 'assetTag';

export type OcrLabelReaderModalProps = {
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

export function OcrLabelReaderModal({ onApply, onClose }: OcrLabelReaderModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'reading' | 'error'>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setStatus('error');
      setErrorMessage('Unable to capture camera image');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/png');

    try {
      const result = await Tesseract.recognize(imageDataUrl, 'eng');
      const nextText = normalizeOcrText(result.data.text);
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
            Read Device Label
          </h2>
          <button type="button" className="ocr-modal-close" onClick={handleClose}>
            Close
          </button>
        </div>
        <p className="ocr-modal-hint">
          OCR can misread O/0, I/1, and B/8. Verify the text before applying it.
        </p>
        <video ref={videoRef} className="ocr-camera" playsInline muted />
        {errorMessage ? (
          <p className="ocr-modal-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <button type="button" className="ocr-read-btn" onClick={handleReadLabel} disabled={readDisabled}>
          {status === 'reading' ? 'Reading label...' : 'Capture / Read Label'}
        </button>
        {hasText ? (
          <div className="ocr-result-panel">
            <p className="ocr-result-label">Extracted text</p>
            <p className="ocr-result-text">{ocrText}</p>
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
