import { describe, expect, it } from 'vitest';
import {
  createVisualQaBreakpoint,
  isHorizontalOverflowAcceptable,
  parseVisualQaBreakpointWidths,
  resolveVisualQaBreakpoints,
} from '@/lib/visual-qa/breakpoints';

describe('visual-qa breakpoints', () => {
  it('resolves the full canonical QA matrix', () => {
    const breakpoints = resolveVisualQaBreakpoints({ preset: 'all' });
    expect(breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      320, 360, 375, 390, 414, 768, 820, 1024, 1280, 1440, 1536,
    ]);
  });

  it('resolves compact mobile widths', () => {
    const breakpoints = resolveVisualQaBreakpoints({ preset: 'compact' });
    expect(breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      320, 360, 375, 390, 414,
    ]);
  });

  it('parses explicit width lists', () => {
    const breakpoints = parseVisualQaBreakpointWidths('390,768,1440,999');
    expect(breakpoints.map(breakpoint => breakpoint.width)).toEqual([
      390, 768, 1440,
    ]);
  });

  it('assigns taller heights to compact widths', () => {
    expect(createVisualQaBreakpoint(390)).toMatchObject({
      width: 390,
      height: 844,
      label: '390',
    });
    expect(createVisualQaBreakpoint(1440)).toMatchObject({
      width: 1440,
      height: 900,
      label: '1440',
    });
  });

  it('treats one pixel of overflow as acceptable', () => {
    expect(isHorizontalOverflowAcceptable(0)).toBe(true);
    expect(isHorizontalOverflowAcceptable(1)).toBe(true);
    expect(isHorizontalOverflowAcceptable(2)).toBe(false);
  });
});
