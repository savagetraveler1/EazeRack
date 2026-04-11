import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const EAZEDOC_URL = 'https://eazedoc.com';

export type ExportFilenameMeta = {
  projectName: string;
  rackLocation: string;
  rackNumber: string;
};

/**
 * Builds a readable PDF filename from project + rack identity.
 * Sanitizes Windows/macOS-invalid characters; uses hyphens within segments, underscores between segments.
 */
export function buildExportFilename(meta: ExportFilenameMeta): string {
  const sanitizeSegment = (raw: string): string => {
    const s = raw
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s;
  };

  const parts: string[] = [];
  const p = sanitizeSegment(meta.projectName);
  const loc = sanitizeSegment(meta.rackLocation);
  const num = sanitizeSegment(meta.rackNumber.replace(/^rack\s*/i, ''));
  const rackSeg = num ? `Rack-${num}` : '';

  if (p) {
    parts.push(p);
  }
  if (loc) {
    parts.push(loc);
  }
  if (rackSeg) {
    parts.push(rackSeg);
  }

  const base = parts.length > 0 ? parts.join('_') : 'rack-layout';
  return `${base}.pdf`;
}

/**
 * Rasterizes a DOM element (typically a print-only rack preview) and saves a PDF.
 * Uses **html2canvas** to capture pixels + **jsPDF** to embed the image on an A4 page.
 * Adds subtle vector footer branding with a clickable URL (PDF link annotation).
 */
export async function exportRackElementToPdf(
  element: HTMLElement,
  filename = 'rack-layout.pdf',
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const maxW = pageWidth - margin * 2;
  const footerReserve = 36;
  const maxH = pageHeight - margin * 2 - footerReserve;
  const imgW = canvas.width;
  const imgH = canvas.height;
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  const drawW = imgW * ratio;
  const drawH = imgH * ratio;
  const x = (pageWidth - drawW) / 2;
  const y = margin;
  pdf.addImage(imgData, 'PNG', x, y, drawW, drawH);

  const footerY = pageHeight - margin;
  const lineGap = 10;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(130, 132, 140);
  pdf.text('Powered by EazeDoc', pageWidth - margin, footerY - lineGap, { align: 'right' });
  pdf.textWithLink('eazedoc.com', pageWidth - margin, footerY, {
    align: 'right',
    url: EAZEDOC_URL,
  });

  pdf.save(filename);
}
