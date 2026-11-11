// Safe CSV export helpers.
// - Quotes every cell and doubles embedded quotes (RFC 4180), so names with "," or '"'
//   cannot shift columns.
// - Neutralizes spreadsheet formulas (OWASP CSV injection): cells starting with
//   = + - @ TAB or CR are prefixed with an apostrophe so Excel treats them as text.
// - Downloads via a Blob instead of a data: URL, so '#' or very large exports are not
//   truncated by URL encoding.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  // BOM so Excel opens UTF-8 (Urdu names) correctly.
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
