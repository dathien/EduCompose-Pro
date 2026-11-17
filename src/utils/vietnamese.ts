/**
 * Normalize Vietnamese text for accent-insensitive search while preserving exact original strings.
 */
export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesVietnameseQuery(query: string, fields: (string | undefined)[]): boolean {
  const normalizedQuery = normalizeVietnamese(query);
  if (!normalizedQuery) return true;
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const haystack = normalizeVietnamese(fields.filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function formatRelativeTimeVi(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(timestamp).toLocaleDateString('vi-VN');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(content: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
