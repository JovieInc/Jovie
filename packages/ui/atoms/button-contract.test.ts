import { describe, expect, it } from 'vitest';
import {
  ACTION_BUTTON_FACE_CLASSNAME,
  ACTION_BUTTON_PRESET,
  ACTION_BUTTON_VISIBLE_HEIGHT_PX,
  CTA_BUTTON_SIZE,
} from './button-contract';

describe('ACTION_BUTTON_PRESET', () => {
  it('locks web ActionButton geometry at 28 visible / 44 hit', () => {
    expect(ACTION_BUTTON_VISIBLE_HEIGHT_PX).toBe(28);
    expect(ACTION_BUTTON_FACE_CLASSNAME).toBe('h-7');
    expect(ACTION_BUTTON_PRESET).toEqual({
      size: CTA_BUTTON_SIZE,
      iconButtonSize: 'sm',
      visibleHeightPx: 28,
      mobileHitTargetPx: 44,
      labelWeight: 510,
      radiusPx: 999,
    });
  });
});
