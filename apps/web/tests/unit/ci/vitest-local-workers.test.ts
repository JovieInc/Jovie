import { describe, expect, it } from 'vitest';
import { localMaxWorkers } from '../../../scripts/vitest-local-workers.mjs';

describe('localMaxWorkers', () => {
  it('keeps the vitest default on an idle host', () => {
    expect(localMaxWorkers({ env: {}, cpus: 16, load1: 3 })).toBeUndefined();
  });

  it('takes a quarter of the cores (min 2) once load reaches half the cores', () => {
    expect(localMaxWorkers({ env: {}, cpus: 16, load1: 8 })).toBe(4);
    expect(localMaxWorkers({ env: {}, cpus: 4, load1: 20 })).toBe(2);
  });

  it('lets VITEST_LOCAL_MAX_WORKERS override, ignoring junk', () => {
    expect(
      localMaxWorkers({
        env: { VITEST_LOCAL_MAX_WORKERS: '6' },
        cpus: 16,
        load1: 0,
      })
    ).toBe(6);
    expect(
      localMaxWorkers({
        env: { VITEST_LOCAL_MAX_WORKERS: 'x' },
        cpus: 16,
        load1: 0,
      })
    ).toBeUndefined();
  });
});
