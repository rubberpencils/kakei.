// What a field accepts. Kept free of React so it can be checked without a phone.

export type InputMode = 'text' | 'decimal' | 'number' | 'phone' | 'url';

// Money never needs more than two decimals, and nobody types a nine digit amount on purpose.
const DECIMAL_MAX = 10;

/** Leading zeros never mean anything in an amount. `007` is `7`, and `0.5` keeps its zero. */
function trimZeros(value: string) {
  return value.replace(/^0+(?=\d)/, '');
}

/** Clean what was typed or pasted into a field of this kind. Text and URLs pass through untouched. */
export function sanitize(mode: InputMode, value: string, maxLength?: number): string {
  let out = value;
  if (mode === 'decimal') {
    out = out.replace(/[^0-9.]/g, '');
    const dot = out.indexOf('.');
    if (dot !== -1) out = `${out.slice(0, dot + 1)}${out.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
    if (out.startsWith('.')) out = `0${out}`;
    out = trimZeros(out).slice(0, maxLength ?? DECIMAL_MAX);
  } else if (mode === 'number') {
    out = trimZeros(out.replace(/[^0-9]/g, '')).slice(0, maxLength ?? 9);
  } else if (mode === 'phone') {
    out = out.replace(/(?!^\+)[^0-9]/g, '').slice(0, maxLength ?? 15);
  } else if (maxLength !== undefined) {
    out = out.slice(0, maxLength);
  }
  return out;
}
