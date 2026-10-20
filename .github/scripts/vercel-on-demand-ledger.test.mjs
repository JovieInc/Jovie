import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildCostUsd,
  computeLedger,
  decide,
  loadPolicy,
  renderLedger,
  runCli,
  runLedger,
} from './vercel-on-demand-ledger.mjs';

const policy = loadPolicy();
const DAY = 86_400_000;
const periodStart = Date.parse('2026-10-14T07:00:00Z');
const period = { start: periodStart, end: Date.parse('2026-11-14T08:00:00Z') };
const pinned = {
  resourceConfig: {
    buildMachineType: 'standard',
    buildMachineSelection: 'fixed',
    elasticConcurrencyEnabled: false,
  },
};
const build = (at, minutes = 0.7, extra = {}) => ({
  projectId: policy.projectId,
  buildingAt: at,
  ready: at + minutes * 60_000,
  ...extra,
});
// N one-minute Standard builds = N x 4 vCPU x $0.0035 = N x $0.014.
const builds = (n, from, spacingMs) =>
  Array.from({ length: n }, (_, i) => build(from + i * spacingMs));

describe('vercel on-demand hard cap', () => {
  it('ships the authorized policy: Standard, cutoff $8 under a $10 cap, alert $5', () => {
    assert.equal(policy.buildMachineType, 'standard');
    assert.equal(policy.buildMachineSelection, 'fixed');
    assert.equal(policy.vcpu, 4);
    assert.equal(policy.hardCapUsd, 10);
    assert.equal(policy.cutoffUsd, 8);
    assert.equal(policy.alertUsd, 5);
    const dir = mkdtempSync(join(tmpdir(), 'policy-'));
    for (const bad of [
      { ...policy, cutoffUsd: 10 },
      { ...policy, buildMachineType: 'elastic' },
      { ...policy, alertUsd: 9 },
      { ...policy, schema: 'x' },
    ]) {
      writeFileSync(join(dir, 'p.json'), JSON.stringify(bad));
      assert.throws(() => loadPolicy(join(dir, 'p.json')), /invalid/);
    }
  });

  it('bills whole minutes x 4 vCPU x $0.0035, and skips builds that never started', () => {
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
    near(buildCostUsd(build(1000, 0.6), policy), 0.014);
    near(buildCostUsd(build(1000, 2.5), policy), 3 * 0.014);
    assert.equal(buildCostUsd({ buildingAt: 0 }, policy), 0);
    near(buildCostUsd({ buildingAt: 1000 }, policy, 1000 + 90_000), 0.028);
  });

  it('cuts on-demand off once actual spend reaches $8', () => {
    const enabledAt = Date.parse(policy.enabledAt);
    const now = enabledAt + 20 * DAY;
    // 572 builds x $0.014 = $8.008 actual.
    const deployments = builds(572, enabledAt + DAY, (18 * DAY) / 572);
    const ledger = computeLedger({ deployments, policy, period, now });
    assert.ok(ledger.actualUsd >= 8, JSON.stringify(ledger));
    assert.deepEqual(decide({ ledger, policy, project: pinned }), {
      enabled: false,
      reason: 'cutoff-actual',
      alert: true,
    });
    // One build fewer stays at $7.994 actual but projects past $8 too.
    const below = computeLedger({
      deployments: deployments.slice(1),
      policy,
      period,
      now,
    });
    assert.ok(below.actualUsd < 8);
    assert.equal(
      decide({ ledger: below, policy, project: pinned }).reason,
      'cutoff-projected'
    );
  });

  it('cuts off on projection before the money is spent, and alerts at $5', () => {
    const enabledAt = Date.parse(policy.enabledAt);
    const now = enabledAt + 3 * DAY;
    // 100 builds/day for 3 days = $4.20 actual, ~$37 projected.
    const burst = computeLedger({
      deployments: builds(300, enabledAt, (3 * DAY) / 300),
      policy,
      period,
      now,
    });
    assert.ok(burst.actualUsd < 5 && burst.projectedUsd >= 8);
    assert.deepEqual(decide({ ledger: burst, policy, project: pinned }), {
      enabled: false,
      reason: 'cutoff-projected',
      alert: true,
    });
    // Measured 2026-10-19/20 rate (14 builds/day) projects to ~$4.8: no alert.
    const normal = computeLedger({
      deployments: builds(42, enabledAt, (3 * DAY) / 42),
      policy,
      period,
      now,
    });
    assert.ok(normal.projectedUsd < 5, JSON.stringify(normal));
    assert.deepEqual(decide({ ledger: normal, policy, project: pinned }), {
      enabled: true,
      reason: 'within-cap',
      alert: false,
    });
    // 20 builds/day projects to ~$6.9: alert, still within the cutoff.
    const busy = computeLedger({
      deployments: builds(60, enabledAt, (3 * DAY) / 60),
      policy,
      period,
      now,
    });
    assert.ok(
      busy.projectedUsd >= 5 && busy.projectedUsd < 8,
      JSON.stringify(busy)
    );
    assert.deepEqual(decide({ ledger: busy, policy, project: pinned }), {
      enabled: true,
      reason: 'within-cap',
      alert: true,
    });
    // A burst in the first hour is damped by the one-day minimum window.
    const firstHour = computeLedger({
      deployments: builds(4, enabledAt, 600_000),
      policy,
      period,
      now: enabledAt + 3_600_000,
    });
    assert.equal(
      decide({ ledger: firstHour, policy, project: pinned }).enabled,
      true
    );
  });

  it("uses Vercel's billed build charges when they exceed the estimate", () => {
    const enabledAt = Date.parse(policy.enabledAt);
    const charges = [
      {
        ServiceName: 'Build CPU Minutes',
        BilledCost: 8.5,
        ChargePeriodEnd: new Date(enabledAt + DAY).toISOString(),
        Tags: { ProjectId: policy.projectId },
      },
      {
        ServiceName: 'Build CPU Minutes',
        BilledCost: 50,
        ChargePeriodEnd: new Date(enabledAt + DAY).toISOString(),
        Tags: { ProjectId: 'prj_docs' },
      },
      {
        ServiceName: 'Fluid Active CPU',
        BilledCost: 50,
        ChargePeriodEnd: new Date(enabledAt + DAY).toISOString(),
        Tags: { ProjectId: policy.projectId },
      },
      {
        ServiceName: 'Build Minutes',
        BilledCost: 9,
        ChargePeriodEnd: new Date(enabledAt - DAY).toISOString(),
        Tags: { ProjectId: policy.projectId },
      },
    ];
    const ledger = computeLedger({
      deployments: [],
      charges,
      policy,
      period,
      now: enabledAt + 2 * DAY,
    });
    assert.equal(ledger.billedUsd, 8.5);
    assert.equal(
      decide({ ledger, policy, project: pinned }).reason,
      'cutoff-actual'
    );
  });

  it('refuses on-demand when the machine is not pinned Standard, spend is unknown, or policy is off', () => {
    const ledger = { actualUsd: 0, projectedUsd: 0 };
    for (const resourceConfig of [
      { buildMachineType: 'turbo', buildMachineSelection: 'fixed' },
      { buildMachineType: 'standard', buildMachineSelection: 'elastic' },
      {},
    ]) {
      assert.equal(
        decide({ ledger, policy, project: { resourceConfig } }).reason,
        'build-machine-not-pinned-standard'
      );
    }
    assert.equal(
      decide({ ledger: null, policy, project: pinned }).reason,
      'spend-unknown'
    );
    assert.equal(
      decide({ ledger, policy: { ...policy, enabled: false }, project: pinned })
        .reason,
      'policy-disabled'
    );
  });

  describe('against the Vercel API', () => {
    const now = Date.parse(policy.enabledAt) + 5 * DAY;
    const api = ({
      deployments,
      charges = '',
      project = pinned,
      failCharges = false,
      ignorePatch = false,
    }) => {
      const calls = [];
      const state = structuredClone(project);
      const fetchImpl = async (url, init = {}) => {
        const u = new URL(url);
        calls.push(`${init.method ?? 'GET'} ${u.pathname}`);
        const ok = body => ({
          ok: true,
          json: async () => body,
          text: async () => body,
        });
        if (u.pathname === `/v9/projects/${policy.projectId}`) {
          if (init.method === 'PATCH' && !ignorePatch) {
            state.resourceConfig = {
              ...state.resourceConfig,
              ...JSON.parse(init.body).resourceConfig,
            };
          }
          return ok(structuredClone(state));
        }
        if (u.pathname.startsWith('/v2/teams/'))
          return ok({ billing: { period } });
        if (u.pathname === '/v6/deployments')
          return ok({ deployments, pagination: {} });
        if (u.pathname === '/v1/billing/charges') {
          return failCharges ? { ok: false, status: 503 } : ok(charges);
        }
        throw new Error(`unexpected ${u.pathname}`);
      };
      return { fetchImpl, calls, state: () => state };
    };

    it('enables on-demand with the one-build-per-branch queue and reads it back', async () => {
      const v = api({
        deployments: builds(20, Date.parse(policy.enabledAt), DAY / 4),
      });
      const result = await runLedger({
        token: 't',
        teamId: 'team_x',
        policy,
        fetchImpl: v.fetchImpl,
        now,
      });
      assert.equal(result.decision.enabled, true);
      assert.equal(result.changed, true);
      assert.equal(v.state().resourceConfig.elasticConcurrencyEnabled, true);
      assert.deepEqual(v.state().resourceConfig.buildQueue, {
        configuration: 'WAIT_FOR_NAMESPACE_QUEUE',
      });
      assert.match(
        renderLedger(result, policy),
        /On-demand: \*\*enabled\*\* \(within-cap\), changed from disabled/
      );
      // Second run is a no-op: no PATCH.
      const again = await runLedger({
        token: 't',
        teamId: 'team_x',
        policy,
        fetchImpl: api({ deployments: [], project: v.state() }).fetchImpl,
        now,
      });
      assert.equal(again.changed, false);
    });

    it('turns on-demand off when the cutoff is crossed or spend cannot be read', async () => {
      const on = {
        resourceConfig: {
          ...pinned.resourceConfig,
          elasticConcurrencyEnabled: true,
        },
      };
      const over = api({
        deployments: builds(600, Date.parse(policy.enabledAt), (4 * DAY) / 600),
        project: on,
      });
      const cut = await runLedger({
        token: 't',
        teamId: 'team_x',
        policy,
        fetchImpl: over.fetchImpl,
        now,
      });
      assert.equal(cut.decision.reason, 'cutoff-actual');
      assert.equal(
        over.state().resourceConfig.elasticConcurrencyEnabled,
        false
      );

      const blind = api({ deployments: [], project: on, failCharges: true });
      const unknown = await runLedger({
        token: 't',
        teamId: 'team_x',
        policy,
        fetchImpl: blind.fetchImpl,
        now,
      });
      assert.equal(unknown.decision.reason, 'spend-unknown');
      assert.match(unknown.error, /Vercel API 503/);
      assert.equal(
        blind.state().resourceConfig.elasticConcurrencyEnabled,
        false
      );
      assert.match(
        renderLedger(unknown, policy),
        /Spend unknown: Vercel API 503/
      );
    });

    it('never fails the release: a write that does not read back is reported, not thrown', async () => {
      const stuck = api({ deployments: [], ignorePatch: true });
      const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
      const env = {
        VERCEL_TOKEN: 't',
        VERCEL_ORG_ID: 'team_x',
        GITHUB_STEP_SUMMARY: join(dir, 's'),
      };
      assert.equal(await runCli({ env, fetchImpl: stuck.fetchImpl }), null);
      assert.equal(await runCli({ env: {} }), null);
      const ok = api({
        deployments: builds(42, Date.parse(policy.enabledAt), DAY / 14),
      });
      const result = await runCli({ env, fetchImpl: ok.fetchImpl });
      assert.equal(result.decision.enabled, true);
    });
  });
});
