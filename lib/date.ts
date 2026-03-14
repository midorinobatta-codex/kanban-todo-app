export function formatTaskDate(value: string | null | undefined): string {
  if (!value) return '未設定';

  // YYYY-MM-DD や ISO の先頭日付部分をそのまま使う
  // これで timezone ずれを防ぐ
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${Number(year)}-${Number(month)}-${Number(day)}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${parsed.getMonth() + 1}-${parsed.getDate()}`;
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateOnlySortValue(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed.getTime();
}