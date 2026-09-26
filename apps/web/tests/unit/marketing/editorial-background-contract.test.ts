import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FLOWING_EDITORIAL_BACKGROUND_INSTANCE,
  getMarketingEditorialBackgroundInstance,
  JOVIE_EDITORIAL_BACKGROUND_INSTANCE_SCHEMA,
  JOVIE_EDITORIAL_BACKGROUND_INSTANCE_VERSION,
  MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS,
  MARKETING_EDITORIAL_BACKGROUND_INSTANCE_IDS,
  MARKETING_EDITORIAL_BACKGROUND_INSTANCES,
  SOFT_EDITORIAL_BACKGROUND_INSTANCE,
  validateMarketingEditorialBackgroundInstance,
} from '@/data/marketing/editorialBackgrounds';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

describe('marketing editorial background instances (JOV-6249)', () => {
  it('locks the schema, version, and both registered masters', () => {
    expect(JOVIE_EDITORIAL_BACKGROUND_INSTANCE_SCHEMA).toBe(
      'jovie-editorial-background-instance/v1'
    );
    expect(JOVIE_EDITORIAL_BACKGROUND_INSTANCE_VERSION).toBe(
      'editorial-masters-v1'
    );
    expect(MARKETING_EDITORIAL_BACKGROUND_INSTANCE_IDS).toEqual([
      'editorial-background.soft.homepage-hero',
      'editorial-background.flowing.feature-sweep',
    ]);
    expect(MARKETING_EDITORIAL_BACKGROUND_INSTANCES).toHaveLength(2);
  });

  it('binds the soft master to the homepage editorial light well', () => {
    const css = readWebSource('app/(home)/home.css');
    const componentCss = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );

    // Byte-grounded in home.css (the JOV-6246 approved source).
    expect(css).toContain('.homepage-editorial-hero__light-well');
    expect(css).toContain('width: min(80rem, 120vw)');
    expect(css).toContain('height: min(42rem, 62vw)');
    expect(css).toContain('border-radius: 50%');
    expect(css).toContain('top: 48%');
    expect(css).toContain('opacity: 0.5');
    expect(css).toContain('filter: blur(var(--space-8))');
    expect(css).toContain('inset: 42% 14% auto');
    expect(css).toContain('filter: blur(var(--space-12))');

    // The shared component carries the same geometry and mobile crop.
    expect(componentCss).toContain('width: min(80rem, 120vw)');
    expect(componentCss).toContain('height: min(42rem, 62vw)');
    expect(componentCss).toContain('opacity: 0.5');
    expect(componentCss).toContain('filter: blur(var(--space-8))');
    expect(componentCss).toContain('width: 150vw');
    expect(componentCss).toContain('height: 60vw');
    expect(componentCss).toContain(
      'color-mix(\n    in oklab,\n    var(--system-b-text-primary) 5%,\n    transparent\n  )'
    );

    expect(SOFT_EDITORIAL_BACKGROUND_INSTANCE.variant).toBe('soft');
    expect(SOFT_EDITORIAL_BACKGROUND_INSTANCE.accent).toEqual(
      MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS.soft
    );
    expect(SOFT_EDITORIAL_BACKGROUND_INSTANCE.motion).toEqual({
      supported: false,
      fallback: 'no-motion',
    });
  });

  it('binds the flowing master to the seam family and bloom B', () => {
    const homeCss = readWebSource('app/(home)/home.css');
    const seamComponent = readWebSource(
      'components/marketing/MarketingElectricSeam.tsx'
    );
    const componentCss = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );
    const component = readWebSource(
      'components/marketing/MarketingEditorialBackground.tsx'
    );
    const tokens = readWebSource('styles/design-system.css');

    // Bloom B (founder-locked soft optical bloom).
    expect(homeCss).toContain('.homepage-poster-hero__media::before');
    expect(homeCss).toContain('inset: -18% 8% auto');
    expect(homeCss).toContain('filter: blur(80px)');
    expect(homeCss).toContain('opacity: 0.42');
    expect(homeCss).toContain('var(--color-accent-blue-subtle)');
    expect(tokens).toMatch(
      /--color-accent-blue-subtle:\s*rgba\(17,\s*175,\s*255,\s*0\.12\)/
    );

    // The seam curve family — one shared left-to-right flow. Both the seam
    // component and the shared background carry the identical locked
    // viewBox + path (constants, byte-checked by value).
    expect(seamComponent).toContain("const VIEW_BOX = '0 0 1200 24'");
    expect(seamComponent).toContain(
      'M0 12 C120 12 164 12 246 12 S382 11 480 12 S620 13 718 12 S856 11 960 12 S1090 12 1200 12'
    );
    expect(component).toContain("const VIEW_BOX = '0 0 1200 24'");
    expect(component).toContain(
      'M0 12 C120 12 164 12 246 12 S382 11 480 12 S620 13 718 12 S856 11 960 12 S1090 12 1200 12'
    );
    expect(componentCss).toContain('filter: blur(80px)');
    expect(componentCss).toContain('opacity: 0.42');
    expect(componentCss).toContain(
      'var(--system-b-accent-cyan) 72%,\n    transparent'
    );

    expect(FLOWING_EDITORIAL_BACKGROUND_INSTANCE.variant).toBe('flowing');
    expect(FLOWING_EDITORIAL_BACKGROUND_INSTANCE.accent).toEqual(
      MARKETING_EDITORIAL_BACKGROUND_INSTANCE_ACCENTS.flowing
    );
    expect(FLOWING_EDITORIAL_BACKGROUND_INSTANCE.motion).toEqual({
      supported: true,
      fallback: 'static-glow-only',
    });
    expect(FLOWING_EDITORIAL_BACKGROUND_INSTANCE.flowDirection).toBe(
      'left-to-right'
    );
  });

  it('keeps the quiet static soft master usable independently of motion', () => {
    expect(SOFT_EDITORIAL_BACKGROUND_INSTANCE.motion.supported).toBe(false);
    // The soft CSS carries no keyframes of its own.
    const componentCss = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );
    const softBlock = componentCss.slice(
      componentCss.indexOf('.marketing-editorial-background__field {'),
      componentCss.indexOf('/* Flowing variant')
    );
    expect(softBlock).not.toContain('@keyframes');
    // Reduced-motion/failed-media fallback uses the approved stills.
    expect(componentCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('resolves only the registered instances', () => {
    expect(
      getMarketingEditorialBackgroundInstance(
        'editorial-background.soft.homepage-hero'
      )
    ).toBe(SOFT_EDITORIAL_BACKGROUND_INSTANCE);
    expect(
      getMarketingEditorialBackgroundInstance(
        'editorial-background.flowing.feature-sweep'
      )
    ).toBe(FLOWING_EDITORIAL_BACKGROUND_INSTANCE);
    expect(() =>
      getMarketingEditorialBackgroundInstance(
        'editorial-background.neon-prism' as never
      )
    ).toThrow(/Unknown marketing editorial background instance/);
  });

  it('validates both registered instances clean', () => {
    for (const instance of MARKETING_EDITORIAL_BACKGROUND_INSTANCES) {
      expect(validateMarketingEditorialBackgroundInstance(instance)).toEqual(
        []
      );
    }
  });

  it('rejects unknown instances and invented taste (negative fixtures)', () => {
    // Unknown instance id fails closed.
    expect(
      validateMarketingEditorialBackgroundInstance({
        ...SOFT_EDITORIAL_BACKGROUND_INSTANCE,
        id: 'editorial-background.rainbow-blend',
      }).map(finding => finding.code)
    ).toEqual(['unknown-editorial-background-instance']);

    // A generator-supplied free-form accent is rejected.
    expect(
      validateMarketingEditorialBackgroundInstance({
        ...FLOWING_EDITORIAL_BACKGROUND_INSTANCE,
        accent: { token: '--invented-accent', hex: '#FF00FF' },
      }).map(finding => finding.code)
    ).toEqual(['noncanonical-instance-accent']);

    // Unsupported variant drift fails closed with the accent check.
    expect(
      validateMarketingEditorialBackgroundInstance({
        ...FLOWING_EDITORIAL_BACKGROUND_INSTANCE,
        variant: 'rainbow' as never,
      }).map(finding => finding.code)
    ).toContain('unsupported-instance-variant');

    // Missing safe area, wrong content column, and a lost flow direction
    // are each rejected — crossing/contradicting sweeps never pass.
    expect(
      validateMarketingEditorialBackgroundInstance({
        ...SOFT_EDITORIAL_BACKGROUND_INSTANCE,
        safeArea: 'centered-hotspot' as never,
        contentColumn: 'bespoke' as never,
        flowDirection: 'criss-cross' as never,
      }).map(finding => finding.code)
    ).toEqual([
      'missing-instance-safe-area',
      'missing-instance-content-column',
      'missing-instance-flow-direction',
    ]);

    // Supported motion without an approved fallback still is rejected.
    expect(
      validateMarketingEditorialBackgroundInstance({
        ...FLOWING_EDITORIAL_BACKGROUND_INSTANCE,
        motion: { supported: true, fallback: 'no-motion' },
      }).map(finding => finding.code)
    ).toEqual(['unsupported-instance-motion']);

    // The shared component declares exactly one sweep rule and no second
    // bright center / crossing-curve class: position modifiers only.
    const componentCss = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );
    expect(
      componentCss.match(/\.marketing-editorial-background__sweep \{/g)
    ).toHaveLength(1);
    expect(componentCss).toContain('prefers-reduced-motion: reduce');
  });
});
