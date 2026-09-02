/** Calendar year used by shop-facing document numbers. */
export function dhakaYear(value: Date): number {
  return Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
  }).format(value));
}

/** YYYY-MM-DD calendar key in the shop timezone. */
export function dhakaDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Shop-facing date, for example: 12 Aug, 2026. */
export function formatDhakaDate(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}, ${part('year')}`;
}

/** Shop-facing 12-hour date and time, for example: 12 Aug, 2026, 4:30 PM. */
export function formatDhakaDateTime(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}, ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}
