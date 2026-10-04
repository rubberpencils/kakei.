import type { Rail } from './types';
import { localNoon } from './format';

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
  t = t.replace(/\b(PVT LTD|PRIVATE LIMITED|LTD)\b.*/i, '');
  t = t.replace(/\bSALARY\b.*/i, '');
  t = t.replace(/\bPAY IN\b.*/i, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return 'Payment';
  if (t === t.toUpperCase()) return titleCase(t);
  return t;
}

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
  return 'Payment';
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
  const amt = body.match(/(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!amt) return null;
  const amount = Number(amt[1].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;

  const credited = /\b(credited|credit of|received|deposited)\b/i.test(body);
  const debited = /\b(debited|spent|withdrawn|purchase|paid)\b/i.test(body);
  if (!credited && !debited) return null;
  const income = credited && !debited;

  const transfer = /credit card[\s\S]{0,40}payment|towards[\s\S]{0,40}credit card|card bill/i.test(body);
  let rail: Rail = 'debit';
  if (/vpa\b|\bupi\b|@[a-z]{2,}/i.test(body) && !/spent using/i.test(body)) rail = 'upi';
  else if (/spent using|credit card/i.test(body) && !transfer) rail = 'credit';
  else if (/\bimps\b/i.test(body)) rail = 'imps';
  else if (/\bneft\b|\brtgs\b/i.test(body)) rail = 'neft';
  else if (/\bdebit card\b/i.test(body)) rail = 'debit';

  const bank = BANKS.find(([re]) => re.test(sender.toUpperCase()))?.[1] ?? 'Bank';
  const merchant = transfer ? 'Card bill' : merchantFrom(body);
  const account = body.match(/(?:XX|\*{2,}|x{2,})(\d{4})/i)?.[1] ?? null;

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
