import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadRunnerSourceAttestationFromEnvironment,
  reconcileMissedSummerBottleneckEvents,
} = vi.hoisted(() => ({
  loadRunnerSourceAttestationFromEnvironment: vi.fn(),
  reconcileMissedSummerBottleneckEvents: vi.fn(async () => []),
}));

vi.mock('eve/schedules', () => ({
  defineSchedule: (value: unknown) => value,
}));

vi.mock('../agent/lib/vercel-blob-bottleneck-runtime', () => ({
  createVercelBlobBottleneckDependencies: vi.fn(),
}));

vi.mock('../agent/lib/summer-bottleneck-loop', () => ({
  reconcileMissedSummerBottleneckEvents,
}));

vi.mock('../agent/lib/summer-gem-dark-recovery', async () => {
  const actual = await vi.importActual<
    typeof import('../agent/lib/summer-gem-dark-recovery')
  >('../agent/lib/summer-gem-dark-recovery');
  return {
    ...actual,
    loadRunnerSourceAttestationFromEnvironment,
  };
});

type Store = {
  create: (pathname: string, record: unknown) => Promise<'created' | 'exists'>;
  read: (pathname: string) => Promise<unknown>;
  list: () => Promise<{
    entries: unknown[];
    hasMore: boolean;
    scanned: number;
  }>;
  write: (pathname: string, record: unknown) => Promise<void>;
};

describe('Summer bottleneck heartbeat — JOV-6163 attestation bridge', () => {
  beforeEach(() => {
    loadRunnerSourceAttestationFromEnvironment.mockReset();
    reconcileMissedSummerBottleneckEvents.mockClear();
    delete process.env.SUMMER_GEM_DARK;
    delete process.env.CURSOR_API_KEY;
    delete process.env.SUMMER_RUNNER_SOURCE_ATTESTATION_JSON;
    delete process.env.SUMMER_RUNNER_SOURCE_ATTESTATION_PATH;
  });

  function dependencies() {
    const records = new Map<string, unknown>();
    const store: Store = {
      async create(pathname, record) {
        if (records.has(pathname)) return 'exists';
        records.set(pathname, record);
        return 'created';
      },
      async read(pathname) {
        return records.get(pathname) ?? null;
      },
      async list() {
        return { entries: [], hasMore: false, scanned: 0 };
      },
      async write(pathname, record) {
        records.set(pathname, record);
      },
    };
    return {
      dispatchToSymphony: vi.fn(async () => ({ handle: 'h1' })),
      now: () => new Date('2026-09-12T17:00:00.000Z'),
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'unused',
      })),
      producerVerificationKeys: new Map<string, string>(),
      receiptSigningKey: 'r'.repeat(64),
      receiptSigningKeyId: 'eve-receipts-2026-09',
      store,
    };
  }

  it('skips Cursor outbox when attestation is fresh (symphony remains authoritative)', async () => {
    loadRunnerSourceAttestationFromEnvironment.mockResolvedValue({
      schema: 'gem-service-attestation/v1',
      sourceRevision: 'a'.repeat(40),
      // Relative to wall clock so the ≤600s gate stays meaningful in CI.
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      active: true,
      healthy: true,
      listener: { port: 4041, boundToService: true },
    });

    const { runSummerBottleneckHeartbeat } = await import(
      '../agent/schedules/summer-bottleneck-heartbeat'
    );
    const result = await runSummerBottleneckHeartbeat(dependencies() as never);

    expect(result.gemDarkTrigger).toMatchObject({
      dark: false,
      reason: 'attestation-fresh',
    });
    expect(result.governedDispatch.outcome).toBe('symphony-route');
    expect(result.gemDarkRecovery).toEqual({
      status: 'skipped',
      reason: 'gem-live',
    });
  });

  it('opens Cursor outbox when attestation is unavailable (Gem-independent recovery)', async () => {
    loadRunnerSourceAttestationFromEnvironment.mockResolvedValue(null);

    const { runSummerBottleneckHeartbeat } = await import(
      '../agent/schedules/summer-bottleneck-heartbeat'
    );
    const result = await runSummerBottleneckHeartbeat(dependencies() as never);

    expect(result.gemDarkTrigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });
    expect(result.governedDispatch.outcome).toBe('cursor-recovery-request');
    if (result.governedDispatch.outcome === 'cursor-recovery-request') {
      expect(result.governedDispatch.route.selectedRoute.tuple.provider).toBe(
        'cursor-cloud'
      );
      expect(
        result.governedDispatch.route.selectedRoute.tuple.provider
      ).not.toBe('gem');
    }
    expect(result.gemDarkRecovery.status).toBe('outbox-ready');
    if (result.gemDarkRecovery.status !== 'outbox-ready') return;
    expect(result.gemDarkRecovery.outbox.destination).toBe('cursor-cloud');
    expect(
      result.gemDarkRecovery.outbox.route.selectedRoute.tuple.provider
    ).not.toBe('gem');
    expect(result.gemDarkRecovery.report.isolatedRecoveryAdmitted).toBe(true);
    expect(result.gemDarkRecovery.report.remainingHumanDecision).toMatch(
      /Review|approve/i
    );
  });

  it('does not spend Cursor when no attestation probe is configured', async () => {
    loadRunnerSourceAttestationFromEnvironment.mockResolvedValue(undefined);

    const { runSummerBottleneckHeartbeat } = await import(
      '../agent/schedules/summer-bottleneck-heartbeat'
    );
    const result = await runSummerBottleneckHeartbeat(dependencies() as never);

    expect(result.gemDarkTrigger).toMatchObject({
      dark: false,
      reason: 'unknown-fail-closed',
    });
    expect(result.governedDispatch.outcome).toBe('hold');
    expect(result.gemDarkRecovery).toEqual({
      status: 'skipped',
      reason: 'gem-live',
    });
  });
});
