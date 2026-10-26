import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkModel,
  evaluatePricingModel,
  modelReference,
  touchesPricing,
} from './pricing-model-gate.mjs';

const model = (best = [8e6, 49e6, 188e6], over = {}) => ({
  bar: { best_y3_arr_usd: 30e6, best_y3_growth_min: 2 },
  assumptions: [{ name: 'signups', value: '1M', source: 'assumption' }],
  chosen: 'D',
  options: { D: { arr: { worst: [1, 2, 3], base: [1, 2, 3], best } } },
  ...over,
});
const read = m => () => JSON.stringify(m);
const body = 'pricing-model: docs/pricing-models/x.json';
const priced = ['apps/web/lib/config/plan-prices.ts'];

test('non-pricing changes are ignored', () => {
  assert.deepEqual(
    evaluatePricingModel({
      paths: ['README.md'],
      body: '',
      readFile: read(model()),
    }),
    []
  );
  assert.deepEqual(
    touchesPricing(['apps/web/app/(marketing)/pricing/page.tsx']).length,
    1
  );
});
test('pricing change without a model link fails', () => {
  const [e] = evaluatePricingModel({
    paths: priced,
    body: 'Summary',
    readFile: read(model()),
  });
  assert.match(e, /add "pricing-model:/);
});
test('reference outside docs/pricing-models fails', () => {
  const [e] = evaluatePricingModel({
    paths: priced,
    body: 'pricing-model: ../../etc/passwd',
    readFile: read(model()),
  });
  assert.match(e, /must match docs\/pricing-models/);
});
test('missing or invalid file fails', () => {
  const [e] = evaluatePricingModel({
    paths: priced,
    body,
    readFile: () => {
      throw new Error('ENOENT');
    },
  });
  assert.match(e, /missing or not valid JSON/);
});
test('best case below the bar fails, above passes', () => {
  assert.match(
    evaluatePricingModel({
      paths: priced,
      body,
      readFile: read(model([1e6, 5e6, 13e6])),
    })[0],
    /below the bar/
  );
  assert.match(
    evaluatePricingModel({
      paths: priced,
      body,
      readFile: read(model([1e6, 40e6, 50e6])),
    })[0],
    /growth 1\.25x/
  );
  assert.deepEqual(
    evaluatePricingModel({ paths: priced, body, readFile: read(model()) }),
    []
  );
});
test('a model that lowers the bar is rejected', () => {
  const low = model([1e6, 2e6, 5e6], {
    bar: { best_y3_arr_usd: 1e6, best_y3_growth_min: 1 },
  });
  assert.match(
    evaluatePricingModel({ paths: priced, body, readFile: read(low) })[0],
    /lowers the bar/
  );
});
test('model needs assumptions, a chosen option and three-year arrays', () => {
  assert.match(
    checkModel(model(undefined, { assumptions: [] })),
    /no assumptions/
  );
  assert.match(checkModel(model(undefined, { chosen: 'Z' })), /not in options/);
  assert.match(checkModel(model([1, 2])), /3-year ARR array for best/);
  assert.match(checkModel({}), /no bar/);
});
test('reference parsing tolerates backticks', () => {
  assert.equal(
    modelReference('x\npricing-model: `docs/pricing-models/a.json`\n'),
    'docs/pricing-models/a.json'
  );
});
