import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, VENDOR_SCOPES, exclusiveOfferings, notComparedOfferings, scopesFor, vendorScope } from '../lib/product-scope.ts';

test('every listed capability cites the vendor page that states it', () => {
  for (const vendor of VENDOR_SCOPES) {
    assert.deepEqual(Object.keys(vendor.cells).sort(), CAPABILITIES.map(c => c.key).sort(), `${vendor.name} covers every row`);
    for (const [key, cell] of Object.entries(vendor.cells)) {
      if (cell.status === 'not-listed') { assert.equal(cell.source, undefined, `${vendor.name}.${key}`); continue; }
      assert.ok(cell.source && new URL(cell.source).hostname.replace(/^www\./, '') === vendor.domain, `${vendor.name}.${key} cites its own site`);
    }
  }
  for (const offer of notComparedOfferings()) assert.equal(new URL(offer.href).hostname, 'alhena.ai');
});

test('scope lookup normalizes websites and refuses one-sided tables', () => {
  assert.equal(vendorScope('https://www.gorgias.com/')?.id, 'gorgias');
  assert.equal(vendorScope('https://alhena.ai/')?.id, 'alhena');
  assert.equal(scopesFor([{ website: 'https://alhena.ai/' }, { website: 'https://unknown.example/' }]), null);
  assert.equal(scopesFor([]), null);
});

test('exclusive offerings are untested rows only one vendor sells itself', () => {
  const [alhena, gorgias] = ['https://alhena.ai/', 'https://www.gorgias.com/'].map(w => vendorScope(w)!);
  for (const row of exclusiveOfferings(alhena, [gorgias])) {
    assert.equal(row.tested, false);
    assert.equal(alhena.cells[row.key].status, 'yes');
    assert.notEqual(gorgias.cells[row.key].status, 'yes');
  }
});
