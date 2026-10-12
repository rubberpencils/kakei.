import { useSyncExternalStore } from 'react';

import { applyKey, pasteInto, type KeyField } from './keyboard-logic';

export type { Caps, KeyField, KeyMode } from './keyboard-logic';

// One keyboard for the whole app. A field registers here when tapped, the keyboard types into whichever field is active.
type Handlers = { onChange: (v: string) => void; onSubmit?: () => void };
type State = {
  field: KeyField | null;
  value: string;
  // The last field that was open. The keyboard keeps drawing its layout while it slides away.
  last: KeyField | null;
  keepFocus: boolean;
};

let state: State = { field: null, value: '', last: null, keepFocus: false };
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

export function focusField(field: KeyField, value: string, keepFocus = false) {
  set({ field, value, last: field, keepFocus });
}

export function syncValue(id: string, value: string) {
  if (state.field?.id === id && state.value !== value) set({ value });
}

export function blurField(id?: string) {
  if (state.field && (!id || state.field.id === id)) set({ field: null, value: '' });
}

export function typeKey(key: string) {
  const f = state.field;
  if (!f) return;
  const next = applyKey(f, state.value, key);
  if (next !== state.value) {
    set({ value: next });
    handlers.get(f.id)?.onChange(next);
  }
}

export function pasteText(text: string) {
  const f = state.field;
  if (!f) return;
  const next = pasteInto(f, state.value, text);
  if (next !== state.value) {
    set({ value: next });
    handlers.get(f.id)?.onChange(next);
  }
}

/** The return key on a single-line field: hand the text over, then close unless the field asked to stay open. */
export function submitField() {
  const f = state.field;
  if (!f) return;
  handlers.get(f.id)?.onSubmit?.();
  if (!state.keepFocus) blurField(f.id);
}
