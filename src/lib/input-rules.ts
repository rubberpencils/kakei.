/** What a field may contain. Used by the system keyboard fields, checked without a phone. */

/** Digits and one dot, at most two paise. `007` is `7`. `0.5` keeps its zero. */
export function cleanAmount(raw: string) {
  let v = raw.replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot >= 0) v = `${v.slice(0, dot + 1)}${v.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
  if (v.length > 1 && v.startsWith('0') && v[1] !== '.') v = v.replace(/^0+/, '') || '0';
  return v.slice(0, 10);
}

/** Whole rupees. */
export function cleanNumber(raw: string) {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
}

/** A phone. One leading plus, then digits. */
export function cleanPhone(raw: string) {
  const plus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '').slice(0, 15);
  return plus ? `+${digits}` : digits;
}
