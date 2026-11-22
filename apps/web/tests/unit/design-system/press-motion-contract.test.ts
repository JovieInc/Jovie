import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function readWeb(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

/**
 * Drift W1 / T0.5: `--scale-press: 0.98` is the cross-platform SoT. Native
 * projection lands in T4.1; this suite locks the web emitter + consumers.
 */
describe('shared press-motion contract', () => {
  it('keeps the canonical press scale subtle and reduced-motion safe', () => {
    const designSystem = readWeb('styles/design-system.css');
    const button = readFileSync(
      join(REPO_ROOT, 'packages/ui/atoms/button.tsx'),
      'utf8'
    );
    const nativeTheme = readFileSync(
      join(REPO_ROOT, 'apps/ios/Jovie/DesignSystem/JovieTheme.swift'),
      'utf8'
    );
    const nativeManifest = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'apps/ios/scripts/native-design-system.manifest.json'),
        'utf8'
      )
    );

    expect(designSystem).toMatch(/--scale-press:\s*0\.98;/);
    expect(button).toMatch(/tracking-normal press /);
    expect(button).not.toContain('active:scale-');
    expect(button).not.toContain('active:scale-[0.96]');
    expect(nativeManifest.motionBindings).toEqual([
      ['pressScale', '--scale-press'],
    ]);
    expect(nativeTheme).toContain('static let pressScale: CGFloat = 0.98');
  });

  it('does not scale every interactive element globally', () => {
    const globals = readWeb('app/globals.css');

    expect(globals).not.toContain('transform: scale(0.96)');
    expect(globals).not.toContain('active:scale-[0.96]');
    expect(globals).not.toContain(
      'button:not(:disabled):not([data-static="true"])'
    );
    expect(globals).not.toContain(
      '[role="button"]:not([aria-disabled="true"]):not([data-static="true"])'
    );
    expect(globals).not.toContain('active:scale-press');
    expect(globals).toContain('@apply press;');
  });

  it('defines one press utility: instant down, spring release, reduced-motion darken only', () => {
    const foundation = readWeb('styles/tailwind-foundation.css');
    const designSystem = readWeb('styles/design-system.css');
    const utility = foundation.slice(foundation.indexOf('@utility press {'));

    expect(foundation).toMatch(/--press-brightness:\s*0\.94;/);
    expect(foundation).toMatch(
      /--press-release-duration:\s*var\(--duration-normal\);/
    );
    expect(foundation).toMatch(
      /--ease-press-release:\s*cubic-bezier\(0\.34, 1\.3, 0\.64, 1\);/
    );
    // design-system.css only owns the scale; the press tokens live here.
    expect(designSystem).not.toContain('--press-brightness');
    expect(utility).toContain('scale: var(--scale-press);');
    expect(utility).toContain('filter: brightness(var(--press-brightness));');
    expect(utility).toContain('transition-duration: 0s;');
    for (const gate of [
      ':disabled',
      '[aria-disabled=',
      '[data-static=',
      '[aria-busy=',
    ]) {
      expect(utility).toContain(gate);
    }
    const reduced = utility.slice(utility.indexOf('prefers-reduced-motion'));
    expect(reduced).toContain('scale: none;');
    expect(reduced).not.toContain('brightness');
  });

  it('keeps immediate-state and carousel controls static while remaining press feedback stays at 0.98', () => {
    const bottomTabs = readWeb(
      'components/features/profile/nav/BottomTabBar.tsx'
    );
    const entityCard = readWeb(
      'components/organisms/entity-card/EntityCard.tsx'
    );
    const smartLinkAudioPreview = readWeb(
      'components/features/release/SmartLinkAudioPreview.tsx'
    );
    const homepagePosterHero = readWeb(
      'components/marketing/MarketingPosterHero.tsx'
    );
    const captureShared = readWeb(
      'components/marketing/artist-profile/captureShared.tsx'
    );
    const jovieOverlay = readWeb('components/shell/JovieOverlay.tsx');

    expect(bottomTabs).not.toContain('active:scale');
    expect(bottomTabs).not.toContain('transition-[color,transform]');
    expect(entityCard).not.toContain('group-active:scale');
    expect(entityCard).not.toContain('transition-[background-color,transform]');
    expect(smartLinkAudioPreview).not.toContain('active:scale');
    expect(homepagePosterHero).not.toContain('active:scale');
    expect(captureShared).not.toContain('scale-[0.96]');
    expect(captureShared).not.toContain(
      'transition-[background-color,color,transform]'
    );
    expect(jovieOverlay).not.toContain('scale(0.96)');
    expect(jovieOverlay).toContain('useReducedMotion');
    expect(jovieOverlay).toMatch(
      /prefersReducedMotion\s*\?\s*'translateY\(0\)'/
    );
  });

  it.each([
    'components/features/dashboard/organisms/DashboardHeader.tsx',
    'components/features/dashboard/dashboard-nav/NavMenuItem.tsx',
    'components/organisms/user-button/UserButton.tsx',
    'components/jovie/components/SlashCommandMenu.tsx',
    'components/jovie/components/ChatComposerToolbar.tsx',
    'components/jovie/components/ChatMessage.tsx',
  ])('%s does not fork hardcoded press or hover scaling', relativePath => {
    const source = readWeb(relativePath);

    expect(source).not.toMatch(/active:scale-\[(?!var\(--scale-press\))/);
    expect(source).not.toMatch(/whileTap=\{\{\s*scale:/);
    expect(source).not.toMatch(/whileHover=\{\{\s*scale:/);
  });
});
