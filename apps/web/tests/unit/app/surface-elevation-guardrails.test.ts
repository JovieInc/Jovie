import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Surface elevation guardrails — prevent invisible cards.
 *
 * The main content area uses bg-(--linear-app-content-surface), a dedicated
 * shell canvas tone in dark mode.
 * Shared cards should use bg-surface-1; recessed wells should use bg-surface-0.
 * Semi-transparent surface backgrounds (bg-surface-1/XX) are nearly invisible.
 *
 * @see AGENTS.md → "Surface Elevation Rules"
 */

const ROOT = join(__dirname, '../../..');

function findMatches(
  pattern: RegExp,
  globs: string[]
): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];

  for (const glob of globs) {
    const files = globSync(glob, { cwd: ROOT });
    for (const file of files) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({ file, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }

  return results;
}

const APP_SHELL_GLOBS = [
  'app/app/**/*.tsx',
  'components/molecules/SettingsLoadingSkeleton.tsx',
  'components/organisms/AppShellSkeleton.tsx',
  'components/organisms/table/atoms/TableEmptyState.tsx',
  'components/organisms/EmptyState.tsx',
];

describe('surface elevation guardrails', () => {
  it('keeps the dark shell canvas separate from the shared card surface', () => {
    const designSystem = readFileSync(
      join(ROOT, 'styles/design-system.css'),
      'utf-8'
    );
    const linearTokens = readFileSync(
      join(ROOT, 'styles/linear-tokens.css'),
      'utf-8'
    );

    expect(designSystem).toMatch(
      /:root\.dark[\s\S]*--color-bg-surface-1:\s*var\(--linear-bg-surface-1\);/
    );
    expect(designSystem).toMatch(
      /:root\.dark[\s\S]*--sidebar-background:\s*var\(--linear-app-sidebar-background-rgb\);/
    );
    expect(linearTokens).toMatch(
      /:root\.dark[\s\S]*--linear-app-content-surface:\s*var\(--linear-bg-surface-0\);/
    );
    expect(linearTokens).toMatch(
      /:root\.dark[\s\S]*--linear-app-sidebar-background-rgb:\s*8 9 10;/
    );
  });

  it('keeps shared content cards on the card surface instead of the shell canvas', () => {
    const contentSurfaceCard = readFileSync(
      join(ROOT, 'components/molecules/ContentSurfaceCard.tsx'),
      'utf-8'
    );

    expect(contentSurfaceCard).toContain('bg-surface-1');
    expect(contentSurfaceCard).not.toContain(
      'bg-(--linear-app-content-surface)'
    );
  });

  it('routes shared shell wrappers through AppShellContentPanel', () => {
    const pageShell = readFileSync(
      join(ROOT, 'components/organisms/PageShell.tsx'),
      'utf-8'
    );
    const dashboardPanel = readFileSync(
      join(ROOT, 'components/organisms/AppShellContentPanel.tsx'),
      'utf-8'
    );
    const settingsLayout = readFileSync(
      join(ROOT, 'app/app/(shell)/settings/layout.tsx'),
      'utf-8'
    );
    const demoShowcaseSurface = readFileSync(
      join(ROOT, 'components/features/demo/DemoShowcaseSurface.tsx'),
      'utf-8'
    );
    const chatSurface = readFileSync(
      join(ROOT, 'components/jovie/ChatWorkspaceSurface.tsx'),
      'utf-8'
    );
    const demoAudience = readFileSync(
      join(ROOT, 'components/features/demo/DemoAudienceSection.tsx'),
      'utf-8'
    );

    expect(pageShell).toContain('AppShellContentPanel');
    expect(pageShell).toContain("frame = 'none'");
    expect(dashboardPanel).toContain("frame = 'content-container'");
    expect(dashboardPanel).toContain("'none'");
    expect(settingsLayout).toContain('PageShell');
    expect(settingsLayout).toContain("frame='none'");
    expect(chatSurface).toContain("frame='none'");
    expect(demoShowcaseSurface).toContain('AppShellContentPanel');
    expect(demoShowcaseSurface).toContain("frame='none'");
    expect(demoAudience).toContain('AppShellContentPanel');
    expect(demoAudience).toContain("frame='none'");
  });

  it('routes onboarding variants through OnboardingExperienceShell', () => {
    const onboardingForm = readFileSync(
      join(
        ROOT,
        'components/features/dashboard/organisms/onboarding-v2/OnboardingV2Form.tsx'
      ),
      'utf-8'
    );
    const onboardingLoading = readFileSync(
      join(ROOT, 'app/onboarding/loading.tsx'),
      'utf-8'
    );
    const demoOnboarding = readFileSync(
      join(ROOT, 'components/features/demo/OnboardingDemoContent.tsx'),
      'utf-8'
    );
    const demoShowcaseSurface = readFileSync(
      join(ROOT, 'components/features/demo/DemoShowcaseSurface.tsx'),
      'utf-8'
    );

    expect(onboardingForm).toContain('OnboardingExperienceShell');
    expect(onboardingLoading).toContain('OnboardingExperienceShell');
    expect(demoOnboarding).toContain('OnboardingExperienceShell');
    expect(demoShowcaseSurface).toContain('DemoOnboardingShowcase');
  });

  it('keeps the tasks workspace inside a framed content panel', () => {
    const tasksPage = readFileSync(
      join(ROOT, 'components/features/dashboard/tasks/TasksPageClient.tsx'),
      'utf-8'
    );
    const dashboardPanel = readFileSync(
      join(ROOT, 'components/organisms/AppShellContentPanel.tsx'),
      'utf-8'
    );

    expect(tasksPage).toContain('PageShell');
    expect(dashboardPanel).toContain("frame = 'content-container'");
    expect(tasksPage).toContain("data-testid='tasks-content-panel'");
  });

  it('keeps presence and earnings inside framed content panels', () => {
    const presenceView = readFileSync(
      join(
        ROOT,
        'components/features/dashboard/organisms/dsp-presence/DspPresenceView.tsx'
      ),
      'utf-8'
    );
    const earningsView = readFileSync(
      join(
        ROOT,
        'components/features/dashboard/dashboard-tipping/DashboardTipping.tsx'
      ),
      'utf-8'
    );

    expect(presenceView).toContain('PageShell');
    expect(presenceView).toContain("data-testid='dsp-presence-content-panel'");
    expect(earningsView).toContain('PageShell');
    expect(earningsView).toContain(
      "data-testid='dashboard-earnings-content-panel'"
    );
  });

  it('keeps task and preview cards off the shell canvas token', () => {
    const files = [
      'components/features/dashboard/layout/PreviewPanel.tsx',
      'components/features/dashboard/molecules/phone-mockup-preview/PhoneMockupPreview.tsx',
      'components/features/dashboard/organisms/DashboardPreview.tsx',
      'components/features/dashboard/organisms/ProfileEditPreviewCard.tsx',
      'components/features/dashboard/release-tasks/ReleaseTaskEmptyState.tsx',
      'components/features/dashboard/release-tasks/ReleaseTaskExplainerPopover.tsx',
      'components/features/dashboard/release-tasks/ReleaseTaskPage.tsx',
      'components/features/dashboard/tasks/TasksPageClient.tsx',
    ] as const;

    for (const file of files) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      expect(
        content,
        `${file} should use card/recessed surface tokens`
      ).not.toContain('bg-(--linear-app-content-surface)');
    }
  });

  it('keeps the desktop shell and drawer on distinct elevation tiers', () => {
    const shellFrame = readFileSync(
      join(ROOT, 'components/organisms/AppShellFrame.tsx'),
      'utf-8'
    );
    const sidebar = readFileSync(
      join(ROOT, 'components/organisms/sidebar/sidebar.tsx'),
      'utf-8'
    );
    const rightDrawer = readFileSync(
      join(ROOT, 'components/organisms/RightDrawer.tsx'),
      'utf-8'
    );
    const linearTokens = readFileSync(
      join(ROOT, 'styles/linear-tokens.css'),
      'utf-8'
    );
    const adminTableShell = readFileSync(
      join(ROOT, 'components/features/admin/table/AdminTableShell.tsx'),
      'utf-8'
    );

    expect(shellFrame).toContain('lg:shadow-[var(--linear-app-shell-shadow)]');
    expect(shellFrame).toContain('lg:ml-[var(--linear-app-shell-gap)]');
    expect(sidebar).toContain(
      'group-data-[variant=sidebar]:lg:shadow-[var(--linear-app-sidebar-shadow)]'
    );
    expect(linearTokens).toContain('--linear-app-sidebar-shadow:');
    expect(rightDrawer).toContain('bg-surface-0');
    // Mobile overlay retains shadow; desktop drawer is flat so elevation
    // comes from DrawerSurfaceCard cards inside the shell, not the outer aside.
    expect(rightDrawer).toContain('shadow-[var(--linear-app-drawer-shadow)]');
    // Desktop-only classes: no border, no radius — flat inline sidebar
    expect(rightDrawer).not.toContain(
      'lg:rounded-[var(--linear-app-shell-radius)]'
    );
    expect(rightDrawer).not.toContain('lg:border');
    expect(adminTableShell).toContain('bg-surface-1/96');
  });

  it('does not use semi-transparent bg-surface-1 in app shell (bg-surface-1/XX)', () => {
    // Semi-transparent surface-1 on a surface-1 parent is nearly invisible.
    // Use solid bg-surface-0 for recessed areas instead.
    // Pattern excludes hover/focus pseudo-class prefixes (hover:bg-surface-1/XX is OK)
    const matches = findMatches(/(?<![a-z]:)bg-surface-1\/\d/, APP_SHELL_GLOBS);

    expect(
      matches,
      `Found semi-transparent bg-surface-1/XX in app shell:\n${matches.map(m => `  ${m.file}:${m.line} → ${m.text}`).join('\n')}`
    ).toHaveLength(0);
  });

  it('does not use semi-transparent bg-surface-0 in app shell (bg-surface-0/XX)', () => {
    // Semi-transparent surface-0 should just be solid bg-surface-0.
    const matches = findMatches(/(?<![a-z]:)bg-surface-0\/\d/, APP_SHELL_GLOBS);

    expect(
      matches,
      `Found semi-transparent bg-surface-0/XX in app shell:\n${matches.map(m => `  ${m.file}:${m.line} → ${m.text}`).join('\n')}`
    ).toHaveLength(0);
  });

  it('does not nest DrawerEmptyState inside a card (card-within-card)', () => {
    // DrawerEmptyState should use variant='flat', not variant='card'.
    // It is always rendered inside an existing card container.
    const matches = findMatches(/DrawerEmptyState[\s\S]*variant=['"]card['"]/, [
      'components/molecules/drawer/DrawerEmptyState.tsx',
    ]);

    expect(
      matches,
      'DrawerEmptyState should use variant="flat" to avoid card-within-card nesting'
    ).toHaveLength(0);
  });
});
