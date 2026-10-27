import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function cssRule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Missing rule: ${selector}`);
  return source.slice(start, source.indexOf('}', start) + 1);
}

const headerCss = readWebSource('components/site/MarketingHeader.css');
const headerNavCss = readWebSource('components/organisms/HeaderNav.css');
const homeCss = readWebSource('app/(home)/home.css');

describe('docked marketing header (Tim direction 2026-09-26)', () => {
  it('has no glass at rest and fades a flat noir glass layer in on scroll', () => {
    const layer = cssRule(headerCss, '.header-nav--docked::before');
    expect(layer).toContain('opacity: 0');
    expect(layer).toContain('backdrop-filter: blur(20px) saturate(165%)');
    expect(layer).toContain('background: var(--marketing-dock-glass)');
    expect(layer).toContain(
      'border-bottom: var(--space-px) solid var(--marketing-dock-rim)'
    );
    expect(layer).not.toContain('box-shadow');
    // Only opacity animates, on tokens (160ms ease-out), so the bar never
    // changes geometry at the threshold.
    expect(layer).toContain(
      'transition: opacity var(--duration-normal) var(--ease-cinematic)'
    );
    expect(headerCss).toMatch(
      /\.header-nav--docked\[data-scrolled="true"\]::before,[\s\S]*?\{\s*opacity: 1;/
    );
    expect(headerCss).toContain('var(--noir-ion-shell) 82%');
  });

  it('falls back to solid chrome for reduced motion, transparency, contrast, and forced colors', () => {
    expect(headerCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.header-nav--docked::before \{\s*transition: none;/
    );
    expect(headerCss).toMatch(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{\s*\.header-nav--docked::before \{[^}]*background: var\(--noir-ion-shell\);[^}]*backdrop-filter: none;/
    );
    expect(headerCss).toMatch(
      /@media \(forced-colors: active\) \{\s*\.header-nav--docked::before \{[^}]*background: Canvas;/
    );
  });

  it('docks the bar flush to the viewport top instead of floating a pill', () => {
    const glassHeader = cssRule(headerNavCss, '.marketing-glass-header');
    expect(glassHeader).toContain('top: 0 !important');
    const shell = cssRule(headerNavCss, '.marketing-glass-header__shell');
    expect(shell).toContain('border-radius: 0');
    expect(shell).toContain('background: transparent');
    expect(shell).not.toContain('999px');
    expect(headerNavCss).not.toMatch(
      /\[data-scrolled="true"\] \.marketing-glass-header__shell/
    );
  });

  it('removes the homepage floating pill glass so the shared dock layer owns scroll state', () => {
    expect(homeCss).not.toContain(
      'background: color-mix(in oklab, var(--system-b-bg-page) 78%, transparent);'
    );
    expect(homeCss).toContain(
      'height: var(--homepage-header-height) !important;'
    );
  });

  it('lets only the leading hero bleed under the header using the offset token', () => {
    expect(headerCss).toContain(
      '--marketing-dock-offset: var(--public-shell-header-offset);'
    );
    expect(headerCss).toMatch(
      /\.public-shell-main--docked\s+:not\(\[hidden\], script, style, link, template, noscript\)\s+~ \* \{\s*--marketing-dock-offset: 0px;/
    );
    expect(cssRule(headerCss, '.marketing-hero-dock')).toContain(
      'margin-top: calc(-1 * var(--marketing-dock-offset, 0px))'
    );
    expect(cssRule(headerCss, '.marketing-hero-dock--inset')).toContain(
      'var(--marketing-dock-offset, 0px) +'
    );
  });
});
