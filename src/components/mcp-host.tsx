import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { handleMcp } from '@/lib/mcp';
import { setMcpStatus } from '@/lib/mcp-status';
import { useStore } from '@/lib/store';

// Runs the on-phone MCP server while Developer > MCP is on. It holds nothing of its own:
// each request is answered from the live store, then the answer goes back out through the native socket.
// A foreground service (started by the native module) keeps the app alive when you leave it.
export function McpHost() {
  const store = useStore();
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  const { mcp, lan, port, token } = store.dev;
  const on = mcp && store.entered && Platform.OS === 'android' && token.length >= 16;

  useEffect(() => {
    if (!on) {
      setMcpStatus({ listening: false, port: null, error: null });
      return;
    }
    let dead = false;
    let stop: (() => void) | null = null;

    (async () => {
      try {
        const mod = await import('../../modules/kakie-sms');
        if (dead) return;
        const sub = mod.onMcpRequest(({ id, body }) => {
          const s = latest.current;
          const reply = handleMcp(body, {
            you: s.you,
            people: s.people,
            groups: s.groups,
            expenses: s.expenses,
            settlements: s.settlements,
            budget: s.budget,
          });
          setMcpStatus((x) => ({ served: x.served + 1 }));
          mod.mcpReply(id, reply.status, reply.body).catch(() => {});
        });
        stop = () => {
          sub.remove();
          mod.stopMcp().catch(() => {});
        };
        const bound = await mod.startMcp(port, token, lan);
        const addresses = lan ? await mod.localAddresses().catch(() => []) : [];
        if (dead) {
          stop();
          return;
        }
        setMcpStatus({ listening: true, port: bound, error: null, addresses });
      } catch (err) {
        if (!dead) setMcpStatus({ listening: false, port: null, error: err instanceof Error ? err.message : 'Could not start' });
      }
    })();

    return () => {
      dead = true;
      stop?.();
      setMcpStatus({ listening: false, port: null });
    };
  }, [on, port, token, lan]);

  return null;
}
