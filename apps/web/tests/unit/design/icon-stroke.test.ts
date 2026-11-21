import { describe, expect, it } from 'vitest';
import {
  ICON_STROKE,
  ICON_STROKE_DEFAULT_SIZE,
  iconStrokeForSize,
  opticalSizeFromClassName,
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

describe('opticalSizeFromClassName (JOV-14004)', () => {
  it('reads Tailwind size/h/w spacing into CSS px', () => {
    expect(opticalSizeFromClassName('h-4 w-4')).toBe(16);
    expect(opticalSizeFromClassName('size-5 text-accent')).toBe(20);
    expect(opticalSizeFromClassName('mr-2 h-6 w-6 text-destructive')).toBe(24);
    expect(opticalSizeFromClassName('h-3.5 w-3.5')).toBe(14);
  });

  it('uses the spacing formula for tokens beyond the override table', () => {
    expect(opticalSizeFromClassName('size-14')).toBe(56);
    expect(opticalSizeFromClassName('h-16')).toBe(64);
  });

  it('parses arbitrary px/rem size utilities', () => {
    expect(opticalSizeFromClassName('h-[28px]')).toBe(28);
    expect(opticalSizeFromClassName('size-[1.5rem]')).toBe(24);
  });

  it('returns undefined when no size utility is present', () => {
    expect(opticalSizeFromClassName(undefined)).toBeUndefined();
    expect(opticalSizeFromClassName('text-accent shrink-0')).toBeUndefined();
  });
});
