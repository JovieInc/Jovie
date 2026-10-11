import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_EVIDENCE_STAGES,
  type CapabilityEvidenceRecord,
  type CapabilityObservation,
  deriveCapabilityStage,
} from './capability-evidence-model';

const observation = (
  overrides: Partial<CapabilityObservation> = {}
): CapabilityObservation => ({
  measured: true,
  count: 12,
  latestAt: '2026-10-02',
  stale: false,
  windowDays: 7,
  population: 'test population',
  error: null,
  ...overrides,
});

const baseRecord = (
  overrides: Partial<CapabilityEvidenceRecord> = {}
): Pick<
  CapabilityEvidenceRecord,
  | 'certification'
  | 'deployment'
  | 'rollout'
  | 'clientSha'
  | 'exposure'
  | 'outcome'
> => ({
  certification: {
    state: 'review_ready',
    readiness: 'ready',
    decisionEvidenceDigest: 'a'.repeat(40),
    sourcePath: 'docs/FEATURE_REGISTRY.md',
  },
  deployment: {
    commitSha: 'b'.repeat(40),
    version: '1.2.3',
    environment: 'production',
    deploymentId: 'dpl_1',
  },
  rollout: { gate: null, configuredPercent: null },
  clientSha: null,
  exposure: observation(),
  outcome: observation(),
  ...overrides,
});

describe('deriveCapabilityStage', () => {
  it('covers every declared stage distinctly', () => {
    expect(new Set(CAPABILITY_EVIDENCE_STAGES).size).toBe(
      CAPABILITY_EVIDENCE_STAGES.length
    );
  });

  it('is healthy only when deployment, exposure and outcome are all observed', () => {
    expect(deriveCapabilityStage(baseRecord())).toBe('healthy');
  });

  it('fails closed when any observation read errors', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({ exposure: observation({ error: 'timeout' }) })
      )
    ).toBe('failure');
    expect(
      deriveCapabilityStage(
        baseRecord({ outcome: observation({ error: 'missing relation' }) })
      )
    ).toBe('failure');
  });

  it('is unknown when no certification evidence exists', () => {
    expect(deriveCapabilityStage(baseRecord({ certification: null }))).toBe(
      'unknown'
    );
  });

  it('is merged-only when certified but no deployed build sha is evidenced', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({
          deployment: {
            commitSha: null,
            version: null,
            environment: null,
            deploymentId: null,
          },
        })
      )
    ).toBe('merged-only');
  });

  it('is deployed-only when ungated and deployed but exposure is unmeasured', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({ exposure: observation({ measured: false, count: null }) })
      )
    ).toBe('deployed-only');
  });

  it('is configured-unobserved when a gate exists but nothing is measured', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({
          rollout: {
            gate: 'smartlink_pre_save_campaigns',
            configuredPercent: null,
          },
          exposure: observation({ measured: false, count: null }),
        })
      )
    ).toBe('configured-unobserved');
    expect(
      deriveCapabilityStage(
        baseRecord({ outcome: observation({ measured: false, count: null }) })
      )
    ).toBe('configured-unobserved');
  });

  it('is stale-observation when the newest exposure data lags the window', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({ exposure: observation({ stale: true }) })
      )
    ).toBe('stale-observation');
  });

  it('does not call stale zero-count outcomes healthy', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({
          outcome: observation({ count: 0, latestAt: null, stale: true }),
        })
      )
    ).toBe('stale-observation');
  });

  it('is stale-client when the running client build differs from deployed', () => {
    expect(
      deriveCapabilityStage(baseRecord({ clientSha: 'c'.repeat(40) }))
    ).toBe('stale-client');
    expect(
      deriveCapabilityStage(baseRecord({ clientSha: 'b'.repeat(40) }))
    ).toBe('healthy');
  });

  it('is partial-rollout when configured below 100% with observation', () => {
    expect(
      deriveCapabilityStage(
        baseRecord({
          rollout: { gate: '50% rollout', configuredPercent: 50 },
        })
      )
    ).toBe('partial-rollout');
  });
});
