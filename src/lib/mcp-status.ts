import { useSyncExternalStore } from 'react';

import type { LocalAddress } from '../../modules/kakie-sms';

export type McpStatus = { listening: boolean; port: number | null; error: string | null; served: number; addresses: LocalAddress[] };

let state: McpStatus = { listening: false, port: null, error: null, served: 0, addresses: [] };
const subs = new Set<() => void>();

export function setMcpStatus(patch: Partial<McpStatus> | ((s: McpStatus) => Partial<McpStatus>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((f) => f());
}

export function useMcpStatus() {
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
