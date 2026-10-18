function esc(value: string) {
  return value.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
}

export function groupPage(group: { name: string; note: string }, rows: { name: string; merchant: string; amount: number }[]) {
  const body = rows.map((row) => `<tr><td>${esc(row.merchant)}</td><td>${esc(row.name)}</td><td style="text-align:right">${row.amount}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(group.name)}</title></head><body style="font-family:sans-serif;margin:24px;background:#f3efe6;color:#16141a"><h1>${esc(group.name)}</h1><p>${esc(group.note)}</p><table style="width:100%;border-collapse:collapse">${body}</table></body></html>`;
}
