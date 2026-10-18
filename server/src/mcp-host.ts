import { handleMcp, type McpData } from '../../shared/read.ts';

const BANNED = new Set(['account', 'bank', 'body', 'sms', 'sender']);

export function privateKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = privateKey(item);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BANNED.has(key)) return key;
    const hit = privateKey(child);
    if (hit) return hit;
  }
  return null;
}

export function answerMcp(raw: string, data: McpData) {
  return handleMcp(raw, data);
}

export type { McpData };
