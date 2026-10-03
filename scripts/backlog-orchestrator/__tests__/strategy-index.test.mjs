// biome-ignore-all format: Preserve legacy fixture formatting.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  CONTEXT_BLOCKER,
  collectContextEvidence,
  validateContextEvidence,
} from '../context-gate.mjs';
import {
  expandStrategyTerms,
  isStrategySensitive,
  loadStrategyIndex,
  matchStrategyTheses,
  requiredStrategyTheses,
} from '../strategy-index.mjs';
import { contextEvidenceFor } from './pre-lease.mjs';

const NOW = new Date().toISOString();
const THESIS_SLUG = 'strategy/sell-outcomes-replaceable-substrate';
const THESIS_ID = 'STRAT-2026-10-02-01';

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-7521',
    title: 'Update free plan pricing and packaging',
    description: 'Bound the free tier subsidy for creator workflows.',
    comments: { nodes: [] },
    ...overrides,
  };
}

function strategyEvidence() {
  return {
    theses: [{ slug: THESIS_SLUG, id: 'page-strat-1', revision: 'rev-1' }],
    matched: [THESIS_ID],
    lookup: { source: 'index', ms: 3 },
  };
}

function gbrainStub({ failStrategyGet = false } = {}) {
  return {
    async getPageWithEvidence(slug) {
      if (failStrategyGet && slug === THESIS_SLUG)
        throw new Error('gbrain-strategy-page-missing');
      return {
        page: {
          slug,
          id: `page-${slug}`,
          revision: 'rev-1',
          compiledTruth:
            'implementation owner: Symphony\nverification owner: Gem',
        },
        source: 'get',
        ms: 1,
      };
    },
    async searchPagesWithEvidence() {
      return {
        pages: [{ slug: 'notes/prior', id: 'p1', revision: 'r1' }],
        source: 'keyword',
        ms: 1,
      };
    },
  };
}

function syntheticIndex() {
  const winner = {
    id: 'STRAT-NEW',
    slug: 'strategy/new-doctrine',
    title: 'New doctrine',
    status: 'active',
    keywords: ['bounded usage tier'],
    supersedes: ['STRAT-OLD'],
    supersededBy: null,
  };
  const loser = {
    id: 'STRAT-OLD',
    slug: 'strategy/old-doctrine',
    title: 'Old doctrine',
    status: 'superseded',
    keywords: ['unlimited lifetime access'],
    supersedes: [],
    supersededBy: 'STRAT-NEW',
  };
  return {
    header: { schema: 'jovie-strategy-theses/v1' },
    theses: [winner, loser],
    byId: new Map([
      [winner.id, winner],
      [loser.id, loser],
    ]),
  };
}

