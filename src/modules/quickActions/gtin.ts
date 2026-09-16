/**
 * Barcode scanners report what is printed, which is not what a nutrition API wants. A US
 * package carries a 12-digit UPC-A, a small one carries an 8-digit UPC-E, and FatSecret's
 * barcode lookup takes GTIN-13 and nothing else. Handing it a UPC-A unchanged is a lookup for a
 * different product, or more often for none at all — which is how a scan of a real item comes
 * back "not found".
 */
export type BarcodeFormat = 'GTIN-13' | 'UPC-A' | 'UPC-E' | 'EAN-8' | 'GTIN-14';

/** The mod-10 check digit for every digit before it. */
export function checkDigit(digits: string): number {
  let sum = 0;
  // Weights alternate 3,1 from the rightmost body digit leftwards, whatever the length.
  for (let index = digits.length - 1, weight = 3; index >= 0; index--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[index]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}
export const hasValidCheckDigit = (code: string) =>
  /^\d{8,14}$/.test(code) && checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);

/**
 * A UPC-E squeezes a UPC-A that contains a run of zeros back down to eight digits. The last
 * data digit says where the zeros were removed from, so expansion is a lookup, not arithmetic.
 */
export function upcEToUpcA(code: string): string | null {
  if (!/^\d{8}$/.test(code)) return null;
  const system = code[0];
  // Only number systems 0 and 1 have a UPC-E form.
  if (system !== '0' && system !== '1') return null;
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7);
  const check = code[7];
  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const expanded = `${system}${body}${check}`;
  // The check digit travels unchanged through the compression, so a correct expansion has to
  // reproduce it. If it does not, this was not a UPC-E.
  return hasValidCheckDigit(expanded) ? expanded : null;
}

export interface NormalizedBarcode { gtin13: string; scanned: string; format: BarcodeFormat }

/**
 * Whatever was scanned, as the 13 digits a lookup needs. UPC-E expands to UPC-A first, and a
 * UPC-A is padded — a GTIN-13 is a UPC-A with a leading zero, which is why the pad is correct
 * rather than a guess. A GTIN-14 carrying a leading zero is a case code for the same item.
 */
export function normalizeBarcode(raw: string): NormalizedBarcode | null {
  const scanned = raw.trim().replace(/[\s-]/g, '');
  if (!/^\d{8,14}$/.test(scanned)) return null;
  if (scanned.length === 8) {
    const expanded = upcEToUpcA(scanned);
    // An 8-digit code that is not a UPC-E is an EAN-8, which has no 13-digit form to pad to:
    // its digits are not the tail of any GTIN-13.
    if (!expanded) return hasValidCheckDigit(scanned) ? { gtin13: scanned, scanned, format: 'EAN-8' } : null;
    return { gtin13: `0${expanded}`, scanned, format: 'UPC-E' };
  }
  if (scanned.length === 12) {
    if (!hasValidCheckDigit(scanned)) return null;
    return { gtin13: `0${scanned}`, scanned, format: 'UPC-A' };
  }
  if (scanned.length === 13) {
    if (!hasValidCheckDigit(scanned)) return null;
    return { gtin13: scanned, scanned, format: 'GTIN-13' };
  }
  if (scanned.length === 14) {
    if (!hasValidCheckDigit(scanned)) return null;
    // A case code for a single unit differs only by its packaging digit; anything else is a
    // carton, and its contents are not the item somebody scanned.
    return scanned.startsWith('0') ? { gtin13: scanned.slice(1), scanned, format: 'GTIN-14' } : null;
  }
  return null;
}
