import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateBudget,
  LOW_BUDGET_FRACTION,
  main,
  render,
} from './installation-budget-sentinel.mjs';

const NOW = 1_800_000_000_000;
const core = (remaining, limit = 1000) => ({
  limit,
  remaining,
  reset: NOW / 1000 + 600,
});

test('alarms strictly below 15% remaining', () => {
  assert.equal(LOW_BUDGET_FRACTION, 0.15);
  assert.equal(evaluateBudget(core(149), NOW).low, true);
  assert.equal(evaluateBudget(core(150), NOW).low, false);
  const sample = evaluateBudget(core(0), NOW);
  assert.equal(sample.used, 1000);
  assert.equal(sample.resetInSeconds, 600);
});

test('rejects malformed rate_limit data instead of reporting a healthy budget', () => {
  for (const bad of [
    undefined,
    {},
    { limit: 0, remaining: 0, reset: 1 },
    { limit: 5, remaining: -1, reset: 1 },
  ])
    assert.throws(() => evaluateBudget(bad, NOW), /malformed/);
});

test('render is an error below the floor and a notice above it', () => {
  assert.match(
    render(evaluateBudget(core(100), NOW)),
    /^::error title=GitHub installation budget low::/
  );
  assert.match(
    render(evaluateBudget(core(900), NOW)),
    /^::notice title=GitHub installation budget::/
  );
});

test('main reads /rate_limit, logs one line and never leaks the token', async () => {
  const logs = [];
  const sample = await main({
    env: { GITHUB_TOKEN: 'tok-secret' },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.github.com/rate_limit');
      assert.equal(options.headers.authorization, 'Bearer tok-secret');
      return Response.json({ resources: { core: core(50) } });
    },
    log: x => logs.push(x),
    now: () => NOW,
  });
  assert.equal(sample.low, true);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /tok-secret/);
  await assert.rejects(
    main({
      env: {},
      fetchImpl: async () => new Response(null, { status: 500 }),
      log: () => {},
    }),
    /500/
  );
});
