import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verdictSplit } from '../cert-bottleneck.mjs';
import { decideCarry } from '../golden-path-cert-reuse.mjs';
import { certificationVerdict, SURFACE_IDS } from '../prod-cert.mjs';
import {
  carriedReceipts,
  currentStandIns,
  inLaunchOrder,
  loadCarryPlan,
  parseSurfaceList,
  surfacesToCertify,
} from '../prod-cert-carry.mjs';

const served = 'a'.repeat(40);
const older = 'b'.repeat(40);
const at = '2026-11-22T12:00:00.000Z';
const from = {
  sha: older,
  endedAt: '2026-11-01T00:00:00.000Z',
  runUrl: 'https://github.com/jovieinc/jovie/actions/runs/1',
};

/** Every step last passed on `older`; `touched` steps re-certify. */
function planFor(touched, current = []) {
  return decideCarry({
    servedSha: served,
    ledger: {
      servedSha: older,
      surfaces: Object.fromEntries(
        SURFACE_IDS.map(id => [
          id,
          {
            lastPassed: { ...from, sha: current.includes(id) ? served : older },
          },
        ])
      ),
    },
    touched: () => ({ all: false, steps: touched }),
  });
}

describe('prod-cert carry (JOV-14402)', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('parses --surfaces and refuses unknown steps', () => {
    expect(parseSurfaceList(undefined)).toBeNull();
    expect(parseSurfaceList('  ')).toBeNull();
    expect(parseSurfaceList('checkout, chat landing')).toEqual([
      'landing',
      'chat',
      'checkout',
    ]);
    expect(() => parseSurfaceList('chat paywall')).toThrow(/paywall/u);
  });

  it('certifies only the plan recertify steps', () => {
    const plan = planFor(['chat', 'checkout']);
    expect(surfacesToCertify(plan, null)).toEqual(['chat', 'checkout']);
    expect(surfacesToCertify(plan, ['checkout'])).toEqual(['checkout']);
    expect(surfacesToCertify(null, null)).toEqual([...SURFACE_IDS]);
  });

  it('reads a plan file and carries nothing from a bad one', () => {
    dir = mkdtempSync(join(tmpdir(), 'prod-cert-carry-'));
    const good = join(dir, 'good.json');
    const bad = join(dir, 'bad.json');
    writeFileSync(good, JSON.stringify(planFor(['chat'])));
    writeFileSync(bad, '{"schema":"jovie.golden-path-carry/v1"}');
    expect(loadCarryPlan(good)?.recertify).toEqual([
      expect.objectContaining({ surface: 'chat' }),
    ]);
    expect(loadCarryPlan(bad)).toBeNull();
    expect(loadCarryPlan(join(dir, 'missing.json'))).toBeNull();
    expect(loadCarryPlan(undefined)).toBeNull();
  });

  it('posts a passed receipt for the served SHA naming where it came from', () => {
    const receipts = carriedReceipts(planFor(['chat']), {
      served: { sha: served, deploymentId: 'dpl_1' },
      runUrl: 'https://github.com/jovieinc/jovie/actions/runs/2',
      now: () => at,
    });
    expect(receipts.map(r => r.surface)).toEqual(
      SURFACE_IDS.filter(id => id !== 'chat')
    );
    const [landing] = receipts;
    expect(landing).toMatchObject({
      surface: 'landing',
      status: 'passed',
      sha: served,
      deploymentId: 'dpl_1',
      carriedFrom: from,
    });
    expect(landing.checks).toEqual([
      expect.objectContaining({ id: 'carried-forward', status: 'passed' }),
    ]);
    expect(landing.checks[0].summary).toContain(older.slice(0, 8));
  });

  it('carries nothing when production now serves another build', () => {
    const receipts = carriedReceipts(planFor([]), {
      served: { sha: 'c'.repeat(40) },
      now: () => at,
    });
    expect(receipts).toHaveLength(SURFACE_IDS.length);
    for (const receipt of receipts) {
      expect(receipt.status).toBe('blocked');
      expect(receipt).not.toHaveProperty('carriedFrom');
      expect(receipt.checks[0].id).toBe('carry-plan-matches-served');
    }
    expect(carriedReceipts(null, { served: { sha: served } })).toEqual([]);
  });

  it('judges a run of carried and current steps certified', () => {
    const plan = planFor(['chat'], ['landing']);
    expect(plan.current).toEqual(['landing']);
    const certified = [
      { surface: 'chat', status: 'passed', sha: served, checks: [] },
    ];
    const carried = carriedReceipts(plan, {
      served: { sha: served },
      now: () => at,
    });
    const posted = inLaunchOrder([...certified, ...carried]);
    expect(posted.map(r => r.surface)).not.toContain('landing');
    expect(certificationVerdict(posted, { servedSha: served }).certified).toBe(
      false
    );
    const judged = inLaunchOrder([
      ...posted,
      ...currentStandIns(plan, { sha: served }),
    ]);
    expect(judged.map(r => r.surface)).toEqual([...SURFACE_IDS]);
    expect(certificationVerdict(judged, { servedSha: served })).toMatchObject({
      certified: true,
      notGreen: [],
    });
    const split = verdictSplit(judged, SURFACE_IDS);
    expect(split.design).toEqual(
      expect.arrayContaining(['landing', 'smartlink'])
    );
    expect(currentStandIns(plan, { sha: older })).toEqual([]);
  });
});
