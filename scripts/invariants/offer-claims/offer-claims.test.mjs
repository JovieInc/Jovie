import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  config,
  countFile,
  evaluate,
  hits,
  isExcluded,
  main,
  structuredOfferLiterals,
} from './check.mjs';

const cwd = process.cwd();

test('every exception carries a reason', () => {
  for (const e of [...config.exclude, ...config.skipLiterals])
    assert.ok(e.reason.trim());
});

test('hits flags offer prose and ignores unrelated text', () => {
  assert.deepEqual(hits('Pro is $12/mo after a 14-day trial with no card'), [
    'recurring_price',
    'plan_price',
    'trial_claim',
    'no_card_claim',
    'billing_claim',
  ]);
  assert.deepEqual(hits('Cancel anytime'), ['cancel_claim']);
  assert.deepEqual(hits('30-day money-back guarantee'), [
    'trial_claim',
    'refund_guarantee_claim',
  ]);
  assert.deepEqual(hits('Your profile is free forever'), [
    'free_forever_claim',
  ]);
  assert.deepEqual(hits('Share your new single'), []);
});

test('TypeScript scan reads literals only, not identifiers, comments or imports', () => {
  const src = [
    "import x from './trial-card';",
    '// Pro is $12/mo, cancel anytime',
    "const trialEndsAt = 'trial';",
    "const copy = 'Start your 14-day trial';",
    'const jsx = <p>No credit card needed</p>;',
    'const t = `then ${n} per month`;',
  ].join('\n');
  assert.deepEqual(countFile('a.tsx', src, cwd), {
    trial_claim: 1,
    no_card_claim: 1,
    billing_claim: 1,
  });
});

test('swift and markdown scan lines; swift comments are stripped', () => {
  assert.deepEqual(
    countFile('A.swift', '// Cancel anytime\nlet s = "Cancel anytime"\n', cwd),
    { cancel_claim: 1 }
  );
  assert.deepEqual(
    countFile('x.md', 'New accounts start with a 14-day trial.\n', cwd),
    { trial_claim: 1 }
  );
});

test('schema.org Offer literals are counted, derived values are not', () => {
  const lit =
    "const o = { '@type': 'Offer', price: '12', priceCurrency: 'USD' };";
  const derived =
    "const o = { '@type': 'Offer', price: String(claim.priceUsd), priceCurrency: offer.currency };";
  assert.equal(structuredOfferLiterals(lit, 'a.ts', cwd), 2);
  assert.equal(structuredOfferLiterals(derived, 'a.ts', cwd), 0);
  assert.equal(structuredOfferLiterals("const price = '12';", 'a.ts', cwd), 0);
});

test('exclusions: offer module, tests and editorial; messages catalogs stay in scope', () => {
  assert.ok(isExcluded('apps/web/lib/billing/offer/claims.ts'));
  assert.ok(isExcluded('apps/web/lib/foo.test.ts'));
  assert.ok(isExcluded('apps/ios/JovieTests/AppStateTests.swift'));
  assert.ok(isExcluded('apps/web/content/blog/post.md'));
  assert.ok(
    !isExcluded('apps/web/app/exp/shell-v1/ShellV1ExperimentClient.tsx')
  );
  assert.ok(!isExcluded('apps/web/messages/en.json'));
});

test('ratchet: new file, increase and stale entry fail; equal passes', () => {
  const base = { 'a.ts': { trial_claim: 1 } };
  assert.deepEqual(evaluate({ 'a.ts': { trial_claim: 1 } }, base), []);
  assert.equal(evaluate({ 'a.ts': { trial_claim: 2 } }, base).length, 1);
  assert.equal(
    evaluate({ 'a.ts': { trial_claim: 1 }, 'b.ts': { no_card_claim: 1 } }, base)
      .length,
    1
  );
  assert.equal(evaluate({}, base).length, 1);
});

test('deliberate red: the original incident closer in a new file fails the guard', () => {
  const src =
    'export const closer = `Artist Presence is ${price} after a ${days}-day trial with no card; the free profile stays free.`;';
  const current = {
    'apps/web/lib/chat/prompts/onboarding.ts': countFile(
      'onboarding.ts',
      src,
      cwd
    ),
  };
  const errors = evaluate(current, {});
  assert.ok(
    errors.some(e => e.includes('trial_claim')),
    errors.join('\n')
  );
  assert.ok(
    errors.some(e => e.includes('no_card_claim')),
    errors.join('\n')
  );
});

test('the committed baseline matches the tree', () => {
  assert.equal(main([], cwd), 0);
});
