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

function readHeroCss(): string {
  const css = read('app/(home)/home.css');
  const start = css.indexOf('HOMEPAGE EDITORIAL HERO START');
  const end = css.indexOf('HOMEPAGE EDITORIAL HERO END', start);
  return css.slice(start, end);
}

function readCertifiedCss(): string {
  const css = read('app/(home)/home.css');
  const start = css.indexOf('HOMEPAGE CERTIFIED SECTIONS START');
  const end = css.indexOf('HOMEPAGE CERTIFIED SECTIONS END', start);
  return css.slice(start, end);
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
    expect(close).toContain('HeroSpotifySearch');
    expect(close).toContain("appearance='editorial'");
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

  it('names proof, text, product, and close spacing treatments', () => {
    const sections = read('components/homepage/HomepageCertifiedSections.tsx');
    const close = read('components/homepage/HomepageClose.tsx');
    const certifiedCss = readCertifiedCss();

    expect(sections).toContain("data-rhythm='proof'");
    expect(sections).toContain("data-rhythm={media ? 'product' : 'text'}");
    expect(close).toContain("data-rhythm='close'");
    expect(certifiedCss).toContain('--homepage-rhythm-proof:');
    expect(certifiedCss).toContain('--homepage-rhythm-text:');
    expect(certifiedCss).toContain('--homepage-rhythm-product:');
    expect(certifiedCss).toContain('--homepage-rhythm-close-start:');
    expect(certifiedCss).toMatch(
      /\.homepage-certified-section\[data-rhythm="product"\][\s\S]*?--homepage-rhythm-product/
    );
    expect(certifiedCss).toMatch(
      /\.homepage-certified-proof__logos\s*\{[\s\S]*?margin-top:\s*0;/
    );
    expect(certifiedCss).not.toMatch(
      /\.homepage-certified-proof__logos\s*\{[\s\S]*?margin-top:\s*clamp/
    );
  });

  it('kills the elliptical wireframe and the 55% horizon line', () => {
    const heroCss = readHeroCss();

    expect(heroCss).toMatch(
      /\.homepage-editorial-hero__light-well\s*\{[\s\S]*?border:\s*0;/
    );
    expect(heroCss).not.toMatch(/transparent 0 55%/);
    expect(heroCss).not.toMatch(/55\.1%/);
    expect(heroCss).not.toMatch(
      /\.homepage-editorial-hero__light-well\s*\{[\s\S]*?border:\s*1px solid/
    );
    expect(heroCss).toContain('radial-gradient');
    expect(heroCss).toMatch(
      /\.homepage-editorial-hero__headline\s*\{[\s\S]*?white-space:\s*nowrap;/
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
