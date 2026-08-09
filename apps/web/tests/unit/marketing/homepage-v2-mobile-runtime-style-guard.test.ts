/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsSource = readFileSync(
  resolve(process.cwd(), 'app/globals.css'),
  'utf8'
);
const routeStyles = readFileSync(
  resolve(
    process.cwd(),
    'components/marketing/homepage-v2/HomepageV2Route.css'
  ),
  'utf8'
);

describe('/new mobile runtime style guard', () => {
  it('only lets a route-owned profile viewport lock the document', () => {
    expect(globalsSource).toContain('html:has(> body > .profile-viewport)');
    expect(globalsSource).toContain('body:has(> .profile-viewport)');
    expect(globalsSource).not.toContain('html:has(.profile-viewport)');
    expect(globalsSource).not.toContain('body:has(.profile-viewport)');

    document.body.innerHTML = `
      <main>
        <div class="phone-preview">
          <div class="profile-viewport"></div>
        </div>
      </main>
    `;
    expect(document.body.matches('body:has(> .profile-viewport)')).toBe(false);

    document.body.innerHTML = '<div class="profile-viewport"></div>';
    expect(document.body.matches('body:has(> .profile-viewport)')).toBe(true);
  });

  it('names every decorative hero animation in the reduced-motion override', () => {
    const reducedMotionStyles = routeStyles
      .split('@media (prefers-reduced-motion: reduce) {')[1]
      ?.split('.homepage-v2-hero__shot-a-frame')[0];

    expect(reducedMotionStyles).toBeDefined();
    expect(reducedMotionStyles).toContain('.homepage-v2-hero__phone-float,');
    expect(reducedMotionStyles).toContain('.homepage-v2-hero__shot {');
    expect(reducedMotionStyles).toContain('animation: none;');
    expect(reducedMotionStyles).toContain(
      'transform: rotate(var(--drift-rotate, 0deg));'
    );
  });
});
