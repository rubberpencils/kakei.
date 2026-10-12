const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An amount as people write it: whole rupees stay whole, and any paise show as two digits. Money is never rounded. */
export function inr(n: number) {
  const v = Math.round(Math.abs(n) * 100) / 100;
  return v.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

/** Same as `inr`. Kept so older call sites read the same. */
export const inrExact = inr;

export function money(n: number, sign = false) {
  const body = `₹${inr(n)}`;
  if (!sign) return body;
  return n < 0 ? `−${body}` : `+${body}`;
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localNoon(y: number, m: number, day: number) {
  return `${y}-${pad(m)}-${pad(day)}T12:00:00`;
}

export function monthName(m: number, short = false) {
  return (short ? MONS : MONTHS)[m - 1] ?? '';
}

export function prettyDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'YO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function slugTag(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
}
