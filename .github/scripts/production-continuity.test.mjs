import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateContinuity,
  classifyEndpointObservation,
  continuityIncidentKey,
  FRESHNESS_INCIDENT_CLASS,
  FRESHNESS_TARGET_ID,
  forecastBudgetExhaustion,
  observeProductionContinuity,
  observeProductionFreshness,
  parseCliArgs,
  parseTargets,
  planBudgetContinuityAction,
  remediationConclusion,
  runCli,
} from './production-continuity.mjs';

const NOW = new Date('2026-09-13T15:38:12.000Z');
const observation = overrides =>
  classifyEndpointObservation({
    id: 'jovie-production',
    url: 'https://jov.ie/health',
    ...overrides,
  });

describe('production continuity classification', () => {
  it('keeps provider pause, quota, runtime, observer, and healthy states distinct', () => {
    const cases = [
      [
        { status: 503, headers: { 'x-vercel-error': 'DEPLOYMENT_PAUSED' } },
        'deployment-paused',
      ],
      [{ status: 503, body: 'DEPLOYMENT_PAUSED' }, 'deployment-paused'],
      [{ status: 503, body: 'upstream unavailable' }, 'runtime-unavailable'],
      [{ status: 402 }, 'provider-quota-exhausted'],
      [{ error: 'timeout' }, 'observer-unavailable'],
    ];
    for (const [input, expected] of cases) {
      assert.equal(observation(input).incidentClass, expected);
    }
    assert.deepEqual(observation({ status: 200 }), {
      id: 'jovie-production',
      url: 'https://jov.ie/health',
      healthy: true,
      incidentClass: null,
      reason: 'http-200',
      status: 200,
      providerError: null,
    });
    assert.throws(() => classifyEndpointObservation({ status: 200 }));
  });

  it('aggregates only affected targets and builds stable wire-versioned keys', () => {
    const result = aggregateContinuity(
      [
        observation({ status: 200 }),
        classifyEndpointObservation({
          id: 'summer-production',
          url: 'https://summer.jov.ie/health',
          status: 503,
          headers: { 'x-vercel-error': 'DEPLOYMENT_PAUSED' },
        }),
      ],
      { now: NOW }
    );
    assert.equal(result.status, 'unhealthy');
    assert.deepEqual(result.affectedTargets, ['summer-production']);
    assert.deepEqual(result.incidentClasses, ['deployment-paused']);
    assert.equal(result.requiresFounderNotification, true);
    assert.equal(result.requiresAgentIngress, true);
    assert.equal(
      continuityIncidentKey(result),
      'production-continuity:summer-production:deployment-paused'
    );
    assert.equal(
      continuityIncidentKey({
        schema: 'jovie-production-continuity/v1',
        status: 'healthy',
      }),
      'production-continuity:healthy'
    );
    assert.throws(() => aggregateContinuity([]));
    assert.throws(() => continuityIncidentKey({ schema: 'old-wire/v0' }));
  });

  it('isolates a network failure to its target', async () => {
    const result = await observeProductionContinuity({
      fetchImpl: async url => {
        if (url.includes('summer')) throw new Error('network blocked');
        return new Response('{"ok":true}', { status: 200 });
      },
      now: NOW,
      targets: [
        { id: 'jovie-production', url: 'https://jov.ie/health' },
        { id: 'summer-production', url: 'https://summer.jov.ie/health' },
      ],
    });
    assert.equal(result.targets[0].healthy, true);
    assert.equal(result.targets[1].incidentClass, 'observer-unavailable');
  });

  it('accepts only explicit HTTPS CLI targets and writes a deterministic receipt', async () => {
    assert.deepEqual(parseTargets([]), [
      {
        id: 'jovie-production',
        url: 'https://jov.ie/api/health/build-info',
      },
      {
        id: 'summer-production',
        url: 'https://summer.jov.ie/runtime/v1/health',
      },
    ]);
    assert.deepEqual(parseTargets(['summer=https://summer.jov.ie/health']), [
      { id: 'summer', url: 'https://summer.jov.ie/health' },
    ]);
    for (const invalid of [
      ['missing-separator'],
      ['summer=http://summer.jov.ie'],
    ]) {
      assert.throws(() => parseTargets(invalid));
    }
    const argv = [
      '--target',
      'jovie=https://jov.ie/health',
      '--output',
      '/tmp/result.json',
      '--github-output',
      '/tmp/github-output',
    ];
    assert.deepEqual(parseCliArgs(argv), {
      targets: ['jovie=https://jov.ie/health'],
      output: '/tmp/result.json',
      githubOutput: '/tmp/github-output',
    });
    assert.throws(() => parseCliArgs(['--unknown']));
    const writes = [];
    const appends = [];
    const stdout = [];
    // Hermetic: availability-only targets. An ambient GITHUB_REPOSITORY (set in
    // CI) would otherwise enable the freshness probe against the real network.
    const result = await runCli({
      argv,
      env: {},
      fetchImpl: async () => new Response('{"ok":true}', { status: 200 }),
      now: NOW,
      writeFileImpl: async (...args) => writes.push(args),
      appendFileImpl: async (...args) => appends.push(args),
      stdout: { write: value => stdout.push(value) },
    });
    assert.equal(result.incidentKey, 'production-continuity:healthy');
    assert.equal(writes.length, 1);
    assert.match(appends[0][1], /status=healthy/);
    assert.match(stdout[0], /"incidentKey":"production-continuity:healthy"/);
  });
});

