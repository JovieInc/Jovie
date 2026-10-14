import { describe, expect, it } from 'vitest';
import {
  evaluateIconGlyphContract,
  type IconGlyphMeasurement,
} from './icon-glyph-contract';

const sample: IconGlyphMeasurement = {
  state: 'idle',
  width: 28,
  height: 28,
  backgroundAlpha: 0,
  cornerRadii: [9999, 9999, 9999, 9999],
};
describe('rendered glyph decoration contract', () => {
  it.each(['idle', 'focus'] as const)(
    'permits transparent %s without altering focus ownership',
    state => {
      expect(evaluateIconGlyphContract({ ...sample, state })).toEqual([]);
    }
  );
  it('permits a circular hover surface', () => {
    expect(
      evaluateIconGlyphContract({
        ...sample,
        state: 'hover',
        backgroundAlpha: 0.12,
      })
    ).toEqual([]);
  });
  it.each(['idle', 'focus'] as const)(
    'deliberate red: rejects persistent fill during %s',
    state => {
      expect(
        evaluateIconGlyphContract({ ...sample, state, backgroundAlpha: 0.12 })
      ).toContain('glyph background persists outside hover');
    }
  );
  it('deliberate red: rejects the rounded-square hover tile', () => {
    expect(
      evaluateIconGlyphContract({
        ...sample,
        state: 'hover',
        backgroundAlpha: 0.12,
        cornerRadii: [8, 8, 8, 8],
      })
    ).toContain('hover background is not circular');
  });
  it('deliberate red: rejects a fully rounded oval hover surface', () => {
    expect(
      evaluateIconGlyphContract({
        ...sample,
        state: 'hover',
        backgroundAlpha: 0.12,
        width: 40,
      })
    ).toContain('hover background is not circular');
  });
  it('deliberate red: refuses incomplete geometry evidence', () => {
    expect(evaluateIconGlyphContract({ ...sample, cornerRadii: [] })).toContain(
      'invalid glyph measurement'
    );
  });
});
