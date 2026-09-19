import { describe, expect, it } from 'vitest';
import { isDspQuietListScope } from './dsp-quiet-scope';

describe('DSP quiet list scope', () => {
  it('allows track and release inspectors only', () => {
    expect(isDspQuietListScope('track')).toBe(true);
    expect(isDspQuietListScope('release')).toBe(true);
    expect(isDspQuietListScope('artist')).toBe(false);
    expect(isDspQuietListScope('account')).toBe(false);
    expect(isDspQuietListScope('merch')).toBe(false);
    expect(isDspQuietListScope(null)).toBe(false);
  });
});
