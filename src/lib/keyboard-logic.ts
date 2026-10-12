// What each key does to the text. Kept free of React so it can be checked without a phone.

export type KeyMode = 'text' | 'decimal' | 'number' | 'phone';
export type Caps = 'none' | 'words' | 'sentences' | 'chars';

export type KeyField = {
  id: string;
  mode: KeyMode;
  caps: Caps;
  label?: string;
  multiline?: boolean;
  maxLength?: number;
};

// Money never needs more than two decimals, and nobody types a nine digit amount on purpose.
const DECIMAL_MAX = 10;

export function applyKey(field: Pick<KeyField, 'mode' | 'multiline' | 'maxLength'>, value: string, key: string): string {
  if (key === 'del') return Array.from(value).slice(0, -1).join('');
  if (key === 'enter') return field.multiline ? `${value}\n` : value;

  const max = field.maxLength ?? (field.mode === 'decimal' ? DECIMAL_MAX : field.mode === 'phone' ? 15 : field.mode === 'number' ? 9 : 500);
  if (Array.from(value).length >= max) return value;

  if (field.mode === 'decimal') {
    if (key === '.') return value.includes('.') ? value : `${value || '0'}.`;
    if (!/^[0-9]$/.test(key)) return value;
    const [, frac] = value.split('.');
    if (frac !== undefined && frac.length >= 2) return value;
    return value === '0' ? key : value + key;
  }
  if (field.mode === 'number') return /^[0-9]$/.test(key) ? (value === '0' ? key : value + key) : value;
  if (field.mode === 'phone') return /^[0-9]$/.test(key) || (key === '+' && !value) ? value + key : value;
  return value + key;
}

/** Whether the next letter should be a capital, given how the field wants capitals. */
export function shouldCap(caps: Caps, value: string): boolean {
  if (caps === 'chars') return true;
  if (caps === 'words') return value === '' || /\s$/.test(value);
  if (caps === 'sentences') return value === '' || /(^|[.!?]\s+|\n)$/.test(value);
  return false;
}

export function pasteInto(field: Pick<KeyField, 'mode' | 'multiline' | 'maxLength'>, value: string, text: string): string {
  const clean = field.multiline ? text : text.replace(/\s+/g, ' ').trim();
  let next = value;
  for (const ch of Array.from(clean)) next = applyKey(field, next, ch === '\n' ? 'enter' : ch);
  return next;
}
