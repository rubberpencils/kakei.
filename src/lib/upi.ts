export const VPA = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/;

export type PayStatus = 'success' | 'pending' | 'failed' | 'cancelled' | 'no-app' | 'unknown' | 'unsupported';

export function cleanVpa(raw: string) {
  const v = raw.trim().toLowerCase();
  return VPA.test(v) ? v : null;
}

export function maskVpa(vpa: string) {
  const [user, host] = vpa.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, Math.min(6, user.length - 2)))}@${host}`;
}

// Person-to-person link only: merchant fields like tr make GPay and others refuse the payment.
export function upiLink(p: { vpa: string; amount: number; note: string }) {
  // pa stays raw: some apps don't decode %40, and a validated VPA has no characters that need escaping.
  const q: [string, string][] = [
    ['am', p.amount.toFixed(2)],
    ['cu', 'INR'],
    ['tn', p.note.slice(0, 60)],
  ];
  return `upi://pay?pa=${p.vpa}&${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export function readUpiResponse(raw: string): PayStatus {
  if (raw === 'NO_APP') return 'no-app';
  if (!raw) return 'cancelled';
  const status = /(?:^|&)status=([a-z]+)/i.exec(raw)?.[1]?.toLowerCase();
  if (status === 'success') return 'success';
  if (status === 'submitted' || status === 'pending') return 'pending';
  return 'failed';
}
