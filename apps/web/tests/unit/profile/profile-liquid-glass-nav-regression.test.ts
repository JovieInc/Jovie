import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const NAV = readFileSync(
  join(WEB_ROOT, 'components/features/profile/nav/BottomTabBar.tsx'),
  'utf8'
);
const SURFACE = readFileSync(
  join(
    WEB_ROOT,
    'components/features/profile/templates/ProfileCompactSurface.tsx'
  ),
  'utf8'
);
const CSS = readFileSync(join(WEB_ROOT, 'styles/design-system.css'), 'utf8');

describe('public profile Liquid Glass navigation', () => {
  it('renders one floating navigation material with no nested glass', () => {
    expect(NAV).toContain('profile-floating-tab-bar');
    expect(NAV).toContain(
      'profile-liquid-glass-nav h-8 rounded-full border px-1 shadow-(--profile-dock-shadow) backdrop-blur-xl backdrop-saturate-150'
    );
    expect(SURFACE).toContain('CONTENT_SAFE_AREA_BOTTOM_PADDING');
    expect(CSS).toMatch(
      /\.profile-floating-tab-bar\)[\s\S]{0,180}position:\s*absolute[\s\S]{0,120}pointer-events:\s*none/
    );
    expect(CSS).not.toMatch(
      /\.profile-liquid-glass-nav__item\)[\s\S]{0,420}backdrop-filter/
    );
  });

  it('keeps a 32px visual rail, explicit 44px targets, icon-only labels, and one active page', () => {
    expect(NAV).toContain('profile-liquid-glass-nav__grid -my-1.5 grid h-11');
    expect(NAV).toContain(
      'profile-liquid-glass-nav__item relative flex h-full'
    );
    expect(NAV).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(NAV).toContain('profile-liquid-glass-nav__label sr-only');
    expect(NAV).toContain('profile-liquid-glass-nav__icon h-4 w-4');
    expect(CSS).toMatch(
      /\.profile-liquid-glass-nav\)[\s\S]{0,120}height:\s*var\(--space-8\)/
    );
    expect(CSS).toMatch(
      /\.profile-liquid-glass-nav__grid\)[\s\S]{0,140}height:\s*var\(--space-11\)[\s\S]{0,80}margin-block:\s*calc\(var\(--space-1-5\) \* -1\)/
    );
    expect(CSS).toMatch(
      /:where\(\.profile-liquid-glass-nav__item\)::before[\s\S]{0,240}height:\s*var\(--space-8\)/
    );
    expect(CSS).not.toMatch(
      /\.profile-liquid-glass-nav__label\)[\s\S]{0,520}(?:position:\s*static|width:\s*auto|height:\s*auto|overflow:\s*visible|clip:\s*auto|clip-path:\s*none)/
    );
  });

  it('has reduced transparency, contrast, forced-colors, and motion fallbacks', () => {
    expect(CSS).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(CSS).toContain(
      ':root[data-reduced-transparency="true"] .profile-liquid-glass-nav'
    );
    expect(CSS).toContain('@media (prefers-contrast: more)');
    expect(CSS).toContain('@media (forced-colors: active)');
    expect(CSS).toMatch(
      /prefers-reduced-transparency:\s*reduce[\s\S]{0,260}--tw-backdrop-blur:\s*initial[\s\S]{0,100}backdrop-filter:\s*none/
    );
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]{0,260}profile-liquid-glass-nav[\s\S]{0,200}transition:\s*none/
    );
  });
});
