import { describe, expect, it } from 'vitest';
import {
  ICON_STROKE,
  ICON_STROKE_DEFAULT_SIZE,
  iconStrokeForSize,
} from '@/lib/design/icon-stroke';

describe('iconStrokeForSize (JOV-14004)', () => {
  it('defaults to chrome stroke at sidebar/default size', () => {
    expect(iconStrokeForSize()).toBe(ICON_STROKE.chrome);
    expect(iconStrokeForSize(ICON_STROKE_DEFAULT_SIZE)).toBe(
      ICON_STROKE.chrome
    );
    expect(iconStrokeForSize(14)).toBe(ICON_STROKE.chrome);
    expect(iconStrokeForSize(16)).toBe(ICON_STROKE.chrome);
  });

  it('steps up to mid then feature as optical size grows (Linear weight)', () => {
    expect(iconStrokeForSize(18)).toBe(ICON_STROKE.mid);
    expect(iconStrokeForSize(20)).toBe(ICON_STROKE.mid);
    expect(iconStrokeForSize(24)).toBe(ICON_STROKE.feature);
    expect(iconStrokeForSize(32)).toBe(ICON_STROKE.feature);
  });

  it('treats invalid sizes as the chrome default', () => {
    expect(iconStrokeForSize(Number.NaN)).toBe(ICON_STROKE.chrome);
    expect(iconStrokeForSize(0)).toBe(ICON_STROKE.chrome);
    expect(iconStrokeForSize(-4)).toBe(ICON_STROKE.chrome);
  });

  it('stays thinner than Lucide default 2 and heavy 2.25+ call sites', () => {
    expect(ICON_STROKE.chrome).toBeLessThan(2);
    expect(ICON_STROKE.mid).toBeLessThan(2);
    expect(ICON_STROKE.feature).toBeLessThan(2);
  });
});
