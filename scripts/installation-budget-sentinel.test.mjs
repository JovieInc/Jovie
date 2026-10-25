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

test('render names the installation and errors below the floor', () => {
  assert.match(
    render(evaluateBudget(core(100), NOW), 'ci-app'),
    /^::error title=GitHub ci-app budget low::ci-app REST budget 100\/1000/
  );
  assert.match(
    render(evaluateBudget(core(900), NOW)),
    /^::notice title=GitHub installation budget::/
  );
});

test('main samples the shared and CI App installations separately and never logs a token', async () => {
  const logs = [];
  const seen = [];
  const samples = await main({
    env: { GITHUB_TOKEN: 'tok-shared', CI_APP_TOKEN: 'tok-app' },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.github.com/rate_limit');
      const token = options.headers.authorization.replace('Bearer ', '');
      seen.push(token);
      return Response.json({
        resources: { core: token === 'tok-shared' ? core(50) : core(900) },
      });
    },
    log: x => logs.push(x),
    now: () => NOW,
  });
  assert.deepEqual(seen, ['tok-shared', 'tok-app']);
  assert.equal(samples['shared-github-token'].low, true);
  assert.equal(samples['ci-app'].low, false);
  assert.match(logs[0], /^::error title=GitHub shared-github-token budget low/);
  assert.match(logs[1], /^::notice title=GitHub ci-app budget/);
  assert.doesNotMatch(logs.join('\n'), /tok-/);
});

test('a missing token or failed read warns instead of alarming or throwing', async () => {
  const logs = [];
  await main({
    env: { GITHUB_TOKEN: 'tok-shared' },
    fetchImpl: async () => new Response(null, { status: 500 }),
    log: x => logs.push(x),
  });
  assert.match(
    logs[0],
    /^::warning::shared-github-token budget sample unavailable \(.*500\)/
  );
  assert.match(logs[1], /^::warning::ci-app budget not sampled/);
});
