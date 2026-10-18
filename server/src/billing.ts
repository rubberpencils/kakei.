import { createSign } from 'node:crypto';

const PACKAGE = 'app.kakie';
const LIVE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);

type ServiceAccount = { client_email: string; private_key: string };

function b64url(buf: Buffer | string) {
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return raw.toString('base64url');
}

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  const assertion = `${unsigned}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error('Google did not grant a token');
  return json.access_token;
}

export function googleVerifier(raw: string) {
  const account = JSON.parse(raw) as ServiceAccount;
  return async (purchaseToken: string, productId: string) => {
    const token = await accessToken(account);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as {
      subscriptionState?: string;
      lineItems?: { productId?: string; expiryTime?: string }[];
      acknowledgementState?: string;
    };
    if (!res.ok) throw new Error('Play could not verify that purchase');
    const line = body.lineItems?.find((item) => item.productId === productId) ?? body.lineItems?.[0];
    const expiry = line?.expiryTime ? Date.parse(line.expiryTime) : 0;
    if (!LIVE.has(body.subscriptionState ?? '') || !Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new Error('That purchase is not active');
    }
    if (line?.productId && line.productId !== productId) throw new Error('That purchase is for a different plan');
    if (body.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' },
      );
    }
    return { expiry };
  };
}
