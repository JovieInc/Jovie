import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CINEMATIC_CURVE,
  CINEMATIC_DURATION_MS,
  motionPresets,
} from './presets';

const css = readFileSync(
  join(__dirname, '../../styles/design-system.css'),
  'utf8'
);
const token = (name: string) =>
  new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css)?.[1].trim();

describe('motion presets', () => {
  it('pins the preset numbers the spec names', () => {
    const p = motionPresets;
    expect(p.matteField).toMatchObject({
      accentAmt: 0,
      accentMax: 0.06,
      grain: 0.03,
      fpsCap: 30,
      resolutionScale: 0.5,
    });
    expect(p.matteField.driftMaxUvPerSecond).toBeLessThanOrEqual(0.012);
    expect(p.heroShellZoom).toMatchObject({
      scaleFrom: 1.94,
      restFrameWidth: 1248,
      shellWidth: 1348,
      headlineYFrom: 132,
      headlineYTo: 144,
      logoRowFrom: 0.85,
    });
    expect(p.shellParallax).toMatchObject({
      tiltDeg: 6,
      enterTranslateY: 80,
      enterDurationFactor: 2,
      pointerMaxDeg: 1.5,
      planes: { claimForm: 18, rightRail: 30, audioDock: 8 },
    });
    expect(p.chatTakeover).toMatchObject({
      durationMs: 420,
      profileLiftPx: -32,
      profileScaleTo: 0.98,
      profileFadeEnd: 0.7,
      conversationSettlePx: 24,
      conversationFadeStart: 0.3,
      reducedCrossfadeMs: 150,
    });
  });

  it('mirrors the cinematic curve and duration tokens', () => {
    expect(token('--ds-motion-cinematic-easing')).toBe(
      `cubic-bezier(${CINEMATIC_CURVE.join(', ')})`
    );
    expect(token('--ds-motion-cinematic-duration')).toBe(
      `${CINEMATIC_DURATION_MS}ms`
    );
  });

  it('mirrors every --motion-* token in design-system.css', () => {
    const p = motionPresets;
    expect(token('--motion-scroll-hero-range')).toBe(
      `${p.heroShellZoom.scrollRangeSvh * 100}svh`
    );
    expect(token('--motion-hero-zoom-from')).toBe(
      String(p.heroShellZoom.scaleFrom)
    );
    expect(token('--motion-parallax-tilt')).toBe(
      `${p.shellParallax.tiltDeg}deg`
    );
    expect(token('--motion-parallax-pointer-max')).toBe(
      `${p.shellParallax.pointerMaxDeg}deg`
    );
    expect(token('--motion-takeover-lift')).toBe(
      `${p.chatTakeover.profileLiftPx}px`
    );
    expect(token('--motion-takeover-settle')).toBe(
      `${p.chatTakeover.conversationSettlePx}px`
    );
    expect(token('--motion-field-fps')).toBe(String(p.matteField.fpsCap));
    expect(token('--motion-field-grain')).toBe(String(p.matteField.grain));
  });

  it('resets movement tokens to rest under prefers-reduced-motion', () => {
    const block =
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*--motion-hero-zoom-from[^}]*)\}/.exec(
        css
      )?.[1];
    expect(block).toBeDefined();
    const rest = (
      motionPresets.heroShellZoom.restFrameWidth /
      motionPresets.heroShellZoom.shellWidth
    ).toFixed(4);
    expect(block).toContain(`--motion-hero-zoom-from: ${rest};`);
    for (const name of [
      '--motion-parallax-tilt: 0deg',
      '--motion-parallax-pointer-max: 0deg',
      '--motion-takeover-lift: 0px',
      '--motion-takeover-settle: 0px',
      '--motion-field-fps: 0',
    ]) {
      expect(block).toContain(name);
    }
  });
});
