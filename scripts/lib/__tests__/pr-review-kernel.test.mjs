import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRiskRuleIds } from '../../pr-review/cli.mjs';
import {
  collectContext,
  excerptForFinding,
  renderContext,
} from '../../pr-review/context.mjs';
import {
  costUsd,
  createGatewayTransport,
  fetchRanking,
  fetchRankings,
  selectRoutes,
} from '../../pr-review/models.mjs';
import {
  outcomesFromCases,
  recordOutcomes,
  scoreReplay,
} from '../../pr-review/replay.mjs';
import {
  normalizeCandidate,
  parseJsonObject,
  runReview,
} from '../../pr-review/run.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const PATH = 'apps/web/app/api/stripe/webhook/route.ts';
const REVIEW_ROUTES = Object.freeze({
  discovery: 'deepseek/deepseek-v4-flash',
  verification: 'z-ai/glm-5.3',
});
const PRICES = {
  [REVIEW_ROUTES.discovery]: {
    family: 'deepseek',
    inPerMillion: 0.15,
    outPerMillion: 0.6,
  },
  [REVIEW_ROUTES.verification]: {
    family: 'glm',
    inPerMillion: 0.3,
    outPerMillion: 1.2,
  },
};

function context(overrides = {}) {
  return {
    files: [
      {
        path: PATH,
        patch:
          '@@ -1 +1 @@\n+export async function handleWebhook() {\n+  await fulfill();\n+  await markProcessed();\n+}',
      },
    ],
    importers: [],
    truncated: [],
    ...overrides,
  };
}

const rawFinding = {
  severity: 'P0',
  path: PATH,
  line: 2,
  symbol: 'handleWebhook',
  consequenceClass: 'duplicate-fulfillment',
  title: 'Duplicate fulfillment on retry',
  trigger: 'Crash after fulfill() before markProcessed()',
  consequence: 'Retry fulfills the same event twice',
  repair: 'Claim the event before fulfilling',
  evidence: [`${PATH}:2 fulfill precedes markProcessed`],
};

function transportReturning({
  discovery,
  verdict = 'supported',
  fail = false,
}) {
  const calls = [];
  const transport = async call => {
    calls.push(call);
    if (fail) throw new Error('provider exploded with secret detail');
    if (call.model === REVIEW_ROUTES.discovery) {
      return {
        text: JSON.stringify({ findings: discovery }),
        usage: { inputTokens: 1_000, outputTokens: 200 },
      };
    }
    return {
      text: `Here you go: {"verdict":"${verdict}","reason":"shown"}`,
      usage: { inputTokens: 500, outputTokens: 50 },
    };
  };
  return { transport, calls };
}

const baseRun = extra => ({
  pr: 7,
  baseSha: BASE,
  headSha: HEAD,
  prices: PRICES,
  routes: REVIEW_ROUTES,
  readLiveHead: async () => HEAD,
  now: () => '2026-09-25T00:00:00.000Z',
  ...extra,
});

describe('parseJsonObject', () => {
  it('extracts the first object and rejects malformed text', () => {
    expect(parseJsonObject('noise {"a":1} tail')).toEqual({ a: 1 });
    expect(parseJsonObject('{nope')).toBeNull();
    expect(parseJsonObject('{"a":}')).toBeNull();
    expect(parseJsonObject(null)).toBeNull();
  });
});

describe('normalizeCandidate', () => {
  const changed = new Set([PATH]);
  it('builds a valid candidate with a stable root cause id', () => {
    const finding = normalizeCandidate(rawFinding, 'billing-money', changed);
    expect(finding).toMatchObject({
      state: 'candidate',
      severity: 'P0',
      introducedByPr: true,
    });
    expect(finding.rootCauseId).toMatch(/^sha256:/);
  });

  it('drops findings outside the diff or missing required fields', () => {
    expect(
      normalizeCandidate({ ...rawFinding, path: 'other.ts' }, 'x', changed)
    ).toBeNull();
    expect(
      normalizeCandidate({ ...rawFinding, consequence: '' }, 'x', changed)
    ).toBeNull();
    expect(normalizeCandidate(null, 'x', changed)).toBeNull();
    expect(
      normalizeCandidate({ ...rawFinding, evidence: 'not-array' }, 'x', changed)
    ).toBeNull();
  });
});