describe('strategy index', () => {
  it('loads the canonical registry with provenance', () => {
    const index = loadStrategyIndex();
    const thesis = index.byId.get(THESIS_ID);
    assert.equal(thesis.slug, THESIS_SLUG);
    assert.equal(thesis.status, 'active');
    assert.equal(thesis.source.kind, 'linear-document');
    assert.equal(thesis.source.date, '2026-10-02');
    assert.ok(thesis.keywords.includes('free plan'));
  });

  it('flags strategy-sensitive topics and ignores ordinary engineering', () => {
    for (const sensitive of [
      'free plan pricing',
      'creator workflow onboarding',
      'agent swarm orchestration',
      'execution substrate migration',
      'lifetime deal campaign',
      'business model change',
    ]) {
      assert.equal(isStrategySensitive(sensitive), true, sensitive);
    }
    for (const neutral of [
      'Bind pre-lease context receipts',
      'Fix flaky Playwright selector on settings page',
      'Upgrade sentry dependency',
    ]) {
      assert.equal(isStrategySensitive(neutral), false, neutral);
    }
  });

  it('expands adjacent terms to canonical anchors', () => {
    assert.ok(expandStrategyTerms('an AppSumo launch').includes('lifetime deal'));
    assert.ok(expandStrategyTerms('freemium users').includes('free plan'));
    assert.ok(expandStrategyTerms('sub-agent fleet').includes('swarm'));
    assert.ok(expandStrategyTerms('vendor lock-in risk').includes('execution substrate'));
  });

  it('retrieves the thesis from exact keywords without knowing the title', () => {
    const index = loadStrategyIndex();
    const { required } = matchStrategyTheses(index, 'Change the free plan limits');
    assert.deepEqual(required.map(t => t.id), [THESIS_ID]);
  });

  it('retrieves the thesis from paraphrases and adjacent concepts', () => {
    const index = loadStrategyIndex();
    for (const text of [
      'Should we run an AppSumo campaign?',
      'Do not expose the sub-agent swarm in the UI',
      'Evaluate Codex Cloud as our sandbox provider',
      'Model router fallback for a flaky LLM provider',
      'freemium packaging limits',
    ]) {
      const { required } = matchStrategyTheses(index, text);
      assert.ok(
        required.some(t => t.id === THESIS_ID),
        `expected thesis for: ${text}`
      );
    }
  });

  it('returns nothing when no strategy applies', () => {
    const index = loadStrategyIndex();
    const { required, superseded } = matchStrategyTheses(
      index,
      'Bind pre-lease context receipts'
    );
    assert.deepEqual(required, []);
    assert.deepEqual(superseded, []);
  });

  it('surfaces current doctrine when superseded terms match', () => {
    const index = syntheticIndex();
    const { required, superseded } = matchStrategyTheses(
      index,
      'unlimited lifetime access for early adopters'
    );
    assert.deepEqual(superseded.map(t => t.id), ['STRAT-OLD']);
    assert.deepEqual(required.map(t => t.id), ['STRAT-NEW']);
  });

  for (const [name, links] of [
    ['self-loop', [['A', 'A']]],
    ['two-node cycle', [['A', 'B'], ['B', 'A']]],
  ]) {
    it(`fails closed on a supersession ${name} without hanging`, () => {
      const moduleUrl = new URL('../strategy-index.mjs', import.meta.url).href;
      // A test-runner timeout cannot interrupt an infinite synchronous walk.
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import { matchStrategyTheses, requiredStrategyTheses } from ${JSON.stringify(moduleUrl)};
        const theses = ${JSON.stringify(links)}.map(([id, supersededBy], i) => ({
          id, supersededBy, status: 'superseded', keywords: i === 0 ? ['free plan'] : [],
        }));
        const index = { theses, byId: new Map(theses.map(t => [t.id, t])) };
        const expected = { name: 'Error', message: 'strategy-thesis-supersession-cycle' };
        assert.throws(() => matchStrategyTheses(index, 'free plan'), expected);
        assert.throws(() => requiredStrategyTheses({ title: 'free plan' }, { index }), expected);
      `], { encoding: 'utf8', timeout: 2_000, killSignal: 'SIGKILL' });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);
    });
  }

  it('preserves shared multi-hop replacements, provenance and score order', () => {
    const theses = [
      { id: 'OLD-A', status: 'superseded', keywords: ['retired alpha'], supersededBy: 'MIDDLE' },
      { id: 'OLD-B', status: 'superseded', keywords: ['retired beta'], supersededBy: 'MIDDLE' },
      { id: 'MIDDLE', status: 'superseded', keywords: [], supersededBy: 'STRAT-00' },
      { id: 'STRAT-00', status: 'active', keywords: [], supersededBy: null },
      { id: 'STRAT-A', status: 'active', keywords: ['direct match'], supersededBy: null },
      { id: 'STRAT-Z', status: 'active', keywords: ['direct match', 'strong match'], supersededBy: null },
    ];
    const index = { theses, byId: new Map(theses.map(t => [t.id, t])) };
    const { required, superseded } = matchStrategyTheses(
      index, 'retired alpha retired beta direct match strong match'
    );
    assert.deepEqual(required, [theses[5], theses[4], theses[3]]);
    assert.deepEqual(superseded, [theses[0], theses[1]]);
  });

  it('requires no strategy binding for non-sensitive issues', () => {
    const neutral = issue({
      title: 'Bind pre-lease context receipts',
      description: 'Deterministic control-plane work.',
    });
    assert.deepEqual(requiredStrategyTheses(neutral), []);
  });
});

describe('context gate strategy binding', () => {
  it('collects thesis bindings for strategy-sensitive issues', async () => {
    const result = await collectContextEvidence({
      issue: issue(),
      gbrain: gbrainStub(),
      now: NOW,
    });
    assert.equal(result.reason, null);
    assert.deepEqual(result.evidence.strategy.matched, [THESIS_ID]);
    assert.equal(result.evidence.strategy.theses[0].slug, THESIS_SLUG);
    assert.equal(
      validateContextEvidence(issue(), result.evidence, { now: NOW }),
      null
    );
  });

  it('fails with strategy-miss when the thesis page cannot be retrieved', async () => {
    const result = await collectContextEvidence({
      issue: issue(),
      gbrain: gbrainStub({ failStrategyGet: true }),
      now: NOW,
    });
    assert.equal(result.reason, CONTEXT_BLOCKER.STRATEGY_MISS);
    assert.match(result.detail, /strategy\/sell-outcomes-replaceable-substrate/);
  });

  it('rejects evidence missing the required strategy binding', () => {
    const evidence = contextEvidenceFor(issue(), { now: NOW });
    assert.equal(
      validateContextEvidence(issue(), evidence, { now: NOW }),
      CONTEXT_BLOCKER.STRATEGY_MISS
    );
  });

  it('rejects evidence binding the wrong thesis', () => {
    const evidence = contextEvidenceFor(issue(), {
      now: NOW,
      strategy: {
        theses: [{ slug: 'strategy/unrelated', id: 'p', revision: 'r' }],
        matched: ['STRAT-OTHER'],
        lookup: { source: 'index', ms: 1 },
      },
    });
    assert.equal(
      validateContextEvidence(issue(), evidence, { now: NOW }),
      CONTEXT_BLOCKER.STRATEGY_MISS
    );
  });

  it('rejects a strategy binding on a non-sensitive issue', () => {
    const neutral = issue({
      title: 'Bind pre-lease context receipts',
      description: 'Deterministic control-plane work.',
    });
    const evidence = contextEvidenceFor(neutral, {
      now: NOW,
      strategy: strategyEvidence(),
    });
    assert.equal(
      validateContextEvidence(neutral, evidence, { now: NOW }),
      'context-malformed'
    );
  });

  it('accepts valid evidence with the strategy binding', () => {
    const evidence = contextEvidenceFor(issue(), {
      now: NOW,
      strategy: strategyEvidence(),
    });
    assert.equal(
      validateContextEvidence(issue(), evidence, { now: NOW }),
      null
    );
  });
});
