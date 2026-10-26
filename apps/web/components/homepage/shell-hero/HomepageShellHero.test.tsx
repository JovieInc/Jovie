import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { LOGO_PERMISSIONS } from '@/data/product-truth/logo-permissions';
import { HomepageShellHero, SHELL_IMAGE } from './HomepageShellHero';

const css = readFileSync(join(__dirname, 'HomepageShellHero.css'), 'utf8');

function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('reduce') && reduced,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomepageShellHero rest frame', () => {
  it('renders the locked headline as the h1 and the support line', () => {
    stubMatchMedia(true);
    render(<HomepageShellHero />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent?.replaceAll(/\s+/g, ' ').trim()).toBe(
      COMPANY_IDENTITY.homepageHeadline
    );
    expect(h1.id).toBe('home-hero-heading');
    expect(screen.getByText(HOMEPAGE_COPY.shell.support)).toBeInTheDocument();
    expect(HOMEPAGE_COPY.shell.support).toBe(COMPANY_IDENTITY.seoDescription);
    expect(HOMEPAGE_COPY.shell.support).not.toContain('what the web says');
  });

  it('shows the shell with the example alt text and explicit dimensions', () => {
    stubMatchMedia(true);
    render(<HomepageShellHero />);
    const img = screen.getByAltText(
      'Example: the Jovie app with a claimed jov.ie/you profile'
    );
    expect(img.getAttribute('width')).toBe(String(SHELL_IMAGE.width));
    expect(img.getAttribute('height')).toBe(String(SHELL_IMAGE.height));
    expect(img.getAttribute('src')).toBe(SHELL_IMAGE.webp);
    expect(img.getAttribute('sizes')).toContain('1248px');
    const sources = [...document.querySelectorAll('source')].map(s => [
      s.getAttribute('type'),
      s.getAttribute('srcset'),
    ]);
    expect(sources).toEqual([
      ['image/avif', SHELL_IMAGE.avif],
      ['image/webp', SHELL_IMAGE.webp],
    ]);
  });

  it('renders nothing in the logo slot while no logo grant exists', () => {
    stubMatchMedia(true);
    expect(LOGO_PERMISSIONS).toHaveLength(0);
    render(<HomepageShellHero />);
    expect(screen.getByTestId('hero-logo-slot')).toBeEmptyDOMElement();
  });

  it('stays at the rest frame under reduced motion: no scroll listener', () => {
    stubMatchMedia(true);
    const add = vi.spyOn(window, 'addEventListener');
    const { container } = render(<HomepageShellHero />);
    const root = container.querySelector<HTMLElement>('[data-hero-zoom]');
    expect(root?.style.getPropertyValue('--hero-zoom-scale')).toBe('0.926');
    expect(root?.style.getPropertyValue('--hero-zoom-edge-o')).toBe('1.000');
    expect(root?.style.getPropertyValue('--hero-zoom-logos-o')).toBe('1.000');
    expect(add.mock.calls.some(([type]) => type === 'scroll')).toBe(false);
  });

  it('binds a passive scroll listener when motion is allowed', () => {
    stubMatchMedia(false);
    const add = vi.spyOn(window, 'addEventListener');
    render(<HomepageShellHero />);
    const scroll = add.mock.calls.find(([type]) => type === 'scroll');
    expect(scroll?.[2]).toEqual({ passive: true });
  });

  it('server-renders the full rest frame with no inline zoom state (no JS)', () => {
    const html = renderToStaticMarkup(<HomepageShellHero />);
    expect(html).toContain('Be found.');
    expect(html).toContain('Be understood.');
    expect(html).toContain('<img');
    expect(html).not.toContain('--hero-zoom');
    expect(html).not.toContain('<canvas');
  });
});

describe('HomepageShellHero.css contract', () => {
  it('pins only when wide, motion is allowed and scripting is on', () => {
    expect(css).toMatch(
      /@media \(min-width: 1024px\) and \(scripting: enabled\) and \(\s*prefers-reduced-motion: no-preference\s*\)\s*\{[\s\S]*position: sticky/
    );
    // sticky appears exactly once, inside that query
    expect(css.match(/position: sticky/g)).toHaveLength(1);
  });

  it('moves only compositor properties: transform and opacity', () => {
    expect(css).not.toMatch(/transition:[^;]*\b(width|height|top|left|margin)/);
    expect(css).not.toMatch(/animation:/);
    expect(css).toMatch(/will-change: transform, opacity/);
  });

  it('keeps the rest values as defaults for every zoom variable', () => {
    for (const name of [
      'scale',
      'x',
      'y',
      'headline-y',
      'headline-o',
      'edge-o',
      'logos-o',
      'logos-y',
    ]) {
      expect(css).toContain(`--hero-zoom-${name}:`);
    }
  });
});
