import { describe, expect, it } from 'vitest';
import { resolveSkillRollout } from './rollout';

const base = {
  skillId: 'retouch',
  userId: 'user-1',
  lifecycle: 'cohort' as const,
  version: '1.0.0',
  activeVersion: '1.0.0',
  availableVersions: ['1.0.0', '2.0.0'],
};

describe('resolveSkillRollout', () => {
  it('assigns deterministically and keeps the assignment when config changes', () => {
    const first = resolveSkillRollout({
      ...base,
      rollout: { percentage: 100, version: '2.0.0' },
    });
    const second = resolveSkillRollout({
      ...base,
      rollout: { percentage: 0, version: '1.0.0' },
      existingAssignment: first.assignment,
    });

    expect(first.assignment.cohort).toBe('candidate');
    expect(second).toEqual({ ...first });
  });

  it('supports named weighted cohorts and leaves the remainder in control', () => {
    const result = resolveSkillRollout({
      ...base,
      userId: 'user-2',
      rollout: { cohorts: { blue: 100 } },
    });
    expect(result.assignment.cohort).toBe('blue');
  });

  it('disabled always overrides rollout', () => {
    const result = resolveSkillRollout({
      ...base,
      lifecycle: 'disabled',
      rollout: { percentage: 100, version: '2.0.0' },
    });
    expect(result.assignment.cohort).toBe('control');
    expect(result.version).toBe('1.0.0');
  });
});
