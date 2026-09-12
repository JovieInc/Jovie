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

describe('contained logo normalization', () => {
  it.each([64, 32, 12])(
    'contains all visible ink at frame width %s without distorting it',
    frameWidth => {
      const style = normalizedLogoStyle(asset, 'contain');
      const frameHeight = frameWidth / 2;
      const canvasWidth =
        (Number.parseFloat(style['--logo-render-width']) * frameWidth) / 100;
      const canvasHeight =
        (Number.parseFloat(style['--logo-render-height']) * frameHeight) / 100;
      const x =
        (Number.parseFloat(style['--logo-offset-x']) * canvasWidth) / 100;
      const y =
        (Number.parseFloat(style['--logo-offset-y']) * canvasHeight) / 100;
      const scale = canvasWidth / 100;
      expect(canvasWidth / canvasHeight).toBe(1);
      expect(x + asset.visibleBounds.x * scale).toBeCloseTo(0);
      expect(y + asset.visibleBounds.y * scale).toBeCloseTo(0);
      expect(
        x + (asset.visibleBounds.x + asset.visibleBounds.width) * scale
      ).toBeCloseTo(frameWidth);
      expect(
        y + (asset.visibleBounds.y + asset.visibleBounds.height) * scale
      ).toBeCloseTo(frameHeight);
      expect(style['--logo-frame-width']).toBe('64px');
    }
  );

  it('retains fixed canvas dimensions for natural provider logos', () => {
    expect(normalizedLogoStyle(asset)).toMatchObject({
      '--logo-render-width': '80px',
      '--logo-render-height': '80px',
      '--logo-offset-x': '-8px',
      '--logo-offset-y': '-16px',
    });
  });
});
