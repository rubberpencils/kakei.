import type { Rail } from './types.ts';
import { localNoon } from './format.ts';

export type ParsedSms = {
  bank: string;
  amount: number;
  income: boolean;
  transfer: boolean;
  merchant: string;
  rail: Rail;
  tag: string | null;
  account: string | null;
  at: string | null;
};

const BANKS: [RegExp, string][] = [
  [/HDFC/, 'HDFC'],
  [/ICICI/, 'ICICI'],
  [/SBI/, 'SBI'],
  [/AXIS/, 'Axis'],
  [/KOTAK|KKBK/, 'Kotak'],
  [/YESBK|YESBNK/, 'Yes Bank'],
  [/PNB|PUNB/, 'PNB'],
  [/IDFCF|IDFC/, 'IDFC'],
  [/BARB|BOB/, 'Bank of Baroda'],
  [/INDB|INDUS/, 'IndusInd'],
  [/UBIN|UNION/, 'Union Bank'],
  [/CANBNK|CANARA/, 'Canara'],
  [/PAYTM/, 'Paytm'],
];

const TAGS: [RegExp, string][] = [
  [/starbucks|cafe|coffee|third wave/, 'coffee'],
  [/swiggy|zomato|deli|restaurant|canteen|thalassa/, 'food'],
  [/uber|ola|rapido|namma yatri/, 'transport'],
  [/amazon|myntra|flipkart|ajio/, 'shopping'],
  [/blinkit|zepto|bigbasket|instamart|grocery/, 'groceries'],
  [/netflix|spotify|bookmyshow|hotstar|prime video/, 'entertainment'],
  [/airtel|jio|vi\b|electric|bescom|wifi|broadband/, 'bills'],
  [/petrol|fuel|hpcl|iocl|bpcl|indian oil/, 'fuel'],
  [/pharmacy|apollo|doctor|hospital|clinic/, 'medical'],
  [/rent/, 'rent'],
  [/salary|stipend/, 'salary'],
];

