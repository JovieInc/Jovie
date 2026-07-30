import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function readWeb(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('shared press-motion contract', () => {
  it('keeps the canonical press scale subtle and reduced-motion safe', () => {
    const designSystem = readWeb('styles/design-system.css');
    const button = readFileSync(
      join(REPO_ROOT, 'packages/ui/atoms/button.tsx'),
      'utf8'
    );

    expect(designSystem).toMatch(/--scale-press:\s*0\.98;/);
    expect(button).toContain('active:scale-[var(--scale-press)]');
    expect(button).toContain('motion-reduce:active:scale-100');
    expect(button).not.toContain('active:scale-[0.96]');
    expect(button).toContain('pressFeedback = false');
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
    expect(globals).toContain(
      'active:scale-[var(--scale-press)] motion-reduce:active:scale-100'
    );
  });

  it('keeps immediate-state controls static and remaining press feedback at 0.98', () => {
    const bottomTabs = readWeb(
      'components/features/profile/nav/BottomTabBar.tsx'
    );
    const entityCard = readWeb(
      'components/organisms/entity-card/EntityCard.tsx'
    );

    expect(bottomTabs).not.toContain('active:scale');
    expect(bottomTabs).not.toContain('transition-[color,transform]');
    expect(entityCard).toContain('group-active:scale-[var(--scale-press)]');
    expect(entityCard).not.toContain('group-active:scale-[0.96]');
  });

  it.each([
    'components/features/dashboard/organisms/DashboardHeader.tsx',
    'components/features/dashboard/dashboard-nav/NavMenuItem.tsx',
    'components/organisms/user-button/UserButton.tsx',
    'components/jovie/components/SlashCommandMenu.tsx',
    'components/jovie/components/ChatComposerToolbar.tsx',
    'components/jovie/components/ChatMessage.tsx',
    'components/features/pricing/PricingCTA.tsx',
  ])('%s does not fork hardcoded press or hover scaling', relativePath => {
    const source = readWeb(relativePath);

    expect(source).not.toMatch(/active:scale-\[(?!var\(--scale-press\))/);
    expect(source).not.toMatch(/whileTap=\{\{\s*scale:/);
    expect(source).not.toMatch(/whileHover=\{\{\s*scale:/);
  });

  it('routes the representative standalone CTA through the shared Button primitive', () => {
    const pricingCta = readWeb('components/features/pricing/PricingCTA.tsx');

    expect(pricingCta).toContain("import { Button } from '@jovie/ui'");
    expect(pricingCta).toContain('<Button');
    expect(pricingCta).not.toContain('<motion.button');
  });
});
