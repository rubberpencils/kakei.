import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { Expense } from './types';

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

function rows(expenses: Expense[]) {
  return expenses.filter((e) => !e.sample);
}

export async function shareJson(name: string, data: unknown) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Kakei data' });
}

export async function shareCsv(expenses: Expense[]) {
  const lines = ['date,merchant,amount,tag,rail,income,transfer'];
  for (const e of rows(expenses)) {
    lines.push([e.at, e.merchant, String(e.amount), e.tag ?? '', e.rail, e.income ? 'yes' : 'no', e.transfer ? 'yes' : 'no'].map(cell).join(','));
  }
  const file = new File(Paths.cache, 'kakei.csv');
  if (file.exists) file.delete();
  file.create();
  file.write(lines.join('\n'));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Kakei expenses' });
}

export async function sharePdf(expenses: Expense[]) {
  const body = rows(expenses).slice(0, 400).map((e) => `<tr><td>${e.at.slice(0, 10)}</td><td>${e.merchant.replace(/[<>&]/g, '')}</td><td style="text-align:right">${e.amount}</td><td>${e.tag ?? ''}</td></tr>`).join('');
  const html = `<html><body style="font-family:sans-serif;padding:24px"><h1>kakei.</h1><table style="width:100%;border-collapse:collapse">${body}</table></body></html>`;
  const file = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Kakei expenses' });
}