describe('budget exhaustion forecast', () => {
  const base = {
    budgetAmountUsd: 10,
    currentSpendUsd: 9,
    priorSpendUsd: 8,
    priorObservedAt: '2026-09-13T14:00:00Z',
    observedAt: '2026-09-13T15:00:00Z',
    now: new Date('2026-09-13T15:05:00Z'),
    forecastHorizonMinutes: 120,
    maximumSnapshotAgeMinutes: 15,
  };

  it('forecasts risk without converting stale, reset, or flat telemetry into authority', () => {
    assert.equal(forecastBudgetExhaustion(base).status, 'at-risk');
    assert.equal(
      forecastBudgetExhaustion({ ...base, currentSpendUsd: 10 }).status,
      'exhausted'
    );
    assert.equal(
      forecastBudgetExhaustion({
        ...base,
        now: new Date('2026-09-13T16:00:00Z'),
      }).status,
      'unknown'
    );
    assert.equal(
      forecastBudgetExhaustion({ ...base, currentSpendUsd: 7 }).reason,
      'budget-cycle-reset-or-meter-drift'
    );
    assert.equal(
      forecastBudgetExhaustion({ ...base, currentSpendUsd: 8 }).status,
      'stable'
    );
    assert.equal(
      forecastBudgetExhaustion({ ...base, forecastHorizonMinutes: 30 }).status,
      'within-budget'
    );
    assert.throws(() =>
      forecastBudgetExhaustion({ ...base, observedAt: 'invalid' })
    );
  });
});