describe('runReview', () => {
  it('verifies a supported finding with a different model family', async () => {
    const { transport, calls } = transportReturning({
      discovery: [rawFinding],
    });
    const receipt = await runReview(
      baseRun({ riskRuleIds: ['billing-money'], context: context(), transport })
    );
    expect(receipt.status).toBe('complete');
    expect(receipt.findings.map(f => f.state)).toEqual(['verified']);
    expect(receipt.plan.tier).toBe('strong');
    expect(receipt.coverage.assessed).toEqual(
      expect.arrayContaining(['behavior-contracts', 'billing-money'])
    );
    expect(new Set(calls.map(c => c.model))).toEqual(
      new Set([REVIEW_ROUTES.discovery, REVIEW_ROUTES.verification])
    );
    expect(receipt.spend.usd).toBeGreaterThan(0);
    expect(receipt.shipBlocking).toBe(false);
  });

  it('dedupes the same root cause across specialists', async () => {
    const { transport } = transportReturning({
      discovery: [rawFinding, rawFinding],
    });
    const receipt = await runReview(
      baseRun({ riskRuleIds: [], context: context(), transport })
    );
    expect(receipt.findings).toHaveLength(1);
  });

  it('marks contradicted findings dismissed and insufficient ones candidate', async () => {
    const contradicted = transportReturning({
      discovery: [rawFinding],
      verdict: 'contradicted',
    });
    const a = await runReview(
      baseRun({ context: context(), transport: contradicted.transport })
    );
    expect(a.findings[0].state).toBe('dismissed-with-evidence');
    const insufficient = transportReturning({
      discovery: [rawFinding],
      verdict: 'insufficient',
    });
    const b = await runReview(
      baseRun({ context: context(), transport: insufficient.transport })
    );
    expect(b.findings[0].state).toBe('candidate');
  });

  it('counts invalid model output and marks that area not assessed', async () => {
    const transport = async () => ({ text: 'I think it is fine', usage: {} });
    const receipt = await runReview(baseRun({ context: context(), transport }));
    expect(receipt.stats.invalidCandidates).toBe(1);
    expect(receipt.coverage.notAssessed).toContain(
      'specialist:behavior-contracts'
    );
    expect(receipt.findings).toEqual([]);
  });

  it('drops malformed findings inside valid JSON', async () => {
    const { transport } = transportReturning({
      discovery: [{ severity: 'P9' }],
    });
    const receipt = await runReview(baseRun({ context: context(), transport }));
    expect(receipt.stats.invalidCandidates).toBe(1);
    expect(receipt.findings).toEqual([]);
  });

  it('reports provider errors as incomplete without leaking detail', async () => {
    const { transport } = transportReturning({ discovery: [], fail: true });
    const receipt = await runReview(baseRun({ context: context(), transport }));
    expect(receipt.status).toBe('incomplete');
    expect(receipt.failure).toBe('provider-error');
    expect(JSON.stringify(receipt)).not.toContain('secret detail');
  });

  it('stops at the budget and marks the receipt incomplete', async () => {
    const { transport } = transportReturning({ discovery: [rawFinding] });
    const receipt = await runReview(
      baseRun({
        riskRuleIds: ['billing-money'],
        context: context(),
        transport,
        limits: {
          budgetUsd: 0.0000001,
          maxCandidates: 12,
          concurrency: 1,
          discoveryMaxOutputTokens: 10,
          verificationMaxOutputTokens: 10,
        },
      })
    );
    expect(receipt.status).toBe('incomplete');
    expect(receipt.failure).toBe('budget-exhausted');
    expect(receipt.coverage.notAssessed).toContain('specialist:billing-money');
  });

  it('caps candidates and keeps the most severe', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...rawFinding,
      severity: i === 4 ? 'P0' : 'P2',
      consequenceClass: `class-${i}`,
    }));
    const { transport } = transportReturning({ discovery: many });
    const receipt = await runReview(
      baseRun({
        context: context(),
        transport,
        limits: {
          budgetUsd: 1,
          maxCandidates: 2,
          concurrency: 2,
          discoveryMaxOutputTokens: 10,
          verificationMaxOutputTokens: 10,
        },
      })
    );
    expect(receipt.findings).toHaveLength(2);
    expect(receipt.findings[0].severity).toBe('P0');
    expect(receipt.stats.droppedOverCap).toBe(3);
  });

  it('is stale without any model call when the head already moved', async () => {
    const { transport, calls } = transportReturning({
      discovery: [rawFinding],
    });
    const receipt = await runReview(
      baseRun({
        context: context(),
        transport,
        readLiveHead: async () => 'c'.repeat(40),
      })
    );
    expect(receipt.status).toBe('stale');
    expect(calls).toHaveLength(0);
  });

  it('is stale when the head moves during review', async () => {
    let reads = 0;
    const { transport } = transportReturning({ discovery: [rawFinding] });
    const receipt = await runReview(
      baseRun({
        context: context(),
        transport,
        readLiveHead: async () => (reads++ === 0 ? HEAD : 'c'.repeat(40)),
      })
    );
    expect(receipt.status).toBe('stale');
    expect(receipt.findings.every(f => f.state === 'stale')).toBe(true);
  });

  it('never reports clean when context was truncated or empty', async () => {
    const { transport } = transportReturning({ discovery: [] });
    const truncated = await runReview(
      baseRun({ context: context({ truncated: ['big.ts'] }), transport })
    );
    expect(truncated.coverage.notAssessed).toContain('context:big.ts');
    const empty = await runReview(
      baseRun({ context: context({ files: [] }), transport })
    );
    expect(empty.coverage.notAssessed).toContain('context:no-reviewable-files');
  });
});

