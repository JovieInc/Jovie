import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingEditorialBackground } from '@/components/marketing/MarketingEditorialBackground';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

describe('MarketingEditorialBackground (JOV-6249 shared background system)', () => {
  it('renders both variants as one family with data-variant identity', () => {
    for (const variant of ['soft', 'flowing'] as const) {
      const { getByTestId, container, unmount } = render(
        <MarketingEditorialBackground variant={variant} />
      );

      const root = getByTestId('marketing-editorial-background');
      expect(root).toHaveAttribute('aria-hidden', 'true');
      expect(root).toHaveAttribute('data-variant', variant);
      expect(root).toHaveClass('marketing-editorial-background');
      expect(root).toHaveClass(`marketing-editorial-background--${variant}`);
      // Canonical accent reference is declared on every variant (JOV-5265).
      expect(root).toHaveAttribute(
        'data-marketing-editorial-accent',
        '--system-b-accent-cyan'
      );
      // Shared field/light/flow layer structure — one composition, two paints.
      expect(
        container.querySelectorAll(
          '[data-layer="field"], [data-layer="light-source"], [data-layer="flow"]'
        )
      ).toHaveLength(3);
      // No rendered toy/feature objects, text, or second type scale.
      expect(
        root.querySelectorAll('img, video, canvas, svg text')
      ).toHaveLength(0);
      expect(root.textContent).toBe('');
      unmount();
    }
  });

  it('resolves the canonical accent through the ion scene anchor only', () => {
    const css = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );
    const tokens = readWebSource('styles/design-system.css');

    // The chromatic core resolves through the System B ion anchor the
    // electric seam already consumes (JOV-5265 scene-color policy).
    expect(css).toContain('var(--system-b-accent-cyan)');
    expect(tokens).toMatch(
      /--system-b-accent-cyan:\s*var\(--geist-cyan-solid\)/
    );
    // No invented accent: no second hue token enters the background CSS.
    for (const forbidden of [
      '--system-b-accent-purple',
      '--color-accent-purple',
      '--system-b-accent-pink',
      '--color-accent-pink',
      'ultra',
      'pulse',
    ]) {
      expect(css).not.toContain(forbidden);
    }
  });

  it('paints from tokens with no arbitrary values or new type scale', () => {
    const css = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );

    // Substrate is the smallest suitable one: pure CSS gradients + blur, no
    // image/video bytes, no generated asset, no motion (static masters only —
    // reduced-motion and failed-media states degrade to the same still).
    expect(css).not.toMatch(/url\(/);
    expect(css).not.toMatch(/@keyframes|\banimation\b|\btransition\b/);
    expect(css).not.toMatch(/font-family|font-size|font-weight/);

    // No raw hex enters the component stylesheet; every color resolves from
    // the token layer.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain('var(--system-b-bg-page)');
    expect(css).toContain('var(--system-b-text-primary)');
  });

  it('declares focal location, flow direction, and content-safe areas per viewport', () => {
    const source = readWebSource(
      'components/marketing/MarketingEditorialBackground.tsx'
    );

    // Soft: off-center light (upper-left), diagonal flow, calm dark right/below.
    expect(source).toContain("focalLocation: {\n      desktop: 'upper-left',");
    expect(source).toContain("mainFlow: 'diagonal-down-right'");
    // Flowing: one dominant left-to-right sweep, calm center column.
    expect(source).toContain("mainFlow: 'left-to-right'");
    // Both variants declare desktop + mobile safe areas (variant contract
    // blocks plus the interface field description).
    expect(source.match(/contentSafeAreas/g)).toHaveLength(3);
    expect(source.match(/desktop:|mobile:/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps large calm dark regions and one flow direction per variant in the CSS master', () => {
    const css = readWebSource(
      'components/marketing/MarketingEditorialBackground.css'
    );

    // Soft: light source is off-center (not a centered hotspot), coverage
    // stays under half the plane so large dark regions remain for content.
    expect(css).toMatch(/ellipse 62% 48% at 18% 12%/);
    // Flowing: bounded subordinate curve set, both anchored along the same
    // left-to-right cadence — no crossing curves, no competing centers.
    expect(css.match(/radial-gradient\(/g)?.length).toBeLessThanOrEqual(9);
    const flowing = css.split('.marketing-editorial-background--flowing');
    // The dominant sweep enters left in both viewports.
    expect(flowing[2]).toMatch(/at 2?0% 5?2%/);
    // Mobile crops preserve the same flow (left edge, same direction).
    expect(css).toMatch(/@media \(max-width: 767px\)/);
  });

  it('ships adjacent stories rendering both variants behind receiving content', () => {
    const stories = readWebSource(
      'components/marketing/MarketingEditorialBackground.stories.tsx'
    );

    expect(stories).toContain(
      "title: 'Marketing/Primitives/MarketingEditorialBackground'"
    );
    // Both variants behind the same approved copy (Tests and review: render
    // both variants behind the same approved content).
    expect(stories).toContain('SoftBehindContent');
    expect(stories).toContain('FlowingBehindContent');
    // Receiving section reuses its own typography; no second title scale is
    // invented by the background (stories compose real content, not chrome).
    expect(stories).toContain('Control how the world sees you.');
    expect(stories).not.toMatch(/font-\[|text-\[/);
  });
});
