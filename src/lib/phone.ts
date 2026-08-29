const BANGLADESH_MOBILE = /^(?:01[3-9]\d{8}|(?:\+?880)?1[3-9]\d{8})$/;

function compact(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

export function isBangladeshMobile(value: string): boolean {
  return BANGLADESH_MOBILE.test(compact(value.trim()));
}

export function normalizeBangladeshMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (/^8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^1[3-9]\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

/** Canonical authentication identifier. UI may accept 01… or +8801…. */
export function normalizeBangladeshMobileE164(value: string): string {
  const local = normalizeBangladeshMobile(value);
  return /^01[3-9]\d{8}$/.test(local) ? `+88${local}` : local;
}