describe('collectContext', () => {
  function fakeGit(files) {
    return async args => {
      if (args[0] === 'diff' && args[1] === '--name-only')
        return files.join('\n');
      if (args[0] === 'diff')
        return `patch for ${args.at(-1)}\n${'x'.repeat(50)}`;
      if (args[0] === 'grep') {
        if (args.includes("/route'"))
          return `${HEAD}:apps/web/lib/caller.ts\n${HEAD}:${PATH}\n`;
        throw new Error('no match');
      }
      if (args[0] === 'show') return 'import { handleWebhook } from "./route";';
      throw new Error(`unexpected ${args.join(' ')}`);
    };
  }

  it('collects reviewable diffs and importers, skipping lockfiles', async () => {
    const ctx = await collectContext({
      baseSha: BASE,
      headSha: HEAD,
      git: fakeGit([PATH, 'pnpm-lock.yaml', 'apps/web/lib/a.ts']),
    });
    expect(ctx.files.map(f => f.path)).toEqual([PATH, 'apps/web/lib/a.ts']);
    expect(ctx.skipped).toEqual(['pnpm-lock.yaml']);
    expect(ctx.importers).toEqual([
      expect.objectContaining({ path: 'apps/web/lib/caller.ts', of: PATH }),
    ]);
    expect(renderContext(ctx)).toContain('### Caller of');
  });

  it('records files dropped by size and count limits as truncated', async () => {
    const ctx = await collectContext({
      baseSha: BASE,
      headSha: HEAD,
      git: fakeGit([PATH, 'b.ts', 'c.ts']),
      limits: {
        maxBytes: 150,
        maxFiles: 2,
        maxImportersPerFile: 3,
        diffContextLines: 5,
      },
    });
    expect(ctx.files).toHaveLength(1);
    expect(ctx.truncated).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
  });

  it('rejects non-exact shas', async () => {
    await expect(
      collectContext({ baseSha: 'main', headSha: HEAD })
    ).rejects.toThrow(/hex/);
  });

  it('excerpts around the finding symbol', () => {
    const excerpt = excerptForFinding(context(), {
      location: { path: PATH, line: 2 },
      symbol: 'handleWebhook',
    });
    expect(excerpt).toContain('handleWebhook');
    expect(excerptForFinding(context(), { location: { path: 'x.ts' } })).toBe(
      ''
    );
  });
});

