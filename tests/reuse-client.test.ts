import test from 'node:test';
import assert from 'node:assert/strict';
import { certainProvider, fillKnownProvider, providerLookupQuery, removeAutofill, websiteKey, type CatalogProvider } from '../lib/reuse-client.ts';
import type { Vendor } from '../lib/client.ts';
import { storefrontIdentity } from '../worker/reuse.mjs';

const known: CatalogProvider = {
  name: 'Alhena', website: 'https://alhena.ai/',
  customers: [1, 2, 3].map(n => ({ name: `Store ${n}`, website: `https://store${n}.example/` })),
};
const blank = (): Vendor => ({ name: 'Alhena', website: '', customers: [1, 2, 3].map(() => ({ name: '', website: '' })) });

test('partial customer identities in later rows are reserved before blank-row prefill', () => {
  for (const index of [0, 1, 2]) {
    const value = blank(); value.customers[index].name = 'Store 1';
    const result = fillKnownProvider(value, known, new Set([`customers.${index}.name`]));
    assert.equal(result.value.customers[index].website, 'https://store1.example/');
    assert.equal(new Set(result.value.customers.map(customer => customer.website)).size, 3);
    assert.equal(new Set(result.value.customers.map(customer => customer.name)).size, 3);
  }
});

test('blank-row prefill respects server hostname and customer-name uniqueness', () => {
  const variants: CatalogProvider = { ...known, customers: [
    { name: 'Regional US', website: 'https://www.regional.example/us' },
    { name: 'Regional UK', website: 'https://regional.example/uk' },
    { name: 'Regional port', website: 'http://regional.example:443/' },
    { name: 'Regional US', website: 'https://different.example/' },
    { name: 'Other', website: 'https://other.example/' },
    { name: 'Third', website: 'https://third.example/' },
  ] };
  assert.deepEqual(fillKnownProvider(blank(), variants, new Set()).value.customers.map(customer => customer.name), ['Regional US', 'Other', 'Third']);
  const value = blank(); value.customers[2] = { name: 'My regional store', website: 'https://regional.example/ca' };
  const result = fillKnownProvider(value, variants, new Set(['customers.2.name', 'customers.2.website'])).value;
  assert.equal(result.customers[2].website, value.customers[2].website);
  assert.equal(new Set(result.customers.map(customer => websiteKey(customer.website))).size, 3);
});

test('manual, cleared and conflicting customer fields remain untouched', () => {
  const value = blank(); value.customers[1] = { name: 'My customer', website: '' };
  assert.deepEqual(fillKnownProvider(value, known, new Set(['customers.1.name'])).value.customers[1], value.customers[1]);
  for (const field of ['name', 'website']) assert.deepEqual(fillKnownProvider(blank(), known, new Set([`customers.0.${field}`])).value.customers[0], { name: '', website: '' });
  const conflict = blank(); conflict.customers[0] = { name: 'Store 1', website: 'https://different.example/' };
  assert.deepEqual(fillKnownProvider(conflict, known, new Set()).value.customers[0], conflict.customers[0]);
  const cleared = blank(); cleared.customers[2].name = 'Store 1';
  const result = fillKnownProvider(cleared, known, new Set(['customers.2.name', 'customers.2.website'])).value;
  assert.equal(result.customers[2].website, '');
  assert.ok(result.customers.slice(0, 2).every(customer => customer.website !== known.customers[0].website));
});

test('ambiguous names never get invented URLs, and already duplicated manual inputs are not multiplied', () => {
  const duplicateNames = { ...known, customers: [known.customers[0], { name: 'Store 1', website: 'https://other.example/' }, known.customers[2]] };
  const value = blank(); value.customers[1].name = 'Store 1';
  assert.equal(fillKnownProvider(value, duplicateNames, new Set()).value.customers[1].website, '');
  value.customers[2].name = 'Store 1';
  const result = fillKnownProvider(value, known, new Set()).value;
  assert.ok(result.customers.slice(1).every(customer => customer.website === ''));
  assert.notEqual(result.customers[0].name, 'Store 1');
});

test('provider identity requires a unique consistent match and website-only queries ignore www/scheme', () => {
  assert.equal(certainProvider(blank(), [known]), known);
  assert.equal(certainProvider({ ...blank(), website: 'http://www.ALHENA.ai/' }, [known]), known);
  assert.equal(certainProvider({ ...blank(), website: 'https://other.example/' }, [known]), undefined);
  assert.equal(certainProvider(blank(), [known, { ...known, website: 'https://other.example/' }]), undefined);
  assert.equal(providerLookupQuery({ name: '', website: 'https://gorgias.com/' }), 'gorgias.com');
  assert.equal(providerLookupQuery({ name: '', website: 'http://WWW.GORGIAS.COM/' }), 'gorgias.com');
  assert.equal(providerLookupQuery({ name: ' Alhena ', website: 'https://alhena.ai/' }), 'Alhena');
});

test('removing an old provider autofill preserves later user edits', () => {
  const initial = blank(); const result = fillKnownProvider(initial, known, new Set());
  assert.deepEqual(removeAutofill(result.value, result.filled), initial);
  result.value.customers[1].name = 'Edited customer';
  const cleared = removeAutofill(result.value, result.filled);
  assert.equal(cleared.customers[1].name, 'Edited customer');
  assert.equal(cleared.customers[1].website, '');
});

test('storefront identity preserves paths, query strings and non-root trailing slashes', () => {
  for (const url of ['https://www.STORE.example', 'http://store.example/', 'https://store.example/shop', 'https://store.example/shop/', 'https://store.example:8443/shop?q=1']) assert.equal(websiteKey(url, true), storefrontIdentity(url));
  assert.notEqual(websiteKey('https://store.example/shop', true), websiteKey('https://store.example/shop/', true));
  assert.notEqual(websiteKey('https://store.example/shop?a=1', true), websiteKey('https://store.example/shop?a=2', true));
});
