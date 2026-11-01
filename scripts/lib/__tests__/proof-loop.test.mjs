import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  approvalRequests,
  establishPlans,
  ideate,
  keepTruePlans,
  loadRegistry,
  ratchetPlans,
  runProofLoop,
  winTexts,
} from '../proof-loop.mjs';
import { runRemediationSweep } from '../remediation-sweep.mjs';

const ROOT = join(import.meta.dirname, '../../..');
const registry = loadRegistry(ROOT);
const NOW = Date.parse('2026-10-29T12:00:00Z');

const feed = {
  metrics: { published: 1, stale: 1, belowThreshold: 2, unapproved: 1 },
  stats: [
    {
      id: 'accounts_total',
      state: 'publishable',
      visibility: 'public',
      status: 'live',
      legalClass: 'plain',
    },
    {
      id: 'smart_links_total',
      state: 'stale',
      visibility: 'public',
      status: 'live',
      legalClass: 'plain',
      measuredAt: '2026-10-27T00:00:00Z',
      sourceKind: 'production',
    },
    {
      id: 'eng_merges_per_day',
      state: 'stale',
      visibility: 'internal',
      status: 'proposed',
      legalClass: 'plain',
    },
    {
      id: 'security_open_critical',
      state: 'publishable',
      visibility: 'public',
      status: 'proposed',
      legalClass: 'plain',
    },
    {
      id: 'profile_lcp_rank',
      state: 'unapproved',
      visibility: 'public',
      status: 'live',
      legalClass: 'comparative',
      rawValue: 3,
      measuredAt: '2026-10-27T19:56:11Z',
      label: 'Profile load speed (LCP) against link-in-bio platforms',
      methodology: '/proof/methodology#profile_lcp_rank',
    },
  ],
  events: [
    {
      id: 'milestone:accounts_total:100',
      type: 'milestone',
      statId: 'accounts_total',
      value: 100,
      at: '2026-10-29T10:00:00Z',
    },
    {
      id: 'milestone:accounts_total:10',
      type: 'milestone',
      statId: 'accounts_total',
      value: 10,
      at: '2026-10-20T10:00:00Z',
    },
    {
      id: 'published:accounts_total:x',
      type: 'published',
      statId: 'accounts_total',
      value: 1004,
      at: '2026-10-29T10:00:00Z',
    },
  ],
};

const ratchets = {
  measuredAt: '2026-10-27T19:56:11Z',
  runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
  ratchets: [
    { kind: 'target', metric: 'speed.lcp.median', jovie: 5439.2, target: 2500 },
    {
      kind: 'loses',
      metric: 'speed.tbt.median',
      platform: 'platform-c',
      jovie: 402,
      them: 300,
    },
  ],
};

