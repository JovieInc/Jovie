import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from './vitest.config.real-eval.mts';

describe('real eval vitest config', () => {
  it('resolves the web root and includes the golden real tests', () => {
    const resolved = config as {
      root?: string;
      test?: { include?: string[] };
    };

    expect(resolved.root).toBeTruthy();
    expect(existsSync(resolved.root ?? '')).toBe(true);
    expect(resolved.test?.include).toEqual([
      'tests/eval/golden/**/*.real.test.ts',
    ]);
  });
});
