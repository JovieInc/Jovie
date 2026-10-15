import { describe, expect, it, vi } from 'vitest';
import {
  evaluateExposure,
  evaluateExposureEvidence,
  runExposureMission,
} from './dogfood-exposure';
import {
  END,
  expectedExposure,
  exposureEvidence,
  observedExposure,
  START,
} from './test-fixtures/dogfood-exposure';

describe.each(['jov', 'lyb'] as const)('%s exposure contract', product => {
  const expected = expectedExposure(product);
  const check = (observation: unknown) =>
    evaluateExposure(expected, observation).status;
  it.each(['human', 'independent-synthetic-agent'])(
    'accepts a bound %s in each product',
    actorRef => {
      const subject = {
        ...expected,
        identity: { ...expected.identity, actorRef },
      };
      expect(
        evaluateExposureEvidence(subject, exposureEvidence(subject), START, END)
          .status
      ).toBe('PASS');
    }
  );
  it.each(['accountRef', 'sessionRef', 'actorRef', 'mode', 'deviceRef'])(
    'rejects switched %s',
    key => {
      const observed = observedExposure(expected);
      expect(
        check({
          ...observed,
          identity: { ...observed.identity, [key]: 'different' },
        })
      ).toBe('BLOCKED_EXPOSURE');
    }
  );
  it.each(['buildId', 'sourceSha', 'backendId', 'environment'])(
    'routes wrong %s to delivery',
    key => {
      const observed = observedExposure(expected);
      const result = evaluateExposure(expected, {
        ...observed,
        artifact: { ...observed.artifact, [key]: 'old' },
      });
      expect(result.status).toBe('BLOCKED_BUILD');
      expect(result.nextAction).toBe('release_owner');
    }
  );
  it.each([false, 'legacy', null, undefined])(
    'rejects false/unset variant %s',
    value => {
      const observed = observedExposure(expected);
      expect(
        check({ ...observed, features: [{ ...observed.features[0], value }] })
      ).not.toBe('PASS');
    }
  );
  it.each([
    'auth',
    'consent',
    'entitlement',
    'dataIsolation',
    'spending',
    'killSwitchClear',
  ])('preserves %s boundaries', key => {
    const observed = observedExposure(expected);
    expect(
      check({
        ...observed,
        boundaries: { ...observed.boundaries, [key]: false },
      })
    ).toBe('BLOCKED_EXPOSURE');
  });
  it.each([
    { generation: 'old' },
    { source: 'unavailable' },
    { online: false },
    { evaluatedAt: '2026-10-14T00:00:00.000Z' },
    { evaluatedAt: END },
  ])('rejects cold/stale/offline configuration %j', change => {
    const observed = observedExposure(expected);
    expect(
      check({
        ...observed,
        configuration: { ...observed.configuration, ...change },
      })
    ).toBe('UNKNOWN_CONFIGURATION');
  });
  it('rejects revoked membership, fixtures, staff control overrides and unquarantined metrics', () => {
    const observed = observedExposure(expected);
    for (const change of [
      { membership: { eligible: false } },
      { fixtureOverride: true },
      { syntheticMetricsQuarantined: false },
    ]) {
      expect(check({ ...observed, ...change })).toBe('BLOCKED_EXPOSURE');
    }
    const control = {
      ...expected,
      identity: { ...expected.identity, mode: 'customer_control' as const },
    };
    expect(
      evaluateExposure(control, {
        ...observedExposure(control),
        staffOverride: true,
      }).status
    ).toBe('BLOCKED_EXPOSURE');
    expect(evaluateExposure(control, observedExposure(control)).status).toBe(
      'PASS'
    );
  });
  it('rejects true flags without visible executed UI, including API substitutes', () => {
    const observed = observedExposure(expected);
    for (const witness of [
      null,
      { ...observed.features[0].witness, visible: false },
      { ...observed.features[0].witness, executed: false },
      { ...observed.features[0].witness, kind: 'capability' },
    ]) {
      expect(
        check({ ...observed, features: [{ ...observed.features[0], witness }] })
      ).toBe('BLOCKED_EXPOSURE');
    }
  });
  it('invalidates changed configuration and even a change reverted before completion', () => {
    const evidence = exposureEvidence(expected);
    expect(
      evaluateExposureEvidence(
        expected,
        { ...evidence, invalidated: true },
        START,
        END
      ).status
    ).toBe('UNKNOWN_CONFIGURATION');
    const changed = {
      ...evidence.observations[1],
      configuration: {
        ...evidence.observations[1].configuration,
        generation: 'next',
      },
    };
    expect(
      evaluateExposureEvidence(
        expected,
        { ...evidence, observations: [evidence.observations[0], changed] },
        START,
        END
      ).status
    ).toBe('UNKNOWN_CONFIGURATION');
  });
});

