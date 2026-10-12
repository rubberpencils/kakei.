import { useSyncExternalStore } from 'react';

import { clampCursor, editAt, pasteAt, type KeyField } from './keyboard-logic';

export type { Caps, KeyField, KeyMode } from './keyboard-logic';

// One keyboard for the whole app. A field registers here when tapped, the keyboard types into whichever field is active.
type Handlers = { onChange: (v: string) => void; onSubmit?: () => void };
type State = {
  field: KeyField | null;
  value: string;
  // Where the caret is, as a count of characters from the start.
  cursor: number;
  // The last field that was open. The keyboard keeps drawing its layout while it slides away.
  last: KeyField | null;
  keepFocus: boolean;
};

let state: State = { field: null, value: '', cursor: 0, last: null, keepFocus: false };
const handlers = new Map<string, Handlers>();
const subs = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

export function useKeyboard() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => state,
    () => state,
  );
}

export function registerField(id: string, h: Handlers) {
  handlers.set(id, h);
}

export function unregisterField(id: string) {
  handlers.delete(id);
  blurField(id);
}

/** Open a field. The caret goes to `cursor`, or to the end when none is given. */
export function focusField(field: KeyField, value: string, keepFocus = false, cursor?: number) {
  set({ field, value, cursor: clampCursor(value, cursor ?? Array.from(value).length), last: field, keepFocus });
}

export function syncValue(id: string, value: string) {
  if (state.field?.id !== id || state.value === value) return;
  // The screen changed the text itself, such as dropping a character it does not allow. Keep the caret where it was.
  set({ value, cursor: clampCursor(value, state.cursor) });
}

export function blurField(id?: string) {
  if (state.field && (!id || state.field.id === id)) set({ field: null, value: '', cursor: 0 });
}

/** Move the caret inside the open field. */
export function setCursor(cursor: number) {
  if (!state.field) return;
  const next = clampCursor(state.value, cursor);
  if (next !== state.cursor) set({ cursor: next });
}

export function moveCursor(delta: number) {
  setCursor(state.cursor + delta);
}

function commit(next: { value: string; cursor: number }) {
  const f = state.field;
  if (!f) return;
  const changed = next.value !== state.value;
  if (!changed && next.cursor === state.cursor) return;
  set({ value: next.value, cursor: next.cursor });
  if (changed) handlers.get(f.id)?.onChange(next.value);
}

export function typeKey(key: string) {
  const f = state.field;
  if (!f) return;
  commit(editAt(f, state.value, state.cursor, key));
}

export function pasteText(text: string) {
  const f = state.field;
  if (!f) return;
  commit(pasteAt(f, state.value, state.cursor, text));
}

/** The return key on a single-line field: hand the text over, then close unless the field asked to stay open. */
export function submitField() {
  const f = state.field;
  if (!f) return;
  handlers.get(f.id)?.onSubmit?.();
  if (!state.keepFocus) blurField(f.id);
}
