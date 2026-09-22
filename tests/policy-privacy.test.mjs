import test from 'node:test';
import assert from 'node:assert/strict';
import { redactPrivateLinks, PRIVATE_LINK_MARKER } from '../benchmark/policy-privacy.mjs';

test('private links are removed from nested display fields without changing inputs or public product links', () => {
  const capability = 'https://merchant.example/cart/c/opaque-cart-fixture?key=fictional-secret';
  const publicLink = 'https://merchant.example/products/coat?variant=123&view=full&utm_source=chat';
  const input = { reply: `See [your cart](${capability}).`, audit: { evidence: `Here: ${capability}` }, product: publicLink, score: 75 };
  const before = structuredClone(input), result = redactPrivateLinks(input);
  assert.deepEqual(input, before);
  assert.equal(result.value.product, publicLink);
  assert.equal(result.value.score, 75);
  assert.equal(result.redactions.length, 2);
  assert.ok(!JSON.stringify(result).includes('fictional-secret'));
  assert.ok(!JSON.stringify(result).includes('opaque-cart-fixture'));
  assert.equal(result.value.reply, `See [your cart](${PRIVATE_LINK_MARKER}).`);
});

test('credential query/fragment aliases, embedded credentials and opaque cart paths cannot slip through', () => {
  for (const url of [
    'https://merchant.example/checkout/opaque-fixture',
    'https://merchant.example/cart/c/opaque-fixture',
    'https://merchant.example/page?access%5Ftoken=fictional-secret',
    'https://merchant.example/page#session_id=fictional-secret',
    'https://fixture-user:fictional-secret@merchant.example/',
    'https://merchant.example/account/orders/opaque-fixture',
    'https://merchant.example/app/ticket/opaque-fixture',
    'https://merchant.example/tickets/opaque-fixture',
    'https://merchant.example/hc/en-us/requests/opaque-fixture',
    'https://merchant.example/cart%2Fc/opaque-fixture',
    'https://merchant.example/%63heckout/opaque-fixture',
    'https://merchant.example/page?password=fictional-secret',
    'https://merchant.example/page?api_key=fictional-secret',
    'https://merchant.example/page?session_token=fictional-secret',
    'https://merchant.example/page?order_number=fictional-secret',
    'https://merchant.example/page?view=full&amp;token=fictional-secret',
    'https://merchant.example/page#/account?access_token=fictional-secret',
    'https://merchant.example/account?order=fixture-order',
    'https://merchant.example/oauth/callback?code=fixture-code',
    'https://merchant.example/page#/auth?code=fixture-code',
    'https://merchant.example/page?auth_code=fixture-code',
    'https://merchant.example/page?otp=fixture-code',
  ]) {
    const output = redactPrivateLinks(url);
    assert.equal(output.value, PRIVATE_LINK_MARKER);
    assert.equal(output.redactions.length, 1);
  }
  for (const url of ['https://merchant.example/cart', 'https://merchant.example/pages/returns', 'https://merchant.example/products/cart-sticker', 'https://merchant.example/hc/en-us/requests/new', 'https://merchant.example/products/coat?variant=12345']) {
    assert.equal(redactPrivateLinks(url).value, url);
  }
});

test('public coupon and sort parameters remain intact outside authentication or customer contexts', () => {
  for (const url of [
    'https://merchant.example/products/coat?variant=12345&code=SUMMER25',
    'https://merchant.example/discount?code=SUMMER25',
    'https://merchant.example/collections/coats?sort=price&order=desc',
  ]) assert.equal(redactPrivateLinks(url).value, url);
});
