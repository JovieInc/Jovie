import { describe, expect, it } from 'vitest';
import {
  type FocusVisualStyle,
  hasVisibleFocusStyleChange,
} from '../../visual-qa/route-quality';

const BLURRED: FocusVisualStyle = {
  backgroundColor: 'rgb(15, 20, 32)',
  borderColor: 'rgba(168, 176, 195, 0.1)',
  boxShadow: 'none',
  outlineColor: 'rgb(245, 247, 251)',
  outlineStyle: 'none',
  outlineWidth: '3px',
};

describe('route quality focus evidence', () => {
  it('accepts a computed border change as a visible focus cue', () => {
    expect(
      hasVisibleFocusStyleChange(
        { ...BLURRED, borderColor: 'rgb(17, 175, 255)' },
        BLURRED
      )
    ).toBe(true);
  });

  it('rejects focus styles that are unchanged after blur', () => {
    expect(hasVisibleFocusStyleChange(BLURRED, BLURRED)).toBe(false);
  });
});