const MONTH: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function cleanMerchant(raw: string) {
  let t = raw.replace(/\s+/g, ' ').replace(/[.,]+$/g, '').trim();
  t = t.replace(/^(refund|reversal)\s+(from|of)\s+/i, '');
  t = t.replace(/\b(PVT LTD|PRIVATE LIMITED|LTD)\b.*/i, '');
  t = t.replace(/\bSALARY\b.*/i, '');
  t = t.replace(/\bPAY IN\b.*/i, '');
  t = t.replace(/\bUPI\b/gi, '');
  t = t.replace(/\d{6,}/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return 'Payment';
  if (t === t.toUpperCase()) return titleCase(t);
  return t;
}

export { cleanMerchant };

function merchantFrom(body: string) {
  const vpa = body.match(/vpa\s+([a-z0-9._-]+)@/i);
  if (vpa) {
    const head = vpa[1].split('.')[0].replace(/[^a-z]/gi, '');
    if (head) return titleCase(head);
  }
  const neft = body.match(/NEFT-([A-Z][A-Z0-9 .&-]{2,48})/i);
  if (neft) return cleanMerchant(neft[1]);
  const on = body.match(/\bon\s+([A-Z][A-Z0-9 .&-]{2,40})/);
  if (on) return cleanMerchant(on[1]);
  const towards = body.match(/towards\s+(.+?)(?:\s+payment|\.|$)/i);
  if (towards) return cleanMerchant(towards[1].replace(/\bXX\d+\b/gi, ''));
  const to = body.match(/\bto\s+([A-Za-z][A-Za-z0-9.&'-]{1,24})/i);
  if (to && !/^vpa$/i.test(to[1])) return cleanMerchant(to[1]);
  return 'Payment';
}

/** First rupee amount in a chip or a line. A date or a long ref does not count. */
export function readMoney(text: string): number | null {
  const m = text.match(/(?:(?:rs\.?|inr|₹)\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)|([0-9]+\.[0-9]{2})(?!\d)/i);
  const raw = m?.[1] || m?.[2] || m?.[3];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return n > 0 ? n : null;
}

export function guessRail(body: string, transfer = false): Rail {
  if (!transfer && /\sCC\s/.test(body)) return 'credit';
  if (/vpa\b|\bupi\b|@[a-z]{2,}/i.test(body) && !/spent using/i.test(body)) return 'upi';
  if (/spent using|credit card/i.test(body) && !transfer) return 'credit';
  if (/\bimps\b/i.test(body)) return 'imps';
  if (/\bneft\b|\brtgs\b/i.test(body)) return 'neft';
  if (/\bdebit card\b/i.test(body)) return 'debit';
  return 'debit';
}

function suggestTag(merchant: string, income: boolean, transfer: boolean) {
  if (transfer) return 'bills';
  if (income) return 'salary';
  const hay = merchant.toLowerCase();
  for (const [re, tag] of TAGS) if (re.test(hay)) return tag;
  return null;
}

function parseWhen(body: string) {
  const m = body.match(/(\d{1,2})[-/](\d{1,2}|[A-Za-z]{3})[-/](\d{2,4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const monRaw = m[2];
  const month = /^\d+$/.test(monRaw) ? Number(monRaw) : MONTH[monRaw.slice(0, 3).toLowerCase()];
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return localNoon(year, month, day);
}

export function parseSms(sender: string, body: string): ParsedSms | null {
  if (!body || body.length < 12) return null;
  if (/\botp\b|one time password|do not share|verification code/i.test(body)) return null;
  if (/\b(failed|unsuccessful|declined)\b/i.test(body)) return null;
  const amt = body.match(/(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!amt) return null;
  const amount = Number(amt[1].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;

  const credited = /\b(credited|credit of|received|deposited)\b/i.test(body);
  const debited = /\b(debited|spent|withdrawn|purchase|paid|sent|transferred)\b/i.test(body);
  if (!credited && !debited) return null;
  const income = credited && !debited;

  // Paying the card off is a transfer, not spend, even when the bank writes the card as "CC".
  const transfer = /credit card[\s\S]{0,40}payment|towards[\s\S]{0,40}(?:credit card|\scc\s)|\scc\s[\s\S]{0,30}payment|card bill/i.test(body);
  const rail = guessRail(body, transfer);

  const bank = BANKS.find(([re]) => re.test(sender.toUpperCase()))?.[1] ?? 'Bank';
  const merchant = transfer ? 'Card bill' : merchantFrom(body);
  const account = body.match(/(?:XX|\*{1,}|x{2,})(\d{3,6})/i)?.[1] ?? null;

  return {
    bank,
    amount,
    income,
    transfer,
    merchant,
    rail,
    tag: suggestTag(merchant, income, transfer),
    account,
    at: parseWhen(body),
  };
}

export type FormatRule = {
  sender: string;
  amountBefore: string;
  amountAfter: string;
  merchantBefore: string;
  merchantAfter: string;
};

export type MerchantRule = { key: string; tag?: string; groupId?: string };

export type Hit = { merchant: string; amount: number; at: number };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function spanContext(body: string, slice: string) {
  const i = body.indexOf(slice);
  if (i < 0 || !slice) return null;
  return { before: body.slice(Math.max(0, i - 12), i), after: body.slice(i + slice.length, i + slice.length + 12) };
}

function capture(body: string, before: string, after: string) {
  if (!before && !after) return null;
  const m = body.match(new RegExp(esc(before) + '(?:(?:rs\\.?|inr|₹)\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)' + esc(after), 'i'));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return n > 0 ? n : null;
}

function captureText(body: string, before: string, after: string) {
  if (!before && !after) return null;
  const m = body.match(new RegExp(esc(before) + '(.{2,40}?)' + esc(after)));
  return m ? m[1].trim() : null;
}

export function parseWithRules(sender: string, body: string, formats: FormatRule[], merchants: MerchantRule[]): ParsedSms | null {
  let parsed = parseSms(sender, body);
  const taught = formats.find((r) => r.sender === sender);
  if (!parsed && taught) {
    const amount = capture(body, taught.amountBefore, taught.amountAfter);
    if (amount) {
      const merchant = cleanMerchant(captureText(body, taught.merchantBefore, taught.merchantAfter) || 'Payment');
      parsed = {
        bank: BANKS.find(([re]) => re.test(sender.toUpperCase()))?.[1] ?? 'Bank',
        amount,
        income: false,
        transfer: false,
        merchant,
        rail: guessRail(body),
        tag: suggestTag(merchant, false, false),
        account: null,
        at: parseWhen(body),
      };
    }
  }
  if (!parsed) return null;
  const rule = merchants.find((r) => r.key === parsed.merchant.toLowerCase());
  return rule?.tag ? { ...parsed, tag: rule.tag } : parsed;
}

export function isRecentDupe(hits: Hit[], merchant: string, amount: number, at: number) {
  const key = merchant.toLowerCase();
  return hits.some((h) => h.merchant === key && h.amount === amount && Math.abs(h.at - at) < 180_000);
}
