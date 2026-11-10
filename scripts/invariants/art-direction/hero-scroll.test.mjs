import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkHero, heroViolations } from './hero-scroll.mjs';

const FILE = 'apps/web/components/marketing/Hero.tsx';

describe('hero scroll', () => {
  it('flags wheel preventDefault and a pinned dead zone', () => {
    const source = [
      "el.addEventListener('wheel', event => { event.preventDefault(); });",
      'position: sticky; touch-action: none;',
      '@media (prefers-reduced-motion: reduce) { .hero { animation: none; } }',
    ].join('\n');
    assert.deepEqual(heroViolations(source, FILE), [
      `scroll-hijack:${FILE}`,
      `pinned-dead-zone:${FILE}`,
    ]);
  });

  it('requires prefers-reduced-motion on a hero animation', () => {
    assert.deepEqual(
      heroViolations('@keyframes rise { from { opacity: 0; } }', 'hero.css'),
      ['reduced-motion:hero.css']
    );
    assert.deepEqual(
      heroViolations(
        '@keyframes rise {} @media (prefers-reduced-motion: reduce) { .hero { animation: none; } }',
        'hero.css'
      ),
      []
    );
  });

  it('allows the homepage hero native scroll zoom-out', () => {
    const css = [
      '.home-viewport--hero-canvas .homepage-hero-canvas__bar { position: fixed; }',
      '@keyframes homepage-hero-canvas-progress {',
      '  from { --hero-canvas-progress: 0; }',
      '  to { --hero-canvas-progress: 1; }',
      '}',
      '@supports (animation-timeline: scroll()) {',
      '  @media (prefers-reduced-motion: no-preference) {',
      '    .homepage-hero-canvas {',
      '      animation: homepage-hero-canvas-progress linear both;',
      '      animation-timeline: scroll(root);',
      '      animation-range: 0px 42svh;',
      '    }',
      '  }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .homepage-hero-canvas { animation: none; }',
      '}',
    ].join('\n');
    const scroll = [
      "if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};",
      'const apply = () => {',
      '  root.style.setProperty("--hero-canvas-progress", String(view.scrollY));',
      '};',
      "view.addEventListener('scroll', apply, { passive: true });",
    ].join('\n');
    const frameLoop = 'frame = requestAnimationFrame(draw);';
    assert.deepEqual(
      heroViolations(
        css,
        'apps/web/components/homepage/hero-light/HomepageHeroCanvas.css'
      ),
      []
    );
    assert.deepEqual(
      heroViolations(
        scroll,
        'apps/web/components/homepage/hero-light/hero-light-scroll.ts'
      ),
      []
    );
    assert.deepEqual(
      heroViolations(
        frameLoop,
        'apps/web/components/homepage/hero-light/hero-light-gl.ts'
      ),
      []
    );
    assert.deepEqual(
      heroViolations(
        `${css}\n.homepage-hero-canvas__bar { touch-action: none; }`,
        'apps/web/components/homepage/hero-light/HomepageHeroCanvas.css'
      ),
      [
        'pinned-dead-zone:apps/web/components/homepage/hero-light/HomepageHeroCanvas.css',
      ]
    );
  });

  it('matches the shrink-only baseline', () => {
    assert.deepEqual(checkHero().failures, []);
  });
});
