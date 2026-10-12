// What each key does to the text. Kept free of React so it can be checked without a phone.
// A cursor is a count of characters (not code units) from the start, so emoji count as one.

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

type Rules = Pick<KeyField, 'mode' | 'multiline' | 'maxLength'>;
export type Edit = { value: string; cursor: number };

// Money never needs more than two decimals, and nobody types a nine digit amount on purpose.
const DECIMAL_MAX = 10;

export const clampCursor = (value: string, cursor: number) => Math.max(0, Math.min(cursor, Array.from(value).length));

/** Leading zeros never mean anything in an amount. `007` is `7`, and `0.5` keeps its zero. The cursor follows the text. */
function trimZeros(value: string, cursor: number): Edit {
  const chars = Array.from(value);
  let drop = 0;
  while (drop < chars.length - 1 && chars[drop] === '0' && chars[drop + 1] !== '.') drop += 1;
  return { value: chars.slice(drop).join(''), cursor: Math.max(0, cursor - drop) };
}

/** Apply one key at the cursor. A key that is not allowed changes nothing. */
export function editAt(field: Rules, value: string, cursor: number, key: string): Edit {
  const chars = Array.from(value);
  const at = clampCursor(value, cursor);
  const same: Edit = { value, cursor: at };
  const put = (text: string): Edit => {
    const next = [...chars.slice(0, at), ...Array.from(text), ...chars.slice(at)].join('');
    return { value: next, cursor: at + Array.from(text).length };
  };

  if (key === 'del') {
    if (at === 0) return same;
    return { value: [...chars.slice(0, at - 1), ...chars.slice(at)].join(''), cursor: at - 1 };
  }
  if (key === 'enter') return field.multiline ? put('\n') : same;

  const max = field.maxLength ?? (field.mode === 'decimal' ? DECIMAL_MAX : field.mode === 'phone' ? 15 : field.mode === 'number' ? 9 : 500);
  if (chars.length >= max) return same;

  if (field.mode === 'decimal') {
    if (key === '.') {
      if (value.includes('.')) return same;
      const e = put(at === 0 ? '0.' : '.');
      // Anything after the new dot is the fraction, and it can only be two digits.
      return Array.from(e.value.split('.')[1] ?? '').length > 2 ? same : e;
    }
    if (!/^[0-9]$/.test(key)) return same;
    const e = put(key);
    if (Array.from(e.value.split('.')[1] ?? '').length > 2) return same;
    return trimZeros(e.value, e.cursor);
  }
  if (field.mode === 'number') {
    if (!/^[0-9]$/.test(key)) return same;
    const e = put(key);
    return trimZeros(e.value, e.cursor);
  }
  if (field.mode === 'phone') {
    if (/^[0-9]$/.test(key)) return put(key);
    return key === '+' && at === 0 && !value.includes('+') ? put(key) : same;
  }
  return put(key);
}

/** Typing at the end of the text, which is where most typing happens. */
export function applyKey(field: Rules, value: string, key: string): string {
  return editAt(field, value, Array.from(value).length, key).value;
}

/** Whether the next letter should be a capital, given how the field wants capitals and the text before the cursor. */
export function shouldCap(caps: Caps, before: string): boolean {
  if (caps === 'chars') return true;
  if (caps === 'words') return before === '' || /\s$/.test(before);
  if (caps === 'sentences') return before === '' || /(^|[.!?]\s+|\n)$/.test(before);
  return false;
}

export function pasteAt(field: Rules, value: string, cursor: number, text: string): Edit {
  const clean = field.multiline ? text : text.replace(/\s+/g, ' ').trim();
  let e: Edit = { value, cursor: clampCursor(value, cursor) };
  for (const ch of Array.from(clean)) e = editAt(field, e.value, e.cursor, ch === '\n' ? 'enter' : ch);
  return e;
}

export function pasteInto(field: Rules, value: string, text: string): string {
  return pasteAt(field, value, Array.from(value).length, text).value;
}
