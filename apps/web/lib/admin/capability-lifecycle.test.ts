import { describe, expect, it } from 'vitest';
import { CAPABILITY_EVIDENCE_FIXTURE as record } from './capability-evidence-fixtures';
import { capabilityLifecycleStages } from './capability-evidence-model';

const states = (input: typeof record) =>
  Object.fromEntries(
    capabilityLifecycleStages(input).map(stage => [stage.id, stage.state])
  );

describe('capabilityLifecycleStages', () => {
  it('returns the seven stages in lifecycle order, each with a reading', () => {
    const stages = capabilityLifecycleStages(record);
    expect(stages.map(stage => stage.label)).toEqual([
      'Desired',
      'Built',
      'Certified',
      'Deployed',
      'Exposed',
      'Observed',
      'Healthy',
    ]);
    for (const stage of stages) {
      expect(stage.value).not.toMatch(/^(n\/a|—|-)?$/i);
      expect(stage.evidence.length).toBeGreaterThan(0);
    }
  });

  it('marks stages unknown, never done, when the registry was not read', () => {
    expect(states({ ...record, certification: null })).toMatchObject({
      desired: 'unknown',
      built: 'unknown',
      certified: 'unknown',
    });
  });

  it('fails a stage whose source errored and the healthy verdict with it', () => {
    const result = states({
      ...record,
      exposure: { ...record.exposure, error: 'timeout' },
    });
    expect(result.exposed).toBe('failed');
    expect(result.healthy).toBe('failed');
  });

  it('shows an uninstrumented observation as unknown, not as zero', () => {
    const stages = capabilityLifecycleStages({
      ...record,
      outcome: { ...record.outcome, measured: false, count: null },
    });
    const observed = stages.find(stage => stage.id === 'observed');
    expect(observed).toMatchObject({
      state: 'unknown',
      value: 'Not instrumented',
    });
  });

  it('marks a stale observation current and says it is stale', () => {
    const exposed = capabilityLifecycleStages({
      ...record,
      exposure: { ...record.exposure, stale: true },
    }).find(stage => stage.id === 'exposed');
    expect(exposed?.state).toBe('current');
    expect(exposed?.value).toContain('stale');
  });

  it('marks the first unreached stage current', () => {
    const shipped = {
      ...record,
      certification: record.certification
        ? { ...record.certification, state: 'shipped' }
        : null,
      outcome: { ...record.outcome, count: 0 },
    };
    expect(states(shipped)).toMatchObject({
      certified: 'done',
      observed: 'current',
    });
  });
});
