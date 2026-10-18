/** A personal number is digits only, 8 to 15 long, after spaces and one leading + are removed. Banks use short codes like VM-HDFCBK. */
export function isPersonalSender(address: string) {
  const cleaned = address.replace(/\s/g, '').replace(/^\+/, '');
  return cleaned.length >= 8 && cleaned.length <= 15 && /^\d+$/.test(cleaned);
}
