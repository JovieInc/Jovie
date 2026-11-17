import { describe, expect, it } from 'vitest';
import { scoreMutants } from '../mutation-diff.mjs';

const score = (...statuses) =>
  scoreMutants(statuses.map(status => ({ status })));
const fields = 'detected undetected valid unknown invalid complete score';
const values = r => fields.split(' ').map(key => r[key]);

describe('mutation score evidence validity', () => {
  it.each(
    'Timeout Pending Ignored RuntimeError new-status __proto__'.split(' ')
  )('keeps %s evidence unknown instead of scoring a green subset', status => {
    const result = score('Killed', status);
    expect(values(result)).toEqual([1, 0, 2, 1, 0, false, null]);
    expect(result.counts[status]).toBe(1);
  });
  it('does not report an entirely timed-out module as 100% killed', () => {
    const timed = score('Timeout', 'Timeout');
    expect(values(timed)).toEqual([0, 0, 2, 2, 0, false, null]);
  });
  it('preserves a completed control and treats no-coverage as undetected', () => {
    const control = score('Killed', 'Killed', 'Survived', 'NoCoverage');
    expect(values(control)).toEqual([2, 2, 4, 0, 0, true, 50]);
  });
  it('excludes only compile-invalid mutants from the denominator', () => {
    const compiled = score('Killed', 'CompileError');
    expect(values(compiled)).toEqual([1, 0, 1, 0, 1, true, 100]);
  });
  it.each([{ statuses: [] }, { statuses: ['CompileError'] }])(
    'keeps unscored reports unknown: $statuses',
    ({ statuses }) => {
      const result = score(...statuses);
      expect(result.valid).toBe(0);
      expect(result.complete).toBe(false);
      expect(result.score).toBeNull();
    }
  );
});
