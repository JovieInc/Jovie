import { describe, expect, it } from 'vitest';
import {
  deliverReport,
  pickRankedSloIntake,
  rankSloIntakeCandidates,
  sloFingerprint,
} from '../../shipping-slo-intake.mjs';
import { fakeLinear } from './fixtures/shipping-slo-fake-linear.mjs';

describe('ranked shipping SLO intake', () => {
  const repo = 'JovieInc/Jovie';
  const makeState = () => ({
    owner: {
      id: 'slo-parent',
      assignee: { id: 'slo-owner' },
      team: {
        id: 'jovie-team',
        states: { nodes: [{ id: 'triage-state', type: 'triage' }] },
      },
    },
    issues: [],
    calls: [],
    failure: null,
  });
  const report = (metric = 'lead_time.devin.p95') => ({
    evaluation: {
      regressions: [
        { key: metric, baseline: 100, observed: 130, changeFraction: 0.3 },
      ],
      flatStall: false,
    },
    sampled: { ciRuns: 1, mergedPrs: 0 },
    offenders: { slowestPrs: [], slowestCiRuns: [] },
  });
  const run = (state, id = 'oct05', input = report()) =>
    deliverReport(input, {
      repo,
      runUrl: `https://github.com/${repo}/actions/runs/${id}`,
      apiKey: 'slo-test-key',
      fetchImpl: fakeLinear(state),
    });

  it('ranks by |changeFraction| and sticks to an open lower-ranked metric', () => {
    const ranked = rankSloIntakeCandidates({
      evaluation: {
        regressions: [
          {
            key: 'merge_queue.wait.p95',
            baseline: 100,
            observed: 150,
            changeFraction: 0.5,
          },
          {
            key: 'merge_queue.ejection_rate',
            baseline: 0.2,
            observed: 0.5,
            changeFraction: 1.5,
          },
          {
            key: 'ci_walltime.pull_request.p95',
            baseline: 100,
            observed: 130,
            changeFraction: 0.3,
          },
        ],
        flatStall: true,
      },
    });
    expect(ranked.map(r => r.metric)).toEqual([
      'merge_queue.ejection_rate',
      'merge_queue.wait.p95',
      'ci_walltime.pull_request.p95',
      'throughput.growth_flat',
    ]);
    expect(pickRankedSloIntake(ranked).target.metric).toBe(
      'merge_queue.ejection_rate'
    );
    expect(
      pickRankedSloIntake(ranked, {
        openMetrics: ['merge_queue.wait.p95'],
      }).mode
    ).toBe('sticky');
    expect(
      pickRankedSloIntake(ranked, {
        openMetrics: ['merge_queue.wait.p95'],
      }).target.metric
    ).toBe('merge_queue.wait.p95');
  });

  it('files exactly one ranked issue across many regressions and flat growth', async () => {
    const state = makeState();
    const input = report();
    input.evaluation.regressions = [
      {
        key: 'lead_time.devin.p95',
        baseline: 100,
        observed: 130,
        changeFraction: 0.3,
      },
      {
        key: 'lead_time.codex.p95',
        baseline: 100,
        observed: 180,
        changeFraction: 0.8,
      },
      {
        key: 'remediation.main_red_to_green.p95',
        baseline: 100,
        observed: 130,
        changeFraction: 0.3,
      },
      {
        key: 'throughput.verified_per_day',
        baseline: 100,
        observed: 70,
        changeFraction: -0.3,
      },
    ];
    input.evaluation.flatStall = true;
    const first = await run(state, 'oct05', input);
    expect(first.mode).toBe('ranked-one');
    expect(first.selection).toMatchObject({
      metric: 'lead_time.codex.p95',
      mode: 'top',
    });
    expect(first.findings).toHaveLength(1);
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].description).toContain('## Required `## Win`');
    expect(state.issues[0].description).toContain('## Win');
    expect(state.issues[0].description).toContain(
      sloFingerprint(repo, 'lead_time.codex.p95')
    );
    await run(state, 'oct07', input);
    await run(state, 'oct07', input);
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].comments).toHaveLength(1);
    expect(state.issues[0].title).toContain('lead_time.codex.p95');
  });

  it('sticks to the open ranked issue when a worse regression appears', async () => {
    const state = makeState();
    const mild = report('merge_queue.wait.p95');
    mild.evaluation.regressions[0].changeFraction = 0.25;
    await run(state, 'oct05', mild);
    expect(state.issues).toHaveLength(1);
    const worse = report('merge_queue.wait.p95');
    worse.evaluation.regressions = [
      {
        key: 'merge_queue.wait.p95',
        baseline: 100,
        observed: 125,
        changeFraction: 0.25,
      },
      {
        key: 'merge_queue.ejection_rate',
        baseline: 0.2,
        observed: 0.74,
        changeFraction: 2.7,
      },
    ];
    const sticky = await run(state, 'oct07', worse);
    expect(sticky.selection).toMatchObject({
      metric: 'merge_queue.wait.p95',
      mode: 'sticky',
    });
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].title).toContain('merge_queue.wait.p95');
  });

  it('re-ranks to the new top after the previous ranked issue is completed', async () => {
    const state = makeState();
    const mild = report('merge_queue.wait.p95');
    mild.evaluation.regressions[0].changeFraction = 0.25;
    await run(state, 'oct05', mild);
    state.issues[0].state.type = 'completed';
    const worse = report('merge_queue.wait.p95');
    worse.evaluation.regressions = [
      {
        key: 'merge_queue.wait.p95',
        baseline: 100,
        observed: 125,
        changeFraction: 0.25,
      },
      {
        key: 'merge_queue.ejection_rate',
        baseline: 0.2,
        observed: 0.74,
        changeFraction: 2.7,
      },
    ];
    const next = await run(state, 'oct08', worse);
    expect(next.selection).toMatchObject({
      metric: 'merge_queue.ejection_rate',
      mode: 'top',
    });
    expect(state.issues).toHaveLength(2);
    expect(state.issues[1].title).toContain('merge_queue.ejection_rate');
  });
});
