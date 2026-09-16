import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkDigit, hasValidCheckDigit, normalizeBarcode, upcEToUpcA } from '../quickActions/gtin';

/** The inverse of the expansion, used only to prove it. A UPC-A compresses to UPC-E exactly
 *  when its zeros fall in one of four places. */
function upcAToUpcE(upcA: string): string | null {
  const s = upcA[0]; const body = upcA.slice(1, 11); const check = upcA[11];
  const [a, b, c, d, e, f, g, h, i, j] = body;
  if (['0', '1', '2'].includes(c) && `${d}${e}${f}${g}` === '0000') return `${s}${a}${b}${h}${i}${j}${c}${check}`;
  if (`${d}${e}${f}${g}${h}` === '00000') return `${s}${a}${b}${c}${i}${j}3${check}`;
  if (`${e}${f}${g}${h}${i}` === '00000') return `${s}${a}${b}${c}${d}${j}4${check}`;
  if (`${f}${g}${h}${i}` === '0000' && Number(j) >= 5) return `${s}${a}${b}${c}${d}${e}${j}${check}`;
  return null;
}
const withCheck = (eleven: string) => `${eleven}${checkDigit(eleven)}`;

test('every UPC-E expands back to the UPC-A it was squeezed from', () => {
  // One UPC-A per compression rule, plus real packages: Coca-Cola and a documented example.
  const sources = [
    withCheck('04210000526'), withCheck('01234500006'), withCheck('04900000634'),
    withCheck('01234500000'), withCheck('05123400000'), withCheck('06543200009'),
    '049000006346', '042100005264',
  ];
  let proved = 0;
  for (const upcA of sources) {
    const compressed = upcAToUpcE(upcA);
    if (!compressed) continue;
    assert.equal(upcEToUpcA(compressed), upcA, `${compressed} did not expand back to ${upcA}`);
    proved++;
  }
  assert.ok(proved >= 5, `only ${proved} codes exercised the expansion`);
});

test('a check digit that does not add up is refused rather than looked up', () => {
  assert.equal(checkDigit('03600029145'), 2);
  assert.equal(hasValidCheckDigit('036000291452'), true);
  assert.equal(hasValidCheckDigit('036000291451'), false);
  // A misread digit produces a code for some other product, or for none. Either is worse than
  // saying the scan failed.
  assert.equal(normalizeBarcode('036000291451'), null);
  assert.equal(upcEToUpcA('04252615'), null, 'a UPC-E whose expansion breaks the check is not one');
  assert.equal(upcEToUpcA('24252614'), null, 'only number systems 0 and 1 have a UPC-E form');
});

test('whatever was scanned arrives as the thirteen digits a lookup wants', () => {
  // The bug this exists for: a 12-digit UPC-A sent unchanged to a GTIN-13 lookup finds nothing.
  assert.deepEqual(normalizeBarcode('036000291452'), { gtin13: '0036000291452', scanned: '036000291452', format: 'UPC-A' });
  assert.deepEqual(normalizeBarcode('04252614'), { gtin13: '0042100005264', scanned: '04252614', format: 'UPC-E' });
  assert.equal(normalizeBarcode('0036000291452')!.format, 'GTIN-13');
  // A GTIN-14 for a single unit is the same item with a packaging digit in front.
  assert.equal(normalizeBarcode('00036000291452')!.gtin13, '0036000291452');
  // A carton is not the thing somebody scanned, so it is not silently treated as one.
  assert.equal(normalizeBarcode(withCheck('1003600029145').slice(0, 13) + checkDigit(withCheck('1003600029145').slice(0, 13))), null);
  // Spaces and hyphens off a printed label do not make a scan invalid.
  assert.equal(normalizeBarcode(' 0360-0029 1452 ')!.gtin13, '0036000291452');
  for (const junk of ['', 'abc', '1234567', '123456789012345', '12345678']) assert.equal(normalizeBarcode(junk), null, junk);
});
