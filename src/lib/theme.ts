export type Palette = {
  bg: string;
  fg: string;
  mut: string;
  faint: string;
  line: string;
  sub: string;
  bar: string;
  acc: string;
  accFg: string;
  pos: string;
  neg: string;
  posCard: string;
  dlg: string;
  brand: string;
  brandFg: string;
  brandSoft: string;
  brandInk: string;
};

export const light: Palette = {
  bg: '#f3efe6',
  fg: '#16141a',
  mut: '#5c574e',
  faint: '#e7e1d4',
  line: '#d8d0c2',
  sub: '#fffdf9',
  bar: '#e3dcd0',
  acc: '#16141a',
  accFg: '#fffdf9',
  pos: '#1b7f45',
  neg: '#c4382f',
  posCard: '#e7f6ec',
  dlg: '#fffdf9',
  brand: '#653de9',
  brandFg: '#ffffff',
  brandSoft: '#ece8ff',
  brandInk: '#4a29b2',
};

export const dark: Palette = {
  bg: '#18181a',
  fg: '#f2f2f0',
  mut: '#a5a5aa',
  faint: '#28282b',
  line: '#3a3a3f',
  sub: '#232326',
  bar: '#323236',
  acc: '#f2f2f0',
  accFg: '#18181a',
  pos: '#6dce96',
  neg: '#f0998c',
  posCard: '#1d3226',
  dlg: '#29292c',
  brand: '#9c92ff',
  brandFg: '#0e0a24',
  brandSoft: '#27214f',
  brandInk: '#c3c2ff',
};

export const font = {
  display: 'Syne_800ExtraBold',
  displaySm: 'Syne_700Bold',
  body: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  mono: 'JetBrainsMono_500Medium',
};

const TAG_HUES: Record<string, number> = {
  food: 28, coffee: 24, transport: 230, rent: 215, bills: 195,
  entertainment: 275, health: 155, travel: 208, shopping: 340,
  salary: 148, freelance: 168, groceries: 128, weekend: 22,
  family: 350, work: 235, trip: 200, festive: 42, subscription: 265,
  medical: 155, fuel: 40, untagged: 220,
};

export function tagColors(tag: string, isDark: boolean) {
  const hue = TAG_HUES[tag] ?? [...tag].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  if (isDark) {
    return { bg: `hsl(${hue}, 32%, 18%)`, fg: `hsl(${hue}, 45%, 78%)`, pie: `hsl(${hue}, 55%, 64%)` };
  }
  return { bg: `hsl(${hue}, 62%, 91%)`, fg: `hsl(${hue}, 48%, 28%)`, pie: `hsl(${hue}, 58%, 42%)` };
}

export const RAIL_ICON: Record<string, string> = {
  upi: 'qrcode',
  debit: 'credit-card-outline',
  credit: 'credit-card',
  neft: 'bank-outline',
  imps: 'bank-transfer',
  cash: 'cash',
};

export const RAIL_LABEL: Record<string, string> = {
  upi: 'UPI',
  debit: 'Debit',
  credit: 'Credit',
  neft: 'NEFT',
  imps: 'IMPS',
  cash: 'Cash',
};