describe('founder-first staged budget policy', () => {
  const base = {
    incidentKey: 'vercel:jovie:2026-09-budget',
    budgetAmountUsd: 10,
    currentSpendUsd: 10.09,
    thresholdPercent: 100,
    productionAtRisk: true,
  };

  it('fails closed until founder timing, authority, containment, and idempotency permit action', () => {
    const cases = [
      [{}, 'founder-ack-window-open', 'contain-and-wait'],
      [
        { acknowledgedByFounder: true },
        'founder-acknowledged',
        'support-founder',
      ],
      [
        { ackWindowExpired: true, spendRateContained: true },
        'emergency-budget-policy-unconfigured',
        'escalate-missing-financial-authority',
      ],
      [
        {
          ackWindowExpired: true,
          approvedEmergencyCeilingUsd: 15,
          maximumStageIncreaseUsd: 2,
          minimumHeadroomUsd: 0.5,
        },
        'spend-source-not-contained',
        'contain-spend-before-budget-change',
      ],
      [
        { ackWindowExpired: true, stageAlreadyApplied: true },
        'stage-idempotency-hold',
        'verify-existing-stage',
      ],
    ];
    for (const [input, reason, action] of cases) {
      const result = planBudgetContinuityAction({ ...base, ...input });
      assert.equal(result.reason, reason);
      assert.equal(result.agentAction, action);
      assert.equal(result.budgetMutationAuthorized, false);
      assert.equal(result.resumeAuthorized, false);
    }
  });

  it('authorizes one bounded stage only inside every founder-approved limit', () => {
    const approved = planBudgetContinuityAction({
      ...base,
      ackWindowExpired: true,
      approvedEmergencyCeilingUsd: 15,
      maximumStageIncreaseUsd: 2,
      minimumHeadroomUsd: 0.5,
      spendRateContained: true,
    });
    assert.equal(approved.reason, 'bounded-emergency-stage-authorized');
    assert.equal(approved.proposedBudgetUsd, 11);
    assert.equal(approved.budgetMutationAuthorized, true);
    assert.equal(approved.resumeAuthorized, true);
    assert.equal(approved.verification.length, 4);
    const insufficient = planBudgetContinuityAction({
      ...base,
      ackWindowExpired: true,
      approvedEmergencyCeilingUsd: 10.5,
      maximumStageIncreaseUsd: 0.5,
      minimumHeadroomUsd: 1,
      spendRateContained: true,
    });
    assert.equal(
      insufficient.reason,
      'approved-stage-cannot-create-required-headroom'
    );
    assert.equal(insufficient.budgetMutationAuthorized, false);

    const alreadyHasHeadroom = planBudgetContinuityAction({
      ...base,
      budgetAmountUsd: 20,
      currentSpendUsd: 10,
      ackWindowExpired: true,
      approvedEmergencyCeilingUsd: 25,
      maximumStageIncreaseUsd: 2,
      minimumHeadroomUsd: 0.5,
      spendRateContained: true,
    });
    assert.equal(alreadyHasHeadroom.proposedBudgetUsd, 20);
    assert.ok(alreadyHasHeadroom.proposedBudgetUsd >= 20);
  });

  it('keeps 50 and 75 percent thresholds alert-only and rejects stale evidence', () => {
    const at = thresholdPercent =>
      planBudgetContinuityAction({
        ...base,
        currentSpendUsd: thresholdPercent / 10,
        thresholdPercent,
        productionAtRisk: false,
      });
    assert.deepEqual(
      [at(50).agentAction, at(75).agentAction],
      ['observe', 'investigate-spend-source']
    );
    assert.equal(at(75).budgetMutationAuthorized, false);
    assert.throws(() =>
      planBudgetContinuityAction({
        ...base,
        incidentKey: '',
        currentSpendUsd: -1,
      })
    );
  });
});

describe('remediation conclusion mapping', () => {
  it('maps healthy, unknown, unhealthy, stale+unknown and a failed observe job', async () => {
    const unknownRow = {
      id: 'f',
      healthy: null,
      reason: 'main-sha-unreadable',
    };
    const staleRow = {
      id: 's',
      healthy: false,
      incidentClass: 'production-stale',
    };
    const ok = observation({ status: 200 });
    const status = rows => aggregateContinuity(rows, { now: NOW }).status;
    const cases = [
      [{ observeResult: 'success', status: status([ok]) }, 'success'],
      [
        { observeResult: 'success', status: status([ok, unknownRow]) },
        'unknown',
      ],
      [{ observeResult: 'success', status: status([ok, staleRow]) }, 'failure'],
      [
        {
          observeResult: 'success',
          status: status([ok, staleRow, unknownRow]),
        },
        'failure',
      ],
      [
        {
          observeResult: 'success',
          status: status([observation({ status: 503 }), unknownRow]),
        },
        'failure',
      ],
      [{ observeResult: 'failure', status: 'healthy' }, 'failure'],
      [{ observeResult: 'cancelled', status: '' }, 'failure'],
      [{ observeResult: 'success', status: '' }, 'unknown'],
      [{ observeResult: 'success', status: undefined }, 'unknown'],
      [{ observeResult: 'success', status: 'surprise' }, 'unknown'],
    ];
    for (const [input, expected] of cases)
      assert.equal(
        remediationConclusion(input),
        expected,
        JSON.stringify(input)
      );
  });
});

