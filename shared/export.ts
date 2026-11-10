// Quoting CSV fields alone does not prevent spreadsheet formula execution.
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
}
