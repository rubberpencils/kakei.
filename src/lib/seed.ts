import { localNoon } from './format';
import { equalShares } from './ledger';
import { parseSms } from './parser';
import type { Draft, Expense, Group, MonthSnapshot, Person, Settlement } from './types';

export const TAGS = ['food', 'coffee', 'transport', 'groceries', 'shopping', 'entertainment', 'bills', 'rent', 'fuel', 'medical', 'travel', 'salary'];

const RAWS: [string, string, string][] = [
  ['q1', 'VM-HDFCBK', 'Rs.1240.00 debited from A/c XX4521 on 02-10-26 to VPA swiggy@icici. UPI Ref 426781234.'],
  ['q2', 'AD-ICICIT', 'INR 3,499.00 spent using ICICI Bank Card XX9012 on 02-Oct-26 on AMAZON PAY IN.'],
  ['q3', 'VM-HDFCBK', 'Rs.386.00 debited from A/c XX4521 on 02-10-26 to VPA uber.india@axisbank.'],
  ['q4', 'JD-SBIINB', 'Your A/c XX7710 is credited Rs.85,000.00 on 01/10/26 by NEFT-ACME TECHNOLOGIES PVT LTD SALARY OCT26.'],
  ['q5', 'VM-HDFCBK', 'Rs.2150.00 debited from A/c XX4521 on 01-10-26 to VPA blinkit.payu@hdfcbank.'],
  ['q6', 'AX-AXISBK', 'INR 12,340.00 debited from A/c no. XX3308 on 01-10-26 towards HDFC Bank Credit Card XX2207 payment.'],
];

