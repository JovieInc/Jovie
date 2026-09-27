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
    const result = await runCli({
      argv,
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

describe('production freshness', () => {
  const LIVE = 'c'.repeat(40);
  const MAIN = 'd'.repeat(40);
  const freshnessFetch = ({
    liveSha = LIVE,
    mainSha = MAIN,
    aheadBy = 4,
    oldestAt = '2026-09-13T13:00:00Z',
    failCompare = false,
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
        return json({
          status: aheadBy > 0 ? 'ahead' : 'identical',
          ahead_by: aheadBy,
          commits:
            aheadBy > 0
              ? [{ commit: { committer: oldestAt ? { date: oldestAt } : {} } }]
              : [],
        });
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

    const fresh = await observe({ oldestAt: '2026-09-13T15:00:00Z' });
    assert.equal(fresh.healthy, true);
    assert.equal(fresh.incidentClass, null);
    assert.match(fresh.reason, /^unshipped-for-2292s-within-7200s$/);
  });

  it('is healthy when production already carries main', async () => {
    const same = await observe({ mainSha: LIVE });
    assert.deepEqual([same.healthy, same.reason], [true, 'production-current']);
    const zero = await observe({ aheadBy: 0 });
    assert.deepEqual([zero.healthy, zero.reason], [true, 'production-current']);
  });

  it('fails open with a reason when live, main, or the range is unreadable', async () => {
    const cases = [
      [{ liveSha: 'nope' }, 'live-sha-unreadable'],
      [{ mainSha: '' }, 'main-sha-unreadable'],
      [{ failCompare: true }, 'unshipped-range-unreadable'],
    ];
    for (const [overrides, reason] of cases) {
      const result = await observe(overrides);
      assert.equal(result.healthy, true, reason);
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
      [true, 'live-sha-unreadable']
    );
  });

  it('fails open when the unshipped range has no commit date', async () => {
    const result = await observe({ oldestAt: null });
    assert.equal(result.healthy, true);
    assert.equal(result.reason, 'unshipped-age-unreadable');
    assert.equal(result.unshippedCommits, 4);
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
