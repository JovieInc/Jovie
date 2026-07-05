import { afterEach, describe, expect, it } from 'vitest';

import { CODE_FLAGS, isCodeFlagEnabled } from './code-flags';

describe('code flags', () => {
  afterEach(() => {
    delete process.env.FEATURE_CANVAS_GRAIN;
  });

  it('defaults to the registry value when no env override is set', () => {
    expect(isCodeFlagEnabled('CANVAS_GRAIN')).toBe(CODE_FLAGS.CANVAS_GRAIN);
  });

  it('honors FEATURE_<FLAG_NAME> env overrides', () => {
    process.env.FEATURE_CANVAS_GRAIN = 'false';
    expect(isCodeFlagEnabled('CANVAS_GRAIN')).toBe(false);
  });
});