// Server ids are global, so every sample row is suffixed with the signed-in user's id.
export function sampleData(youId: string) {
  const tail = youId.slice(0, 8);
  const id = (x: string) => (x === 'you' ? youId : `${x}-${tail}`);
  const P = (key: string, name: string, initials: string): Person => ({ id: id(key), name, initials });
  const people = [
    P('aarav', 'Aarav Mehta', 'AM'),
    P('meera', 'Meera Iyer', 'MI'),
    P('kabir', 'Kabir Shah', 'KS'),
    P('riya', 'Riya Das', 'RD'),
    P('ishaan', 'Ishaan Bhatt', 'IB'),
    P('tara', 'Tara Kapoor', 'TK'),
  ];
  const G = (key: string, name: string, icon: string, members: string[], note: string): Group => ({
    id: id(key), name, icon, memberIds: members.map(id), note, sample: true,
  });
  const groups = [
    G('goa', 'Goa trip', 'beach', ['aarav', 'meera', 'kabir'], '18-22 Sep'),
    G('flat', 'Flat 402', 'office-building', ['riya', 'kabir'], 'Shared home'),
    G('lunch', 'Friday lunches', 'silverware-fork-knife', ['aarav', 'ishaan', 'tara'], 'Office'),
  ];
  const base = { income: false, transfer: false, recurring: null, recurId: null, groupId: null, payerId: null, shares: null, reflect: true, sample: true };
  const solo = (p: Partial<Expense> & Pick<Expense, 'merchant' | 'amount' | 'at' | 'tag' | 'rail'> & { key: string }): Expense => {
    const { key, ...rest } = p;
    return { ...base, ...rest, id: id(key), recurId: rest.recurId ? id(rest.recurId) : null };
  };
  const ge = (key: string, merchant: string, amount: number, day: number, tag: string, rail: Expense['rail'], group: string, payer: string, members: string[]): Expense => ({
    ...base, id: id(key), merchant, amount, at: localNoon(2026, 9, day), tag, rail,
    groupId: id(group), payerId: id(payer), shares: equalShares(amount, members.map(id)),
  });
  const goa = ['you', 'aarav', 'meera', 'kabir'];
  const flat = ['you', 'riya', 'kabir'];
  const lunch = ['you', 'aarav', 'ishaan', 'tara'];
  const expenses: Expense[] = [
    solo({ key: 't1', merchant: 'Third Wave Coffee', tag: 'coffee', rail: 'upi', amount: 320, at: localNoon(2026, 9, 28), bank: 'HDFC', account: '4521' }),
    solo({ key: 't2', merchant: 'Zepto', tag: 'groceries', rail: 'upi', amount: 864, at: localNoon(2026, 9, 28), bank: 'HDFC', account: '4521' }),
    solo({ key: 't3', merchant: 'Rapido', tag: 'transport', rail: 'upi', amount: 142, at: localNoon(2026, 9, 27), bank: 'HDFC', account: '4521' }),
    solo({ key: 't4', merchant: 'BookMyShow', tag: 'entertainment', rail: 'credit', amount: 780, at: localNoon(2026, 9, 27), bank: 'ICICI', account: '9012' }),
    solo({ key: 't5', merchant: 'Apollo Pharmacy', tag: 'medical', rail: 'upi', amount: 455, at: localNoon(2026, 9, 27) }),
    solo({ key: 't6', merchant: 'Zepto', tag: 'groceries', rail: 'upi', amount: 640, at: localNoon(2026, 9, 27) }),
    solo({ key: 't7', merchant: 'Acme Technologies', tag: 'salary', rail: 'neft', amount: 85000, at: localNoon(2026, 9, 25), income: true, bank: 'SBI', account: '7710' }),
    solo({ key: 't8', merchant: 'Airtel Postpaid', tag: 'bills', rail: 'credit', amount: 999, at: localNoon(2026, 9, 23), recurring: 'monthly', recurId: 'airtel' }),
    solo({ key: 't9', merchant: 'Myntra', tag: 'shopping', rail: 'credit', amount: 2799, at: localNoon(2026, 9, 21), bank: 'ICICI', account: '9012' }),
    solo({ key: 't10', merchant: 'Netflix', tag: 'entertainment', rail: 'credit', amount: 649, at: localNoon(2026, 9, 21), recurring: 'monthly', recurId: 'netflix' }),
    solo({ key: 't11', merchant: 'Swiggy', tag: 'food', rail: 'upi', amount: 340, at: localNoon(2026, 9, 21) }),
    solo({ key: 't12', merchant: 'Starbucks', tag: 'coffee', rail: 'credit', amount: 620, at: localNoon(2026, 9, 19) }),
    solo({ key: 't13', merchant: 'Ola', tag: 'transport', rail: 'upi', amount: 280, at: localNoon(2026, 9, 19) }),
    solo({ key: 't14', merchant: 'Amazon', tag: 'shopping', rail: 'credit', amount: 1450, at: localNoon(2026, 9, 18) }),
    solo({ key: 't15', merchant: 'Blinkit', tag: 'groceries', rail: 'upi', amount: 2150, at: localNoon(2026, 9, 18) }),
    solo({ key: 't16', merchant: 'Doctor visit', tag: 'medical', rail: 'upi', amount: 800, at: localNoon(2026, 9, 15) }),
    solo({ key: 't17', merchant: 'Petrol', tag: 'fuel', rail: 'debit', amount: 1200, at: localNoon(2026, 9, 13), bank: 'Axis', account: '3308' }),
    solo({ key: 't18', merchant: 'Smoke House Deli', tag: 'food', rail: 'credit', amount: 2840, at: localNoon(2026, 9, 13) }),
    solo({ key: 't19', merchant: 'Zepto', tag: 'groceries', rail: 'upi', amount: 1340, at: localNoon(2026, 9, 12) }),
    solo({ key: 't20', merchant: 'Zomato', tag: 'food', rail: 'upi', amount: 480, at: localNoon(2026, 9, 9) }),
    solo({ key: 't21', merchant: 'Ola', tag: 'transport', rail: 'upi', amount: 240, at: localNoon(2026, 9, 9) }),
    solo({ key: 't22', merchant: 'Pharmacy', tag: 'medical', rail: 'upi', amount: 350, at: localNoon(2026, 9, 3) }),
    solo({ key: 't23', merchant: 'Swiggy', tag: 'food', rail: 'upi', amount: 280, at: localNoon(2026, 9, 3) }),
    solo({ key: 't24', merchant: 'Rent', tag: 'rent', rail: 'upi', amount: 18000, at: localNoon(2026, 9, 1), recurring: 'monthly', recurId: 'rent' }),
    solo({ key: 'o1', merchant: 'Filter coffee', tag: 'coffee', rail: 'upi', amount: 180, at: localNoon(2026, 10, 1) }),
    solo({ key: 'o2', merchant: 'Swiggy', tag: 'food', rail: 'upi', amount: 540, at: localNoon(2026, 10, 2) }),
    ge('g1', 'Dinner at Thalassa', 4800, 19, 'food', 'upi', 'goa', 'you', goa),
    ge('g2', 'Scooter rentals', 3200, 18, 'transport', 'upi', 'goa', 'you', goa),
    ge('g3', 'Villa, 3 nights', 24000, 20, 'travel', 'neft', 'goa', 'meera', goa),
    ge('g4', 'Seafood lunch', 2800, 19, 'food', 'upi', 'goa', 'kabir', goa),
    ge('f1', 'Electricity', 3480, 23, 'bills', 'upi', 'flat', 'riya', flat),
    ge('f2', 'Wi-Fi', 2100, 12, 'bills', 'upi', 'flat', 'riya', flat),
    ge('f3', 'Groceries restock', 2460, 8, 'groceries', 'upi', 'flat', 'kabir', flat),
    ge('l1', 'Bombay Canteen', 2480, 19, 'food', 'upi', 'lunch', 'you', lunch),
    ge('l2', 'Meghana Foods', 1920, 12, 'food', 'upi', 'lunch', 'ishaan', lunch),
  ];
  const S = (key: string, group: string, from: string, to: string, amount: number, day: number, method: Settlement['method']): Settlement => ({
    id: id(key), groupId: id(group), fromId: id(from), toId: id(to), amount, at: localNoon(2026, 9, day), method, sample: true,
  });
  const settlements = [
    S('set1', 'goa', 'aarav', 'you', 1200, 25, 'upi'),
    S('set2', 'lunch', 'ishaan', 'you', 620, 20, 'upi'),
    S('set3', 'lunch', 'tara', 'you', 620, 20, 'cash'),
  ];
  const queue: Draft[] = RAWS.map(([key, sender, body]) => {
    const parsed = parseSms(sender, body);
    if (!parsed) throw new Error(`seed sms failed: ${key}`);
    return {
      id: id(key), key: `sample|${key}`, sender, body, sample: true,
      bank: parsed.bank, at: parsed.at ?? localNoon(2026, 10, 2), amount: parsed.amount,
      income: parsed.income, transfer: parsed.transfer, merchant: parsed.merchant,
      rail: parsed.rail, tag: parsed.tag, account: parsed.account,
    };
  });
  const history: MonthSnapshot[] = [
    { y: 2026, m: 4, spent: 41200, sample: true },
    { y: 2026, m: 5, spent: 62400, sample: true },
    { y: 2026, m: 6, spent: 38900, sample: true },
    { y: 2026, m: 7, spent: 58300, sample: true },
    { y: 2026, m: 8, spent: 67200, sample: true },
  ];
  return { people, groups, expenses, settlements, queue, history, budget: 60000 };
}
