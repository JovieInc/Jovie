import { describe, expect, it } from 'vitest';
import {
  CONTENT_SAFE_AREA_BOTTOM_PADDING,
  TAB_BAR_HEIGHT_REM,
  TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX,
  TAB_BAR_INTERNAL_SAFE_AREA_PADDING,
} from './nav-constants';

describe('public profile nav constants', () => {
  it('keeps the compact shell bottom reservation aligned with the public profile spec', () => {
    expect(TAB_BAR_HEIGHT_REM).toBe('3.5rem');
    expect(CONTENT_SAFE_AREA_BOTTOM_PADDING).toBe(
      'pb-[var(--profile-bottom-nav-height)]'
    );
  });

  it('keeps the tab bar internal safe-area fallback explicit for non-notched devices', () => {
    expect(TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX).toBe(10);
    expect(TAB_BAR_INTERNAL_SAFE_AREA_PADDING).toBe(
      'pb-[max(env(safe-area-inset-bottom),10px)]'
    );
    expect(TAB_BAR_INTERNAL_SAFE_AREA_PADDING).toContain(
      `${TAB_BAR_INTERNAL_SAFE_AREA_MIN_PX}px`
    );
  });
});