it('fails a deliberate wrong cohort before mission execution, then repairs and reruns the mission', async () => {
  const expected = expectedExposure();
  let wrongCohort = true;
  const mission = vi.fn().mockResolvedValue('real-mission-result');
  const unsubscribe = vi.fn();
  const adapter = {
    observe: vi.fn(async () => {
      const observed = observedExposure(
        expected,
        mission.mock.calls.length ? END : START
      );
      return wrongCohort
        ? {
            ...observed,
            features: [
              { ...observed.features[0], value: 'legacy', witness: null },
            ],
          }
        : observed;
    }),
    subscribe: () => unsubscribe,
  };
  expect(
    (await runExposureMission(expected, adapter, mission, () => new Date(END)))
      .decision.status
  ).toBe('BLOCKED_EXPOSURE');
  expect(mission).not.toHaveBeenCalled();
  const reconcile = vi.fn(async () => {
    wrongCohort = false;
  });
  const result = await runExposureMission(
    expected,
    { ...adapter, reconcile },
    mission,
    () => new Date(END)
  );
  expect(result.decision.status).toBe('PASS');
  expect(result.result).toBe('real-mission-result');
  expect(mission).toHaveBeenCalledOnce();
  expect(reconcile).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

it('fails soft on unavailable configuration without executing a legacy mission', async () => {
  const mission = vi.fn();
  const result = await runExposureMission(
    expectedExposure(),
    {
      observe: async () => {
        throw new Error('offline');
      },
      subscribe: () => () => {},
    },
    mission
  );
  expect(result.decision.status).toBe('UNKNOWN_CONFIGURATION');
  expect(mission).not.toHaveBeenCalled();
});

it('invalidates mission evidence on account/config/build/cohort/revocation events', async () => {
  let invalidate = () => {};
  const expected = expectedExposure();
  const result = await runExposureMission(
    expected,
    {
      observe: async () => observedExposure(expected),
      subscribe: callback => {
        invalidate = callback;
        return () => {};
      },
    },
    async () => {
      invalidate();
      return 'ran';
    },
    () => new Date(END)
  );
  expect(result.decision.status).toBe('UNKNOWN_CONFIGURATION');
  expect(result.exposure.invalidated).toBe(true);
});

it('rejects malformed, replayed, incomplete and duplicate evidence', () => {
  const expected = expectedExposure();
  const evidence = exposureEvidence(expected);
  for (const malformed of [
    null,
    {},
    { ...evidence, observations: [] },
    { ...evidence, observations: [evidence.observations[0]] },
  ]) {
    expect(
      evaluateExposureEvidence(expected, malformed, START, END).status
    ).toBe('UNKNOWN_CONFIGURATION');
  }
  expect(evaluateExposureEvidence(expected, evidence, END, END).status).toBe(
    'UNKNOWN_CONFIGURATION'
  );
  expect(
    evaluateExposure({ ...expected, features: [] }, observedExposure()).status
  ).toBe('UNKNOWN_CONFIGURATION');
  const observed = observedExposure();
  expect(
    evaluateExposure(expected, {
      ...observed,
      features: [...observed.features, ...observed.features],
    }).status
  ).toBe('UNKNOWN_CONFIGURATION');
});

it('rejects replayed entry snapshots against the actual execution clock', async () => {
  const mission = vi.fn();
  const result = await runExposureMission(
    expectedExposure(),
    {
      observe: async () => observedExposure(),
      subscribe: () => () => {},
    },
    mission,
    () => new Date('2026-10-16T00:00:00.000Z')
  );
  expect(result.decision.status).toBe('UNKNOWN_CONFIGURATION');
  expect(mission).not.toHaveBeenCalled();
});

it('refreshes approved stale cache once and keeps missing UI owned by delivery', async () => {
  const expected = expectedExposure();
  const good = observedExposure(expected);
  const observe = vi
    .fn()
    .mockResolvedValueOnce({
      ...good,
      configuration: {
        ...good.configuration,
        generation: 'old',
        source: 'cache',
      },
    })
    .mockResolvedValueOnce(good)
    .mockResolvedValueOnce(observedExposure(expected, END));
  const reconcile = vi.fn();
  const result = await runExposureMission(
    expected,
    { observe, reconcile, subscribe: () => () => {} },
    async () => 'ran',
    () => new Date(END)
  );
  expect(result.decision.status).toBe('PASS');
  expect(reconcile).toHaveBeenCalledOnce();
  const missingUI = {
    ...good,
    features: [{ ...good.features[0], witness: null }],
  };
  expect(evaluateExposure(expected, missingUI).nextAction).toBe(
    'release_owner'
  );
});
