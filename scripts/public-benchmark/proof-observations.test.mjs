import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildProofObservations,
  jovieMetrics,
  labelsFrom,
  main,
  REGISTRY_PATH,
} from './proof-observations.mjs';

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const RUN = 'https://github.com/JovieInc/Jovie/actions/runs/1';

function receipt(speed = {}, agentScore = 90) {
  const m = v => (v === null ? undefined : { median: v });
  return {
    measuredAt: '2026-10-27T19:56:11.062Z',
    platforms: [
      {
        id: 'jovie',
        label: 'Jovie',
        profiles: [
          {
            id: 'tim',
            speed: {
              lcp: m(speed.lcp ?? 5439),
              tbt: m(speed.tbt ?? 402),
              cls: m(speed.cls ?? 0),
              ttfb: m(speed.ttfb ?? 63.1),
              bytes: m(speed.bytes ?? 1_160_106),
            },
            agent: { score: agentScore },
          },
        ],
      },
    ],
  };
}

function gate(lcpComparisons, extra = []) {
  return {
    ok: true,
    claims: [
      { id: 'profile-speed.lcp', jovie: 5439, comparisons: lcpComparisons },
      ...extra,
    ],
  };
}

describe('benchmark -> proof observations', () => {
  it('records plain Jovie-only stats with the run receipt', () => {
    const out = buildProofObservations({
      registry,
      gate: gate([]),
      receipt: receipt(),
      runUrl: RUN,
    });
    const byId = Object.fromEntries(
      out.observations.map(o => [o.id, o.observation])
    );
    assert.equal(byId.profile_ttfb_ms.value, 63.1);
    assert.equal(byId.profile_agent_score.value, 90);
    assert.equal(byId.profile_ttfb_ms.receipt, RUN);
    assert.equal(byId.profile_ttfb_ms.source, 'workflow:public-benchmark');
  });

  it('withholds a comparison unless Jovie beats every measured comparator (min 2)', () => {
    const oneOfOne = buildProofObservations({
      registry,
      gate: gate([
        { platform: 'platform-a', value: null, verdict: 'unknown' },
        { platform: 'platform-c', value: 8423, verdict: 'passes' },
      ]),
      receipt: receipt(),
      runUrl: RUN,
    });
    assert.ok(!oneOfOne.observations.some(o => o.id === 'profile_lcp_rank'));
    assert.match(
      oneOfOne.skipped.find(s => s.id === 'profile_lcp_rank').reason,
      /beats 1 of 1/
    );

    const loseOne = buildProofObservations({
      registry,
      gate: gate([
        { platform: 'platform-b', value: 4000, verdict: 'fails' },
        { platform: 'platform-c', value: 8423, verdict: 'passes' },
      ]),
      receipt: receipt(),
      runUrl: RUN,
    });
    assert.ok(!loseOne.observations.some(o => o.id === 'profile_lcp_rank'));
    assert.deepEqual(
      loseOne.ratchets.find(r => r.kind === 'loses'),
      {
        kind: 'loses',
        metric: 'speed.lcp.median',
        platform: 'platform-b',
        jovie: 5439,
        them: 4000,
      }
    );
  });

  it('publishes a full sweep with a labelled breakdown', () => {
    const out = buildProofObservations({
      registry,
      gate: gate([
        { platform: 'platform-b', value: 12405, verdict: 'passes' },
        { platform: 'platform-c', value: 8423, verdict: 'passes' },
      ]),
      receipt: receipt(),
      runUrl: RUN,
      labels: labelsFrom({
        platforms: [{ id: 'platform-b', label: 'Beacons' }, { id: 'jovie' }],
      }),
    });
    const lcp = out.observations.find(o => o.id === 'profile_lcp_rank');
    assert.equal(lcp.observation.value, 2);
    assert.deepEqual(
      lcp.observation.breakdown.map(e => e.label),
      ['Jovie', 'Beacons', 'Platform C']
    );
    assert.equal(lcp.observation.breakdown.filter(e => e.self).length, 1);
  });

  it('treats a tie inside the margin as no loss, and files absolute-target ratchets', () => {
    const out = buildProofObservations({
      registry,
      gate: {
        claims: [
          {
            id: 'profile-speed.cls',
            jovie: 0,
            comparisons: [
              { platform: 'platform-c', value: 0, verdict: 'fails' },
            ],
          },
          {
            id: 'profile-agent-readiness.score',
            jovie: 60,
            comparisons: [
              { platform: 'platform-c', value: 80, verdict: 'fails' },
            ],
          },
        ],
      },
      receipt: receipt({ lcp: 5439, tbt: 402, cls: 0.2 }),
      runUrl: RUN,
    });
    assert.equal(
      out.ratchets.filter(
        r => r.metric === 'speed.cls.median' && r.kind === 'loses'
      ).length,
      0
    );
    assert.ok(
      out.ratchets.some(r => r.kind === 'loses' && r.metric === 'agent.score')
    );
    assert.deepEqual(
      out.ratchets
        .filter(r => r.kind === 'target')
        .map(r => r.metric)
        .sort(),
      ['speed.cls.median', 'speed.lcp.median', 'speed.tbt.median']
    );
  });

  it('skips stats the run did not measure', () => {
    const out = buildProofObservations({
      registry,
      gate: { claims: [] },
      receipt: { measuredAt: '2026-10-27T00:00:00Z', platforms: [] },
      runUrl: RUN,
    });
    assert.equal(out.observations.length, 0);
    assert.deepEqual(jovieMetrics({}), {});
    assert.ok(out.skipped.some(s => s.reason === 'not measured this run'));
    assert.ok(out.skipped.some(s => s.reason === 'claim not in this run'));
  });
});

describe('proof-observations CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proof-obs-'));
  const gatePath = join(dir, 'gate.json');
  const receiptPath = join(dir, 'receipt.json');
  writeFileSync(gatePath, JSON.stringify(gate([])));
  writeFileSync(receiptPath, JSON.stringify(receipt()));
  const args = ['--gate', gatePath, '--receipt', receiptPath, '--run-url', RUN];

  it('requires its inputs', async () => {
    assert.equal(await main([], {}), 2);
  });

  it('writes the ratchet file and does not post without --post or a secret', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true };
    };
    assert.equal(await main([...args, '--out', dir], {}, fetchImpl), 0);
    const ratchets = JSON.parse(
      readFileSync(join(dir, 'proof-ratchets.json'), 'utf8')
    );
    assert.equal(ratchets.runUrl, RUN);
    assert.equal(await main([...args, '--post'], {}, fetchImpl), 0);
    assert.equal(calls, 0);
  });

  it('posts to the intake with the content secret and fails on a rejection', async () => {
    const seen = [];
    const ok = async (url, init) => {
      seen.push({ url, init });
      return { ok: true };
    };
    const env = {
      CONTENT_PUBLISH_SECRET: 's3cret',
      JOVIE_BASE_URL: 'https://staging.jov.ie',
    };
    assert.equal(await main([...args, '--post'], env, ok), 0);
    assert.equal(
      seen[0].url,
      'https://staging.jov.ie/api/internal/proof-stats'
    );
    assert.equal(seen[0].init.headers['x-content-actor'], 'public-benchmark');
    assert.equal(JSON.parse(seen[0].init.body).observations.length, 2);
    const rejected = async () => ({
      ok: false,
      status: 422,
      text: async () => 'Rejected',
    });
    assert.equal(await main([...args, '--post'], env, rejected), 1);
  });
});
