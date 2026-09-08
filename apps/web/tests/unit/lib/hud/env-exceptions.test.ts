import { describe, expect, it } from 'vitest';
import {
  buildHudEnvExceptionsPayload,
  getHudEnvExceptions,
} from '@/lib/hud/env-exceptions.server';

const NOW = new Date('2026-09-04T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function admission(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'jovie-preview-env-admission/v1',
    kind: 'vercel-preview',
    workId: 'JOV-5941',
    sha: 'abcdef1234567890abcdef1234567890abcdef12',
    policy: 'manual-dispatch',
    reason: 'Hosted proof that CI cannot produce.',
    requiredEvidence: 'Authenticated smoke against the preview deployment.',
    owner: 'dispatching engineer (github.actor)',
    surface: 'Vercel preview deployment of @jovie/web',
    createdAt: '2026-09-03T22:00:00.000Z',
    expiresAt: '2026-09-04T02:00:00.000Z',
    cleanupTrigger: 'vercel-preview-cleanup on pull_request closed',
    cleanupProof: null,
    costBudget: 'One Vercel preview build plus one deployment',
    environment: 'preview',
    ...overrides,
  };
}

function entry(
  overrides: Record<string, unknown> = {},
  admissionOverrides: Record<string, unknown> = {}
) {
  return {
    id: 'exc-1',
    cleanupState: 'admitted',
    admission: admission(admissionOverrides),
    ...overrides,
  };
}

function payload(activeExceptions: unknown[], now: Date = NOW) {
  return buildHudEnvExceptionsPayload(
    {
      schema: 'jovie-preview-env-exceptions/v1',
      updatedBy: 'JOV-5941',
      lanes: [],
      activeExceptions,
    },
    now
  );
}

describe('buildHudEnvExceptionsPayload', () => {
  it('returns an empty activeExceptions list with passthrough fields', () => {
    const result = payload([]);
    expect(result.schema).toBe('jovie-preview-env-exceptions/v1');
    expect(result.updatedBy).toBe('JOV-5941');
    expect(result.activeExceptions).toEqual([]);
    expect(result.lanes).toEqual([]);
  });

  it('marks a live admitted exception as evidence with correct age math', () => {
    const result = payload([entry()]);
    expect(result.activeExceptions).toHaveLength(1);
    const exception = result.activeExceptions[0];
    expect(exception).toBeDefined();
    expect(exception?.kind).toBe('vercel-preview');
    expect(exception?.workId).toBe('JOV-5941');
    expect(exception?.sha).toBe('abcdef1234567890abcdef1234567890abcdef12');
    expect(exception?.ageMs).toBe(2 * HOUR_MS);
    expect(exception?.expiresInMs).toBe(2 * HOUR_MS);
    expect(exception?.expired).toBe(false);
    expect(exception?.countsAsEvidence).toBe(true);
    expect(exception?.cleanupState).toBe('admitted');
    expect(exception?.blocker).toBe(false);
    expect(exception?.blockerReason).toBeNull();
    expect(exception?.requiredEvidence).toBe(
      'Authenticated smoke against the preview deployment.'
    );
    expect(exception?.environment).toBe('preview');
    expect(exception?.costBudget).toBe(
      'One Vercel preview build plus one deployment'
    );
  });

  it('flags an expired exception as a non-evidence blocker', () => {
    const result = payload([
      entry({}, { expiresAt: '2026-09-03T23:00:00.000Z' }),
    ]);
    const exception = result.activeExceptions[0];
    expect(exception?.expired).toBe(true);
    expect(exception?.countsAsEvidence).toBe(false);
    expect(exception?.expiresInMs).toBe(-HOUR_MS);
    expect(exception?.blocker).toBe(true);
    expect(exception?.blockerReason).toContain(
      'dispatching engineer (github.actor)'
    );
    expect(exception?.blockerReason).toContain(
      'vercel-preview-cleanup on pull_request closed'
    );
  });

  it('does not flag an expired exception that was cleaned', () => {
    const result = payload([
      entry(
        { cleanupState: 'cleaned' },
        { expiresAt: '2026-09-03T23:00:00.000Z' }
      ),
    ]);
    const exception = result.activeExceptions[0];
    expect(exception?.expired).toBe(true);
    expect(exception?.countsAsEvidence).toBe(false);
    expect(exception?.blocker).toBe(false);
    expect(exception?.blockerReason).toBeNull();
  });

  it('flags an orphaned exception as a blocker naming owner and cleanup action', () => {
    const result = payload([entry({ cleanupState: 'orphaned' })]);
    const exception = result.activeExceptions[0];
    expect(exception?.cleanupState).toBe('orphaned');
    expect(exception?.blocker).toBe(true);
    expect(exception?.blockerReason).toContain(
      'dispatching engineer (github.actor)'
    );
    expect(exception?.blockerReason).toContain(
      'vercel-preview-cleanup on pull_request closed'
    );
  });

  it('surfaces a malformed entry as a non-evidence blocker without throwing', () => {
    const result = payload([
      { id: 'exc-broken', cleanupState: 'mystery', admission: null },
    ]);
    const exception = result.activeExceptions[0];
    expect(exception?.id).toBe('exc-broken');
    expect(exception?.cleanupState).toBe('unknown');
    expect(exception?.countsAsEvidence).toBe(false);
    expect(exception?.blocker).toBe(true);
    expect(exception?.blockerReason).toContain('exc-broken');
    expect(exception?.ageMs).toBeNull();
    expect(exception?.expiresInMs).toBeNull();
    expect(exception?.expired).toBe(false);
  });

  it('drops malformed lane entries instead of throwing', () => {
    const result = buildHudEnvExceptionsPayload(
      {
        schema: 'jovie-preview-env-exceptions/v1',
        lanes: [{ id: 'ok-lane' }, { broken: true }, null],
        activeExceptions: [],
      },
      NOW
    );
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]?.id).toBe('ok-lane');
  });
});

describe('getHudEnvExceptions', () => {
  it('loads the checked-in projection with lanes and empty active exceptions', () => {
    const result = getHudEnvExceptions(NOW);
    expect(result.schema).toBe('jovie-preview-env-exceptions/v1');
    expect(result.updatedBy).toBe('JOV-5941');
    expect(result.lanes.length).toBeGreaterThan(0);
    expect(result.activeExceptions).toEqual([]);
  });
});