const rankRow = (id, model, family, quality, cost) => ({
  id,
  model,
  family,
  quality,
  provider: 'vercel-ai-gateway',
  list_price_in: 0.1,
  list_price_out: 0.4,
  expected_cost_per_success_usd: cost,
  p_success: quality / 100,
  price_basis: 'list',
});
const RANKINGS = {
  discovery: {
    ranked: [
      rankRow('g-flash', 'z-ai/glm-5.3-flash', 'glm', 68, 0.02),
      rankRow('d-flash', 'deepseek/deepseek-v4-flash', 'deepseek', 65, 0.03),
      rankRow('d-41', 'deepseek/deepseek-v4.1-flash', 'deepseek', 65, 0.06),
    ],
  },
  verification: {
    ranked: [rankRow('g-full', 'z-ai/glm-5.3', 'glm', 82, 0.003)],
  },
};

describe('models', () => {
  it('prices usage and treats unknown models as free of budget', () => {
    const prices = {
      'a/b': { family: 'f', inPerMillion: 2, outPerMillion: 4 },
    };
    expect(
      costUsd(prices, 'a/b', { inputTokens: 1e6, outputTokens: 1e6 })
    ).toBe(6);
    expect(costUsd(prices, 'unknown/model', { inputTokens: 5 })).toBe(0);
  });

  it('picks the cheapest pair whose verifier is another family and at least as strong', () => {
    const { routes, prices, routing } = selectRoutes(RANKINGS);
    // glm-flash is the cheapest discoverer, but the only verifier above the
    // floor is also glm, so deepseek discovers and glm-5.3 verifies.
    expect(routes).toEqual({
      discovery: 'deepseek/deepseek-v4-flash',
      verification: 'z-ai/glm-5.3',
    });
    expect(Object.keys(prices).sort()).toEqual(
      ['deepseek/deepseek-v4-flash', 'z-ai/glm-5.3'].sort()
    );
    expect(routing.discovery).toMatchObject({
      routerId: 'd-flash',
      priceBasis: 'list',
    });
  });

  it('honors pins only for router-ranked models', () => {
    expect(
      selectRoutes(RANKINGS, {
        PR_REVIEW_DISCOVERY_MODEL: 'deepseek/deepseek-v4.1-flash',
      }).routes.discovery
    ).toBe('deepseek/deepseek-v4.1-flash');
    expect(() =>
      selectRoutes(RANKINGS, {
        PR_REVIEW_VERIFICATION_MODEL: 'z-ai/glm-5.3-flash',
      })
    ).toThrow(/not a router-ranked model/);
  });

  it('refuses when no valid pair exists', () => {
    expect(() =>
      selectRoutes({
        discovery: { ranked: [RANKINGS.discovery.ranked[0]] },
        verification: RANKINGS.verification,
      })
    ).toThrow(/no different-family review pair/);
  });

  it('reads the ranking through the router CLI', async () => {
    const calls = [];
    const run = async (cmd, args) => {
      calls.push(args);
      return { stdout: JSON.stringify(RANKINGS.discovery) };
    };
    const rankings = await fetchRankings({ run });
    expect(rankings.discovery.ranked).toHaveLength(3);
    expect(calls.map(args => args[args.indexOf('--capability') + 1])).toEqual([
      'review',
      'review-verify',
    ]);
    await expect(
      fetchRanking('review', { run: async () => ({ stdout: '{}' }) })
    ).rejects.toThrow(/rank output invalid/);
  });

  it('gets a floored, different-family pair from the real registry', async () => {
    const { routing } = selectRoutes(await fetchRankings());
    expect(routing.discovery.family).not.toBe(routing.verification.family);
    expect(routing.verification.pSuccess).toBeGreaterThanOrEqual(0.75);
  });

  it('refuses to build a transport without a key', () => {
    expect(() => createGatewayTransport({ apiKey: ' ' })).toThrow(/credential/);
  });
});

