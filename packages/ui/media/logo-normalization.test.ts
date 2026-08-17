import { describe, expect, it } from 'vitest';
import {
  type LogoAssetNormalization,
  normalizedLogoStyle,
  resolveNormalizedLogoLayout,
} from './logo-normalization';

const asset: LogoAssetNormalization = {
  id: 'fixture',
  visibleBounds: { x: 10, y: 20, width: 80, height: 40 },
  cropInset: { top: 20, right: 10, bottom: 40, left: 10 },
  targetInkHeight: 32,
  opticalScale: 1,
  baselineOffsetY: 0,
  opticalOffsetX: 0,
  allowedOverflow: 0,
  provenance: {
    source: 'fixture',
    version: '1',
    measuredAt: '2026-08-12T00:00:00.000Z',
    measurement: 'alpha',
  },
};

describe('logo normalization', () => {
  it('normalizes visible ink height without distorting aspect ratio', () => {
    const layout = resolveNormalizedLogoLayout(asset);
    expect(layout.inkHeight).toBe(32);
    expect(layout.inkWidth / layout.inkHeight).toBe(2);
    expect(layout.frameWidth).toBe(layout.inkWidth);
    expect(layout.frameHeight).toBe(layout.inkHeight);
    expect(layout.renderedCanvasWidth / layout.renderedCanvasHeight).toBe(1);
    expect(normalizedLogoStyle(asset)).toMatchObject({
      '--logo-ink-height': '32px',
      '--logo-allowed-overflow': '0px',
    });
  });
});