describe('proof loop stages', () => {
  it('ideates by value x feasibility, best first', () => {
    const ideas = ideate(registry);
    assert.equal(ideas[0].id, 'accounts_total');
    assert.ok(
      ideas.every((idea, i) => i === 0 || ideas[i - 1].score >= idea.score)
    );
    assert.ok(ideas.some(idea => idea.id === 'security_open_critical'));
  });

  it('files establish work only for proposed stats without measurements', () => {
    const plans = establishPlans(registry, feed);
    const ids = plans.map(p => p.fingerprint);
    assert.ok(ids.includes('proof-stat-establish-agent_path_cert'));
    assert.ok(!ids.includes('proof-stat-establish-security_open_critical'));
    assert.ok(!ids.includes('proof-stat-establish-accounts_total'));
    assert.match(plans[0].description, /Fingerprint: `proof-stat-establish-/);
    assert.equal(
      establishPlans(registry, null).length,
      registry.stats.filter(s => s.status === 'proposed').length
    );
  });

  it('turns every benchmark loss and missed target into a ratchet issue', () => {
    const plans = ratchetPlans(ratchets);
    assert.deepEqual(
      plans.map(p => p.fingerprint),
      [
        'proof-stat-ratchet-speed-lcp-median-target',
        'proof-stat-ratchet-speed-tbt-median-platform-c',
      ]
    );
    assert.match(plans[0].title, /misses its target: 5,439\.2 vs 2,500/);
    assert.match(plans[1].title, /loses to platform-c: 402 vs 300/);
    assert.deepEqual(ratchetPlans(null), []);
  });

  it('alarms only on live public stats that went stale', () => {
    assert.deepEqual(
      keepTruePlans(feed).map(p => p.fingerprint),
      ['proof-stat-stale-smart_links_total']
    );
  });

  it('asks the founder before any comparison publishes, never by default', () => {
    const [card] = approvalRequests(feed, NOW);
    assert.equal(card.kind, 'decision');
    assert.equal(card.defaultDecision, 'none');
    assert.equal(card.idempotencyKey, 'proof-approve-profile_lcp_rank-3');
    assert.ok(card.title.length <= 120);
    assert.equal(card.decideBy, '2026-11-05T12:00:00.000Z');
  });

  it('writes win texts for milestones newer than the last pass', () => {
    assert.deepEqual(winTexts(feed, registry, '2026-10-28T00:00:00Z'), [
      {
        id: 'milestone:accounts_total:100',
        text: 'Artists and teams on Jovie just passed 100.',
      },
    ]);
    assert.equal(winTexts(feed, registry, null).length, 2);
  });
});

describe('runProofLoop', () => {
  it('records stage timestamps and metrics, and skips feed stages when the feed is down', async () => {
    let t = NOW;
    const report = await runProofLoop({
      root: ROOT,
      loadFeed: async () => {
        throw new Error('CONTENT_PUBLISH_SECRET not set');
      },
      loadRatchets: async () => ratchets,
      loadClaimsMeasurement: async () => ({ numericClaims: 2, boundShare: 0 }),
      now: () => (t += 1000),
    });
    const feedStage = report.run.stages.find(s => s.name === 'feed');
    assert.equal(feedStage.ok, false);
    assert.ok(feedStage.startedAt < feedStage.endedAt);
    assert.match(report.warnings[0], /feed unavailable/);
    assert.equal(report.run.metrics.published, null);
    assert.equal(report.run.metrics.statBoundShare, 0);
    assert.ok(
      report.plans.some(p => p.fingerprint.startsWith('proof-stat-ratchet-'))
    );
    assert.ok(
      report.plans.some(p => p.fingerprint.startsWith('proof-stat-establish-'))
    );
    assert.equal(report.run.approvals.length, 0);
  });

  it('runs every stage with a live feed', async () => {
    const report = await runProofLoop({
      root: ROOT,
      loadFeed: async () => feed,
      loadRatchets: async () => ratchets,
      loadClaimsMeasurement: async () => ({
        numericClaims: 4,
        boundShare: 0.5,
      }),
      since: '2026-10-28T00:00:00Z',
      now: () => NOW,
    });
    assert.ok(report.run.stages.every(s => s.ok));
    assert.equal(report.run.metrics.published, 1);
    assert.equal(report.run.metrics.approvalRequests, 1);
    assert.equal(report.run.metrics.winTexts, 1);
    assert.ok(
      report.plans.some(
        p => p.fingerprint === 'proof-stat-stale-smart_links_total'
      )
    );
  });
});

describe('remediation sweep proof mode', () => {
  it('files the loop plans and warns when unwired', async () => {
    const filed = [];
    const upsert = async args => {
      filed.push(args);
      return { identifier: 'JOV-1', created: true };
    };
    const wired = await runRemediationSweep({
      mode: 'proof',
      dryRun: true,
      loadProof: async () => ({
        plans: ratchetPlans(ratchets),
        warnings: ['w'],
      }),
      upsert,
      apiKey: 'k',
    });
    assert.ok(wired.warnings.includes('w'));
    const unwired = await runRemediationSweep({
      mode: 'proof',
      dryRun: true,
      upsert,
      apiKey: 'k',
    });
    assert.ok(
      unwired.warnings.some(w => /Proof-stat loop loader not wired/.test(w))
    );
  });
});

describe('proof loop loaders', async () => {
  const { loadProofFeed, loadProofRatchets, loadClaimsMeasurement } =
    await import('../../remediation-sweep.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  it('reads the feed with the content writer secret, and refuses without it', async () => {
    await assert.rejects(loadProofFeed({ env: {} }), /CONTENT_PUBLISH_SECRET/);
    const calls = [];
    const body = await loadProofFeed({
      env: {
        CONTENT_PUBLISH_SECRET: 's',
        JOVIE_BASE_URL: 'https://staging.jov.ie',
      },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => feed };
      },
    });
    assert.equal(
      calls[0].url,
      'https://staging.jov.ie/api/internal/proof-stats'
    );
    assert.equal(calls[0].init.headers['x-content-actor'], 'proof-loop');
    assert.equal(body.metrics.published, 1);
    await assert.rejects(
      loadProofFeed({
        env: { CONTENT_PUBLISH_SECRET: 's' },
        fetchImpl: async () => ({ ok: false, status: 401 }),
      }),
      /401/
    );
  });

  it('downloads the latest benchmark ratchets through the gh client', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'proof-rt-'));
    writeFileSync(join(dir, 'proof-ratchets.json'), JSON.stringify(ratchets));
    const seen = [];
    const gh = async args => {
      seen.push(args.slice(0, 2).join(' '));
      return args[1] === 'list'
        ? { code: 0, stdout: '[{"databaseId":42}]', stderr: '' }
        : { code: 0, stdout: '', stderr: '' };
    };
    const doc = await loadProofRatchets({ ghRunner: gh, dir });
    assert.deepEqual(seen, ['run list', 'run download']);
    assert.equal(doc.ratchets.length, 2);
    await assert.rejects(
      loadProofRatchets({
        ghRunner: async () => ({ code: 0, stdout: '[]', stderr: '' }),
        dir,
      }),
      /no successful public benchmark run/
    );
    await assert.rejects(
      loadProofRatchets({
        ghRunner: async () => ({ code: 1, stdout: '', stderr: 'boom' }),
        dir,
      }),
      /benchmark run lookup: boom/
    );
    const empty = mkdtempSync(join(tmpdir(), 'proof-rt-'));
    await assert.rejects(
      loadProofRatchets({ ghRunner: gh, dir: empty }),
      /no proof-ratchets.json/
    );
  });

  it('measures the stat-bound share from the guard', async () => {
    const m = await loadClaimsMeasurement();
    assert.equal(m.schema, 'jovie.stat-claims.measurement/v1');
    assert.equal(typeof m.boundShare, 'number');
  });
});
