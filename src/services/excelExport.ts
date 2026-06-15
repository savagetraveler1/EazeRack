import * as XLSX from 'xlsx';

/** Human-readable U span: one number for 1U, or "bottom-top" for multi-U (matches rack placement). */
export function formatRackUnitsForExcel(block: { startUnit: number; size: number }): string {
  const topU = block.startUnit;
  const bottomU = block.startUnit - block.size + 1;
  if (block.size <= 1) {
    return String(topU);
  }
  return `${bottomU}-${topU}`;
}

export type RackSurveyExcelRow = {
  'Project Name': string;
  'Site Number': string;
  Address: string;
  'Rack Location': string;
  'Rack Number': string;
  'Rack Units': string;
  'Device Type': string;
  'Device Name': string;
  'Serial Number': string;
  'MAC Address': string;
  'Asset Tag': string;
  'Technician Name': string;
  'Export Date': string;
};

export function exportRackSurveyToExcel(rows: RackSurveyExcelRow[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rack Survey');
  XLSX.writeFile(workbook, filename);
}
