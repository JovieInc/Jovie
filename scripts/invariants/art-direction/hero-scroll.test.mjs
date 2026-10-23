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
    assert.deepEqual(heroViolations('@keyframes rise { from { opacity: 0; } }', 'hero.css'), [
      'reduced-motion:hero.css',
    ]);
    assert.deepEqual(
      heroViolations(
        '@keyframes rise {} @media (prefers-reduced-motion: reduce) { .hero { animation: none; } }',
        'hero.css'
      ),
      []
    );
  });

  it('matches the shrink-only baseline', () => {
    assert.deepEqual(checkHero().failures, []);
  });
});
