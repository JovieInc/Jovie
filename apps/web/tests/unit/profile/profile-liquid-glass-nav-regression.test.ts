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
const PAC = readFileSync(
  join(WEB_ROOT, 'components/features/profile/pac/ProfilePacCard.tsx'),
  'utf8'
);

describe('public profile Liquid Glass navigation', () => {
  it('renders one floating navigation material with no nested glass', () => {
    expect(NAV).toContain('profile-floating-tab-bar');
    expect(NAV).toContain(
      "className='profile-liquid-glass-nav h-8 rounded-full border px-1'"
    );
    // The bar owns the only backdrop-filter; the shared lens and the tab
    // cells are tint only.
    expect(CSS).toMatch(
      /:where\(\.profile-liquid-glass-nav\) \{[^}]*\bbackdrop-filter:\s*blur\(var\(--liquid-glass-blur\)\)/
    );
    expect(CSS).not.toMatch(
      /:where\(\.profile-liquid-glass-nav__lens\) \{[^}]*backdrop-filter/
    );
    expect(NAV.match(/profile-bottom-nav-indicator/g)).toHaveLength(1);
    expect(SURFACE).toContain('CONTENT_SAFE_AREA_BOTTOM_PADDING');
    expect(CSS).toMatch(
      /\.profile-floating-tab-bar\)[\s\S]{0,180}position:\s*absolute[\s\S]{0,120}pointer-events:\s*none/
    );
    expect(CSS).not.toMatch(
      /\.profile-liquid-glass-nav__item\)[\s\S]{0,420}backdrop-filter/
    );
  });

  it('keeps a 32px visual rail, explicit 44px targets, icon-only labels, and one active page', () => {
    expect(NAV).toContain(
      'profile-liquid-glass-nav__grid relative -my-1.5 grid h-11'
    );
    expect(NAV).toContain(
      'profile-liquid-glass-nav__item relative flex h-full'
    );
    expect(NAV).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(NAV).toContain('profile-liquid-glass-nav__label sr-only');
    expect(NAV).toContain('profile-liquid-glass-nav__icon h-4 w-4');
    expect(CSS).toMatch(
      /\.profile-liquid-glass-nav\)[\s\S]{0,120}height:\s*var\(--space-8\)/
    );
    // 44px hit row centered on the 30px content box inside the 1px border.
    expect(CSS).toMatch(
      /\.profile-liquid-glass-nav__grid\)[\s\S]{0,140}height:\s*var\(--space-11\)[\s\S]{0,200}margin-block:\s*calc\(\s*\(var\(--space-8\) - var\(--space-px\) \* 2 - var\(--space-11\)\)\s*\/\s*2\s*\)/
    );
    // Compact visible lens (28px) inside the 32px rail.
    expect(CSS).toMatch(
      /:where\(\.profile-liquid-glass-nav__lens\) \{[^}]*height:\s*var\(--space-7\)/
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

  it('renders the PAC listen slot as flat glass from the tab bar lens material', () => {
    // The rail listen slot keeps the glass tone; the featured mode card
    // swaps the face to the neutral card CTA through `shape`.
    expect(PAC).toMatch(
      /<PrimaryPill shape=\{pillShape\} tone='glass' href=\{listenHref\}>\s*\{isFeatured \? 'Listen now' : 'Listen'\}/
    );
    expect(PAC).toMatch(
      /<PrimaryPill\s+shape=\{pillShape\}\s+tone='glass'\s+href=\{listenHref\}\s+onClick=\{handlePlayClick\}/
    );
    expect(PAC).toContain("? 'profile-glass-pill'");
    const pill =
      CSS.match(/:where\(\.profile-glass-pill\) \{[^}]*\}/)?.[0] ?? '';
    expect(pill).toContain('var(--profile-dock-lens-bg)');
    expect(pill).toContain('var(--profile-dock-lens-rim)');
    // Flat: no nested blur and no heavy drop shadow; geometry via inset only.
    expect(pill).not.toContain('backdrop-filter');
    expect(pill).not.toMatch(/box-shadow:[^;]*\b0 \d+px \d+px/);
    expect(CSS).toContain(':root.high-contrast .profile-glass-pill');
  });

  it('renders the identity Listen action as the flat frosted variant of the same glass', () => {
    const flat =
      CSS.match(/:where\(\.profile-glass-pill--flat\) \{[^}]*\}/)?.[0] ?? '';
    // Same dock tokens as the lens, no second glass recipe.
    expect(flat).toContain('var(--profile-dock-lens-bg)');
    expect(flat).toContain('var(--profile-dock-border)');
    expect(flat).toContain('border-radius: 10px');
    expect(flat).toContain('backdrop-filter: blur(var(--space-4))');
    // Flat: no sheen gradient, no top-rim bevel, no drop shadow.
    expect(flat).not.toContain('linear-gradient');
    expect(flat).not.toContain('--profile-dock-lens-rim');
    expect(flat).not.toMatch(/box-shadow:[^;]*\b0 \d+px \d+px/);
    // Reduced transparency and high contrast drop the blur.
    expect(CSS).toContain(':root.high-contrast .profile-glass-pill--flat');
  });
});
