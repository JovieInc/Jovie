import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { findChromeOverrideViolations } from '../../../../../scripts/component-ownership-check.mjs';
import { evaluateSharedSearchGeometry } from '../../../../../scripts/component-rendered-invariant-policy.mjs';
import { HOMEPAGE_AURA_PIERCE_RED_CSS } from './homepage-eight-invariants-fixtures';

const webRoot = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return readFileSync(path.join(webRoot, rel), 'utf8');
}

function readNameSearchCss(): string {
  const css = read('app/(home)/home.css');
  const start = css.indexOf('HOMEPAGE NAME SEARCH START');
  const end = css.indexOf('HOMEPAGE NAME SEARCH END', start);
  expect(start, 'name search CSS block exists').toBeGreaterThanOrEqual(0);
  return css.slice(start, end);
}

/** Canonical Pen homepage CSS plus the shared name-search fallback. */
function readHeroCss(): string {
  return `${read('components/homepage/HomepageIdentity.css')}\n${readNameSearchCss()}`;
}

function HomepageOpticalPolishRegressionFixture() {
  return (
    <div data-deliberate-red='' data-testid='homepage-optical-polish-red'>
      <div
        className='homepage-editorial-hero__light-well'
        style={{
          border: '1px solid white',
          backgroundImage:
            'linear-gradient(180deg, transparent 0 55%, white 55.1%, transparent 55.3%)',
        }}
      />
      <div className='group/aura'>
        <div
          aria-hidden='true'
          style={{ background: 'conic-gradient(red, blue)' }}
        />
      </div>
    </div>
  );
}

describe('homepage-optical-polish-v1', () => {
  it('owns editorial border illumination on InputAuraFrame, not route .group/aura internals', () => {
    const primitive = `${read('components/features/home/InputAuraFrame.tsx')}\n${read('components/features/home/InputAuraFrame.css')}`;
    const search = read('components/features/home/HeroSpotifySearch.tsx');
    const heroCss = readHeroCss();
    const homeCss = read('app/(home)/home.css');

    expect(primitive).toContain('input-aura-frame--editorial');
    expect(primitive).toContain('input-aura-frame__illumination');
    expect(primitive).toContain('mask-composite: exclude');
    expect(primitive).toContain('treatment?: InputAuraTreatment');
    expect(search).toContain(
      "treatment={isEditorial ? 'editorial' : 'default'}"
    );

    expect(heroCss).not.toMatch(/\.group\\\//);
    expect(homeCss).not.toMatch(/\.homepage-name-search\s*>\s*\.group\\\/aura/);
    expect(read('components/features/home/InputAuraFrame.css')).not.toContain(
      'conic-gradient'
    );
    expect(read('components/features/home/InputAuraFrame.css')).not.toContain(
      'rotate-[442deg]'
    );

    const close = read('components/homepage/HomepageClose.tsx');
    expect(close).not.toContain('HeroSpotifySearch');
    expect(close).toContain("getElementById('homepage-name-search')");
    expect(close).toContain('?.focus()');
    expect(
      findChromeOverrideViolations(
        'apps/web/app/(home)/home.css',
        HOMEPAGE_AURA_PIERCE_RED_CSS
      ).some(item => item.family === 'search-aura')
    ).toBe(true);
    expect(
      evaluateSharedSearchGeometry({
        hero: {
          treatment: 'editorial',
          fieldHeight: 44,
          fieldBackground: 'shared',
          consumerAuraPierce: false,
        },
        close: {
          treatment: 'editorial',
          fieldHeight: 44,
          fieldBackground: 'shared',
          consumerAuraPierce: false,
        },
      }).ok
    ).toBe(true);
  });

  it('keeps the 28px action concentrically inset and the field interior calm', () => {
    const heroCss = readHeroCss();
    const search = read('components/features/home/HeroSpotifySearch.tsx');

    expect(heroCss).toMatch(
      /\.homepage-name-search__field\s*\{[\s\S]*?--homepage-editorial-field:/
    );
    expect(heroCss).toContain('--homepage-name-search-inset: var(--space-2);');
    expect(heroCss).toMatch(
      /min-height:\s*calc\(\s*var\(--space-6\)\s*\+\s*var\(--space-1\)\s*\+\s*var\(--homepage-name-search-inset\)\s*\*\s*2/
    );
    expect(heroCss).toMatch(
      /\.homepage-name-search__field\s*\{[\s\S]*?background:\s*var\(--homepage-editorial-field\);/
    );
    expect(heroCss).not.toMatch(
      /\.homepage-name-search__field\s*\{[\s\S]*?linear-gradient/
    );
    expect(heroCss).not.toMatch(
      /\.homepage-name-search__field:focus-within[\s\S]*?border-color:/
    );
    expect(search).toContain("size='marketing'");
  });

  it('names section, media, and close spacing treatments', () => {
    const sections = read('components/homepage/HomepageCertifiedSections.tsx');
    const close = read('components/homepage/HomepageClose.tsx');
    const css = read('components/homepage/HomepageIdentity.css');

    expect(sections).not.toContain("data-rhythm='proof'");
    expect(sections).toContain("dataMedia='true'");
    expect(sections).toContain("dataMedia='false'");
    expect(close).toContain("data-rhythm='close'");
    expect(css).toMatch(
      /\.homepage-identity-section\s*\{[\s\S]*?padding-block: clamp\(/
    );
    expect(css).toMatch(
      /\.homepage-identity-close\s*\{[\s\S]*?border-top: var\(--space-px, 1px\) solid var\(--homepage-identity-rule\);/
    );
    expect(css).toContain('.homepage-identity-presence__material');
    expect(css).toContain('.homepage-identity-structure__list');
  });

  it('keeps the hero free of wireframes, horizon lines, and light-well chrome', () => {
    const heroCss = readHeroCss();

    expect(heroCss).not.toContain('light-well');
    expect(heroCss).not.toMatch(/transparent 0 55%/);
    expect(heroCss).not.toMatch(/55\.1%/);
    expect(heroCss).not.toMatch(/border:\s*1px solid white/);
    expect(heroCss).toMatch(
      /\.homepage-identity-hero__headline\s*\{[\s\S]*?text-wrap: balance;/
    );
  });

  it('rejects the deliberate-red aura-leak and ellipse fixture', () => {
    render(<HomepageOpticalPolishRegressionFixture />);

    const fixture = screen.getByTestId('homepage-optical-polish-red');
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.querySelector('.group\\/aura')).toBeTruthy();
    expect(
      fixture
        .querySelector('.homepage-editorial-hero__light-well')
        ?.getAttribute('style')
    ).toContain('55.1%');

    const heroCss = readHeroCss();
    const homeCss = read('app/(home)/home.css');
    expect(heroCss).not.toContain('1px solid white');
    expect(homeCss).not.toMatch(/\.homepage-name-search\s*>\s*\.group\\\/aura/);
    expect(heroCss).not.toContain('55.1%');
  });
});