describe('production freshness', () => {
  const LIVE = 'c'.repeat(40);
  const MAIN = 'd'.repeat(40);
  // Hex-only fake SHAs (g/h would fail the strict SHA_PATTERN check).
  const RANGE = ['e', 'f', 'a', 'b'].map(
    (char, index) => char.repeat(39) + String(index)
  );
  const freshnessFetch = ({
    liveSha = LIVE,
    mainSha = MAIN,
    aheadBy = 4,
    oldestAt = '2026-09-13T13:00:00Z',
    arrivedAt = oldestAt,
    commitShas = null,
    failCompare = false,
    failLedger = false,
    landingRuns = null,
    rawCommits = undefined,
  } = {}) => {
    const calls = [];
    const json = (body, status = 200) => ({
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: {},
    });
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/build-info')) return json({ commitSha: liveSha });
      if (url.endsWith('/commits/main')) return json({ sha: mainSha });
      if (url.includes('/compare/')) {
        if (failCompare) return json({ message: 'boom' }, 500);
        if (rawCommits !== undefined)
          return json({ ahead_by: aheadBy, commits: rawCommits });
        const shas = commitShas ?? (aheadBy > 0 ? RANGE.slice(0, aheadBy) : []);
        return json({
          status: aheadBy > 0 ? 'ahead' : 'identical',
          ahead_by: aheadBy,
          commits:
            aheadBy > 0
              ? shas.map(sha => ({
                  sha,
                  commit: { committer: oldestAt ? { date: oldestAt } : {} },
                }))
              : [],
        });
      }
      if (url.includes('/actions/workflows/ci.yml/runs')) {
        if (failLedger) return json({ message: 'boom' }, 500);
        const runs =
          landingRuns ??
          (arrivedAt ? [{ head_sha: RANGE[0], created_at: arrivedAt }] : []);
        return json({ total_count: runs.length, workflow_runs: runs });
      }
      return json({}, 404);
    };
    return { calls, fetchImpl };
  };
  const observe = (overrides, options = {}) =>
    observeProductionFreshness({
      fetchImpl: freshnessFetch(overrides).fetchImpl,
      now: NOW,
      repository: 'JovieInc/Jovie',
      token: 'ghs_test',
      ...options,
    });

  it('reports production-stale once main has carried unshipped commits past the bound', async () => {
    const stale = await observe({ oldestAt: '2026-09-13T13:00:00Z' });
    assert.equal(stale.healthy, false);
    assert.equal(stale.incidentClass, FRESHNESS_INCIDENT_CLASS);
    assert.equal(stale.id, FRESHNESS_TARGET_ID);
    assert.equal(stale.unshippedCommits, 4);
    assert.equal(stale.unshippedAgeSeconds, 9492);
    assert.equal(stale.liveSha, LIVE);
    assert.equal(stale.mainSha, MAIN);
    assert.equal(stale.unshippedArrivedAt, '2026-09-13T13:00:00.000Z');

    const fresh = await observe({ oldestAt: '2026-09-13T15:00:00Z' });
    assert.equal(fresh.healthy, true);
    assert.equal(fresh.incidentClass, null);
    assert.match(fresh.reason, /^unshipped-for-2292s-within-5400s$/);
  });

  it('measures release lag from the main landing, not the commit date (JOV-7674 2026-10-25)', async () => {
    // Run 40200688331 paged the founder: the oldest unshipped commit was
    // authored 12:25 but only merged onto main 13:45, so committer-age read
    // a 21-minute release as a 101-minute stall.
    const incident = await observe({
      oldestAt: '2026-09-13T12:25:16Z',
      arrivedAt: '2026-09-13T15:17:12Z',
    });
    assert.equal(incident.healthy, true);
    assert.equal(incident.incidentClass, null);
    assert.equal(incident.reason, 'unshipped-for-1260s-within-5400s');
    assert.equal(incident.unshippedAgeSeconds, 1260);
    assert.equal(incident.oldestUnshippedAt, '2026-09-13T12:25:16Z');
    assert.equal(incident.unshippedArrivedAt, '2026-09-13T15:17:12.000Z');
  });

  it('takes the landing from the push tip when the oldest commit arrived in a batch', async () => {
    // A push that lands several commits only fires a run for its tip, a later
    // commit in the same unshipped range; unreadable entries never count.
    const batched = await observe({
      landingRuns: [
        { head_sha: 'not-a-sha', created_at: '2026-09-13T15:00:00Z' },
        { head_sha: RANGE[2], created_at: 'not-a-date' },
        { head_sha: RANGE[2], created_at: '2026-09-13T14:38:12Z' },
      ],
    });
    assert.equal(batched.healthy, true);
    assert.equal(batched.reason, 'unshipped-for-3600s-within-5400s');
    assert.equal(batched.unshippedAgeSeconds, 3600);
    assert.equal(batched.unshippedArrivedAt, '2026-09-13T14:38:12.000Z');
  });

  it('pages past the ledger horizon when no unshipped landing appears in a ledger spanning the bound', async () => {
    const paged = await observe({
      landingRuns: [
        { head_sha: MAIN, created_at: '2026-09-13T15:00:00Z' },
        { head_sha: MAIN, created_at: '2026-09-13T06:00:00Z' },
      ],
    });
    assert.equal(paged.healthy, false);
    assert.equal(paged.incidentClass, FRESHNESS_INCIDENT_CLASS);
    assert.equal(paged.reason, 'unshipped-past-landing-ledger');
    assert.equal(paged.unshippedAgeSeconds, 34692);
    assert.equal(paged.unshippedArrivedAt, null);
  });

  it('reports unknown when no unshipped landing appears and the ledger is younger than the bound', async () => {
    const shortHorizon = await observe({
      landingRuns: [{ head_sha: MAIN, created_at: '2026-09-13T15:00:00Z' }],
    });
    assert.equal(shortHorizon.healthy, null);
    assert.equal(shortHorizon.reason, 'unshipped-arrival-unreadable');
    const unparseableHorizon = await observe({
      landingRuns: [{ head_sha: MAIN, created_at: 'nope' }],
    });
    assert.equal(unparseableHorizon.healthy, null);
    assert.equal(unparseableHorizon.reason, 'unshipped-arrival-unreadable');
  });

  it('reports unknown when the landing ledger is unreadable', async () => {
    const result = await observe({ failLedger: true });
    assert.equal(result.healthy, null);
    assert.equal(result.reason, 'unshipped-arrival-unreadable');
    assert.equal(result.unshippedCommits, 4);
  });

  it('reports unknown when the unshipped range carries no readable commit shas', async () => {
    const noShas = await observe({ commitShas: [] });
    assert.equal(noShas.healthy, null);
    assert.equal(noShas.reason, 'unshipped-range-unreadable');
    assert.equal(noShas.unshippedCommits, 4);
    const notAList = await observe({ rawCommits: null });
    assert.equal(notAList.healthy, null);
    assert.equal(notAList.reason, 'unshipped-range-unreadable');
  });

  it('treats 90 minutes as the production freshness bound', async () => {
    const within = await observe({ oldestAt: '2026-09-13T14:10:00Z' });
    assert.equal(within.healthy, true);
    assert.match(within.reason, /^unshipped-for-5292s-within-5400s$/);
    const over = await observe({ oldestAt: '2026-09-13T14:07:00Z' });
    assert.equal(over.healthy, false);
    assert.equal(over.incidentClass, FRESHNESS_INCIDENT_CLASS);
    assert.equal(over.unshippedAgeSeconds, 5472);
  });

  it('is healthy when production already carries main', async () => {
    const same = await observe({ mainSha: LIVE });
    assert.deepEqual([same.healthy, same.reason], [true, 'production-current']);
    const zero = await observe({ aheadBy: 0 });
    assert.deepEqual([zero.healthy, zero.reason], [true, 'production-current']);
  });

  it('reports unknown, never healthy, when live, main, or the range is unreadable', async () => {
    const cases = [
      [{ liveSha: 'nope' }, 'live-sha-unreadable'],
      [{ mainSha: '' }, 'main-sha-unreadable'],
      [{ failCompare: true }, 'unshipped-count-unreadable'],
    ];
    for (const [overrides, reason] of cases) {
      const result = await observe(overrides);
      assert.equal(result.healthy, null, reason);
      assert.equal(result.incidentClass, null, reason);
      assert.equal(result.reason, reason);
    }
    const unconfigured = await observeProductionFreshness({
      fetchImpl: async () => {
        throw new Error('must not be called');
      },
      repository: '',
    });
    assert.deepEqual(
      [unconfigured.healthy, unconfigured.reason],
      [true, 'repository-not-configured']
    );
  });

  it('treats a hung upstream as unreadable once the freshness timeout aborts it', async () => {
    const hung = await observeProductionFreshness({
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        }),
      now: NOW,
      repository: 'JovieInc/Jovie',
      timeoutMs: 5,
    });
    assert.deepEqual(
      [hung.healthy, hung.reason],
      [null, 'live-sha-unreadable']
    );
  });

  it('verdicts from the main landing even when the range has no commit date', async () => {
    const result = await observe({
      oldestAt: null,
      arrivedAt: '2026-09-13T13:00:00Z',
    });
    assert.equal(result.healthy, false);
    assert.equal(result.incidentClass, FRESHNESS_INCIDENT_CLASS);
    assert.equal(result.reason, 'unshipped-for-9492s');
    assert.equal(result.unshippedCommits, 4);
    assert.equal(result.oldestUnshippedAt, null);
    assert.equal(result.unshippedArrivedAt, '2026-09-13T13:00:00.000Z');
  });

  it('sends the GitHub token only to GitHub and never to production', async () => {
    const { calls, fetchImpl } = freshnessFetch();
    await observeProductionFreshness({
      fetchImpl,
      now: NOW,
      repository: 'JovieInc/Jovie',
      token: 'ghs_test',
    });
    for (const call of calls) {
      const authorized = Boolean(call.init?.headers?.Authorization);
      assert.equal(
        authorized,
        call.url.startsWith('https://api.github.com/'),
        call.url
      );
    }
  });

  it('pages the founder for a stale production without admitting provider recovery', async () => {
    const stale = await observe({});
    const staleOnly = aggregateContinuity(
      [observation({ status: 200 }), stale],
      {
        now: NOW,
      }
    );
    assert.equal(staleOnly.status, 'unhealthy');
    assert.deepEqual(staleOnly.incidentClasses, [FRESHNESS_INCIDENT_CLASS]);
    assert.equal(staleOnly.requiresFounderNotification, true);
    assert.equal(staleOnly.requiresAgentIngress, false);

    const paused = aggregateContinuity(
      [
        observation({
          status: 503,
          headers: { 'x-vercel-error': 'DEPLOYMENT_PAUSED' },
        }),
        stale,
      ],
      { now: NOW }
    );
    assert.equal(paused.requiresAgentIngress, true);
  });

  it('rolls unknown freshness up as unknown, not healthy, with an explicit unknownTargets list', async () => {
    const unknown = await observe({ mainSha: '' });
    const rollup = aggregateContinuity(
      [
        observation({ status: 200 }),
        observation({ id: 'summer-production', status: 200 }),
        unknown,
      ],
      { now: NOW }
    );
    assert.equal(rollup.status, 'unknown');
    assert.deepEqual(rollup.unknownTargets, [FRESHNESS_TARGET_ID]);
    assert.deepEqual(rollup.unknownReasons, ['main-sha-unreadable']);
    assert.deepEqual(rollup.affectedTargets, []);
    assert.equal(rollup.requiresFounderNotification, false);
    assert.equal(rollup.requiresAgentIngress, false);
    assert.equal(
      continuityIncidentKey(rollup),
      'production-continuity:unknown:jovie-production-freshness'
    );
    const healthy = aggregateContinuity(
      [observation({ status: 200 }), await observe({ mainSha: LIVE })],
      { now: NOW }
    );
    assert.equal(healthy.status, 'healthy');
    assert.deepEqual(healthy.unknownTargets, []);
  });

  it('lets a verified stale or unavailable result outrank an unknown one', async () => {
    const unknown = await observe({ mainSha: '' });
    const stale = await observe({});
    const staleAndUnknown = aggregateContinuity(
      [
        observation({ status: 200 }),
        { ...unknown, id: 'other-freshness' },
        stale,
      ],
      { now: NOW }
    );
    assert.equal(staleAndUnknown.status, 'unhealthy');
    assert.deepEqual(staleAndUnknown.affectedTargets, [FRESHNESS_TARGET_ID]);
    assert.deepEqual(staleAndUnknown.unknownTargets, ['other-freshness']);
    const unavailableAndUnknown = aggregateContinuity(
      [observation({ status: 503 }), unknown],
      { now: NOW }
    );
    assert.equal(unavailableAndUnknown.status, 'unhealthy');
    assert.deepEqual(unavailableAndUnknown.unknownTargets, [
      FRESHNESS_TARGET_ID,
    ]);
  });

  it('never reports HTTP 200 with a null mainSha as healthy (run 40070879025 replay)', () => {
    // Observed JSON from run 40070879025 job 120803832280 (2026-10-24T06:37:10Z),
    // which logged status=healthy and then resolved JOV-7674.
    const observed = {
      schema: 'jovie-production-continuity/v1',
      observedAt: '2026-10-24T06:37:10.710Z',
      status: 'healthy',
      targets: [
        {
          id: 'jovie-production',
          url: 'https://jov.ie/api/health/build-info',
          healthy: true,
          incidentClass: null,
          reason: 'http-200',
          status: 200,
          providerError: null,
        },
        {
          id: 'summer-production',
          url: 'https://summer.jov.ie/runtime/v1/health',
          healthy: true,
          incidentClass: null,
          reason: 'http-200',
          status: 200,
          providerError: null,
        },
        {
          id: 'jovie-production-freshness',
          url: 'https://jov.ie/api/health/build-info',
          healthy: true,
          incidentClass: null,
          status: null,
          providerError: null,
          liveSha: 'd1a37ae5b264f90585a572a9324dc3f3b78efa8b',
          mainSha: null,
          unshippedCommits: 0,
          oldestUnshippedAt: null,
          unshippedAgeSeconds: 0,
          reason: 'main-sha-unreadable',
        },
      ],
    };
    // Old producer behavior: the freshness row was healthy:true and the rollup healthy.
    assert.equal(observed.status, 'healthy');
    // Same live inputs through the current producer: both endpoints 200, main unreadable.
    const json = body => ({
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: {},
    });
    return observeProductionContinuity({
      fetchImpl: async url => {
        if (url.endsWith('/commits/main'))
          return {
            status: 403,
            json: async () => ({}),
            text: async () => '',
            headers: {},
          };
        if (url.endsWith('/runtime/v1/health')) return json({ ok: true });
        return json({ commitSha: observed.targets[2].liveSha });
      },
      freshness: { repository: 'JovieInc/Jovie', token: 'ghs_test' },
      now: new Date(observed.observedAt),
    }).then(result => {
      assert.equal(result.targets[0].healthy, true);
      assert.equal(result.targets[1].healthy, true);
      assert.equal(result.targets[2].healthy, null);
      assert.equal(result.targets[2].mainSha, null);
      assert.equal(result.status, 'unknown');
      assert.notEqual(result.status, 'healthy');
      assert.deepEqual(result.unknownTargets, [FRESHNESS_TARGET_ID]);
    });
  });

  it('keys the CLI receipt as unknown when a repository is set but SHAs are unreadable', async () => {
    const result = await runCli({
      appendFileImpl: async () => {},
      argv: [],
      env: { GITHUB_REPOSITORY: 'JovieInc/Jovie' },
      // Endpoints answer 200 with no commitSha; GitHub answers 404.
      fetchImpl: async url => ({
        status: url.startsWith('https://api.github.com/') ? 404 : 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: {},
      }),
      now: NOW,
      stdout: { write() {} },
      writeFileImpl: async () => {},
    });
    assert.equal(result.status, 'unknown');
    assert.equal(
      result.incidentKey,
      'production-continuity:unknown:jovie-production-freshness'
    );
  });

  it('accepts only a finite non-negative integer ahead_by (table-driven)', async () => {
    const rawFetch = compare => async url => {
      const json = body => ({
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: {},
      });
      if (url.endsWith('/build-info')) return json({ commitSha: LIVE });
      if (url.endsWith('/commits/main')) return json({ sha: MAIN });
      if (url.includes('/actions/workflows/ci.yml/runs')) {
        return json({
          total_count: 1,
          workflow_runs: [
            {
              head_sha: compare.commits?.[0]?.sha,
              created_at: compare.commits?.[0]?.commit?.committer?.date,
            },
          ],
        });
      }
      return json(compare);
    };
    const commits = [
      {
        sha: RANGE[0],
        commit: { committer: { date: '2026-09-13T13:00:00Z' } },
      },
    ];
    const run = ahead => {
      const compare = { commits };
      if (ahead !== undefined) compare.ahead_by = ahead;
      return observeProductionFreshness({
        fetchImpl: rawFetch(compare),
        now: NOW,
        repository: 'JovieInc/Jovie',
      });
    };
    const malformed = [
      null,
      '',
      false,
      undefined,
      '3',
      -1,
      1.5,
      Number.NaN,
      'abc',
      true,
      [],
      {},
      Number.POSITIVE_INFINITY,
    ];
    for (const value of malformed) {
      const result = await run(value);
      assert.equal(result.healthy, null, String(value));
      assert.equal(result.reason, 'unshipped-count-unreadable', String(value));
      assert.equal(result.incidentClass, null, String(value));
    }
    const current = await observeProductionFreshness({
      fetchImpl: rawFetch({ ahead_by: 0, commits: [] }),
      now: NOW,
      repository: 'JovieInc/Jovie',
    });
    assert.deepEqual(
      [current.healthy, current.reason],
      [true, 'production-current']
    );
    const stale = await run(4);
    assert.deepEqual(
      [stale.healthy, stale.incidentClass],
      [false, FRESHNESS_INCIDENT_CLASS]
    );
    const fresh = await observeProductionFreshness({
      fetchImpl: rawFetch({
        ahead_by: 4,
        commits: [
          {
            sha: RANGE[0],
            commit: { committer: { date: '2026-09-13T15:00:00Z' } },
          },
        ],
      }),
      now: NOW,
      repository: 'JovieInc/Jovie',
    });
    assert.deepEqual(
      [fresh.healthy, fresh.reason],
      [true, 'unshipped-for-2292s-within-5400s']
    );
  });

  it('treats non-string SHAs as unknown and non-string commit dates as display-only', async () => {
    const make = ({
      live = LIVE,
      main = MAIN,
      date = '2026-09-13T13:00:00Z',
    }) =>
      observeProductionFreshness({
        fetchImpl: async url => {
          const json = body => ({
            status: 200,
            json: async () => body,
            text: async () => '',
            headers: {},
          });
          if (url.endsWith('/build-info')) return json({ commitSha: live });
          if (url.endsWith('/commits/main')) return json({ sha: main });
          if (url.includes('/actions/workflows/ci.yml/runs')) {
            return json({
              total_count: 1,
              workflow_runs: [
                {
                  head_sha: RANGE[0],
                  created_at: '2026-09-13T13:00:00Z',
                },
              ],
            });
          }
          return json({
            ahead_by: 2,
            commits: [{ sha: RANGE[0], commit: { committer: { date } } }],
          });
        },
        now: NOW,
        repository: 'JovieInc/Jovie',
      });
    for (const [input, reason] of [
      [{ live: [LIVE] }, 'live-sha-unreadable'],
      [{ main: [MAIN] }, 'main-sha-unreadable'],
    ]) {
      const result = await make(input);
      assert.deepEqual([result.healthy, result.reason], [null, reason], reason);
    }
    for (const input of [
      { date: 0 },
      { date: 1757768400000 },
      { date: 'not-a-date' },
    ]) {
      const result = await make(input);
      assert.deepEqual(
        [result.healthy, result.incidentClass],
        [false, FRESHNESS_INCIDENT_CLASS],
        String(input.date)
      );
      assert.equal(
        result.oldestUnshippedAt,
        typeof input.date === 'string' ? input.date : null,
        String(input.date)
      );
      assert.equal(
        result.unshippedArrivedAt,
        '2026-09-13T13:00:00.000Z',
        String(input.date)
      );
    }
  });

  it('includes freshness in the CLI only when a repository is configured', async () => {
    const { fetchImpl } = freshnessFetch({ oldestAt: '2026-09-13T13:00:00Z' });
    const outputs = [];
    const result = await runCli({
      appendFileImpl: async (_path, text) => outputs.push(text),
      argv: ['--github-output', '/dev/null'],
      env: { GITHUB_REPOSITORY: 'JovieInc/Jovie', GH_TOKEN: 'ghs_test' },
      fetchImpl: async (url, init) => {
        if (
          url.endsWith('/runtime/v1/health') ||
          url === 'https://jov.ie/api/health/build-info'
        ) {
          return {
            status: 200,
            text: async () => '{"commitSha":"' + LIVE + '"}',
            json: async () => ({ commitSha: LIVE }),
            headers: {},
          };
        }
        return fetchImpl(url, init);
      },
      now: NOW,
      stdout: { write() {} },
      writeFileImpl: async () => {},
    });
    assert.equal(result.status, 'unhealthy');
    assert.deepEqual(result.affectedTargets, [FRESHNESS_TARGET_ID]);
    assert.match(outputs.join(''), /requires_agent_ingress=false/);

    const without = await runCli({
      appendFileImpl: async () => {},
      argv: [],
      env: {},
      fetchImpl: async () => ({
        status: 200,
        text: async () => 'ok',
        json: async () => ({}),
        headers: {},
      }),
      now: NOW,
      stdout: { write() {} },
      writeFileImpl: async () => {},
    });
    assert.equal(
      without.targets.some(t => t.id === FRESHNESS_TARGET_ID),
      false
    );
  });
});