describe('replay outcomes', () => {
  const receipt = (findings, status = 'complete') => ({
    status,
    findings,
    routing: {
      discovery: { routerId: 'd-flash', model: 'deepseek/deepseek-v4-flash' },
      verification: { routerId: 'g-full', model: 'z-ai/glm-5.3' },
    },
    stats: {
      minutes: 2,
      usage: {
        'deepseek/deepseek-v4-flash': { inputTokens: 100, outputTokens: 10 },
      },
    },
  });
  const hit = { state: 'verified', location: { path: 'a.ts', line: 10 } };

  it('records one outcome per model and skips incomplete receipts', () => {
    const outcomes = outcomesFromCases([
      { receipt: receipt([hit]), expected: [{ path: 'a.ts', line: 12 }] },
      { receipt: receipt([hit]), clean: true },
      { receipt: receipt([], 'incomplete'), expected: [{ path: 'a.ts' }] },
      { receipt: { ...receipt([]), routing: undefined }, clean: true },
    ]);
    expect(outcomes).toHaveLength(4);
    expect(outcomes[0]).toMatchObject({
      modelId: 'd-flash',
      success: true,
      tokensIn: 100,
      tokensOut: 10,
      minutes: 1,
    });
    expect(outcomes[1]).toMatchObject({
      modelId: 'g-full',
      capability: 'review-verify',
      tokensIn: 0,
    });
    expect(outcomes[2].success).toBe(false);
  });

  it('writes outcomes through the router CLI', () => {
    const calls = [];
    const count = recordOutcomes(
      [
        {
          modelId: 'd-flash',
          capability: 'review',
          success: true,
          tokensIn: 1,
          tokensOut: 2,
          minutes: 3,
        },
      ],
      (cmd, args) => calls.push(args)
    );
    expect(count).toBe(1);
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        'record-outcome',
        '--model-id',
        'd-flash',
        '--success',
        '1',
      ])
    );
  });
});

describe('readRiskRuleIds', () => {
  it('reads rule ids and distinguishes missing from empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-review-'));
    const good = join(dir, 'risk.json');
    writeFileSync(
      good,
      JSON.stringify({ matchedRules: [{ id: 'billing-money' }, {}] })
    );
    expect(readRiskRuleIds(good)).toEqual(['billing-money']);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{');
    expect(readRiskRuleIds(bad)).toBeNull();
    const none = join(dir, 'none.json');
    writeFileSync(none, '{}');
    expect(readRiskRuleIds(none)).toEqual([]);
    expect(readRiskRuleIds(join(dir, 'missing.json'))).toBeNull();
    expect(readRiskRuleIds('')).toBeNull();
  });
});

describe('scoreReplay', () => {
  const receipt = (findings, status = 'complete', usd = 0.1) => ({
    status,
    spend: { usd },
    findings: findings.map(([path, line, state = 'verified']) => ({
      state,
      location: { path, line },
    })),
  });

  it('scores precision, recall, clean false alarms and cost', () => {
    const score = scoreReplay([
      {
        receipt: receipt([
          ['a.ts', 10],
          ['a.ts', 300],
        ]),
        expected: [{ path: 'a.ts', line: 12 }],
      },
      {
        receipt: receipt([['b.ts', 1, 'candidate']]),
        expected: [{ path: 'b.ts' }],
      },
      { receipt: receipt([['c.ts', 1]], 'incomplete'), clean: true },
      { receipt: receipt([]), clean: true },
    ]);
    expect(score).toMatchObject({
      cases: 4,
      precision: 0.3333,
      recall: 0.5,
      cleanFalseAlarmRate: 0.5,
      incompleteRate: 0.25,
      usdTotal: 0.4,
    });
  });

  it('returns null ratios for empty denominators', () => {
    expect(scoreReplay([])).toMatchObject({ precision: null, recall: null });
  });
});

describe('pr-review workflow contract', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/pr-review.yml'),
    'utf8'
  );

  it('runs trusted main code after PR CI, same-repo only, and ships disabled', () => {
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain("vars.PR_REVIEW_ENABLED == 'true'");
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion != 'cancelled'"
    );
    expect(workflow).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('runs-on: ubuntu-latest');
  });

  it('never gets write access, never posts, never executes PR code', () => {
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toMatch(
      /pull_request_target|createComment|createReview|gh pr/
    );
    expect(workflow).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head/
    );
    expect(workflow).not.toContain('pull_requests[0].head');
  });
});
