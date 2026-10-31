import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { buildHeadroom } from '../../rate-limit-headroom.mjs';
import {
  checkNewConsumers,
  isNewConsumer,
  loadRateLimits,
  parseBudgets,
} from '../api-budget.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRateLimits(root);
const limitIds = new Set(registry.limits.map(l => l.id));
const check = files =>
  checkNewConsumers({
    added: Object.keys(files),
    read: p => files[p],
    limitIds,
  });

describe('registry', () => {
  it('has unique ids and a basis for every limit', () => {
    const ids = registry.limits.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of registry.limits) {
      expect(l.basis, l.id).toBeTruthy();
      expect(l.consumers.length, l.id).toBeGreaterThan(0);
    }
  });
});

describe('api-budget lines', () => {
  it('parses limit, rate and reason in any comment syntax', () => {
    expect(
      parseBudgets(
        '# api-budget: github-app-core 120/hr - poll checks\n// api-budget: linear-requests 5/hr - x'
      )
    ).toEqual([
      { limit: 'github-app-core', perHour: 120, reason: 'poll checks' },
      { limit: 'linear-requests', perHour: 5, reason: 'x' },
    ]);
  });
});

describe('new consumer guard', () => {
  const client = "import { createGitHubClient } from '@jovie/api-client';\n";
  it('fails a new client-layer consumer with no budget line', () => {
    const errors = check({ 'scripts/new-poller.mjs': client });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('without a budget line');
  });
  it('passes with a valid line', () => {
    expect(
      check({
        'scripts/new-poller.mjs': `// api-budget: github-app-core 60/hr - one PR poll per minute\n${client}`,
      })
    ).toEqual([]);
  });
  it('rejects unknown limits and missing reasons', () => {
    const errors = check({
      'scripts/p.mjs': `// api-budget: nope 1/hr - fine reason here\n${client}`,
      'scripts/q.mjs': `// api-budget: github-app-core 1/hr\n${client}`,
    });
    expect(errors.join('\n')).toMatch(/unknown limit "nope"/);
    expect(errors.join('\n')).toMatch(/needs a reason/);
  });
  it('covers scheduled workflows, ignores manual ones, tests and the client layer', () => {
    expect(
      isNewConsumer(
        '.github/workflows/x.yml',
        'on:\n  schedule:\n    - cron: "0 * * * *"\n'
      )
    ).toBe(true);
    expect(
      isNewConsumer('.github/workflows/y.yml', 'on:\n  pull_request:\n')
    ).toBe(false);
    expect(isNewConsumer('scripts/a.test.mjs', client)).toBe(false);
    expect(isNewConsumer('packages/api-client/x.ts', client)).toBe(false);
  });
  it('accepts the headroom publisher budget', () => {
    const text = readFileSync(
      resolve(root, 'scripts/rate-limit-headroom.mjs'),
      'utf8'
    );
    expect(check({ 'scripts/rate-limit-headroom.mjs': text })).toEqual([]);
    expect(
      parseBudgets(text)
        .map(b => `${b.limit} ${b.perHour}`)
        .sort()
    ).toEqual(['github-app-core 1', 'github-user-core 1']);
  });
  it('accepts the existing github-token-budget line on a scheduled workflow', () => {
    expect(
      check({
        '.github/workflows/z.yml':
          '# github-token-budget: 12 calls/run - evidence\non:\n  schedule:\n',
      })
    ).toEqual([]);
  });
});

describe('headroom', () => {
  it('joins declared budgets with live reads and flags overload', () => {
    const doc = buildHeadroom({
      registry,
      declared: {
        'github-actions-token': {
          perHour: 900,
          declaredBy: [{ path: 'a', perHour: 900 }],
        },
      },
      live: {
        'github-app-core': {
          limit: 5000,
          remaining: 400,
          source: 'github-rate-limit',
        },
      },
      ledger: null,
      nowMs: 1,
    });
    const by = Object.fromEntries(doc.limits.map(l => [l.id, l]));
    expect(by['github-actions-token'].plannedPct).toBe(90);
    expect(by['github-actions-token'].status).toBe('critical');
    expect(by['github-app-core'].usedPct).toBe(92);
    expect(by['github-app-core'].status).toBe('critical');
    expect(by['github-user-core'].status).toBe('unknown');
  });
});
