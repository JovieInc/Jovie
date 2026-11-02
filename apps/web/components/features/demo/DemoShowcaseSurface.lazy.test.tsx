import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const registryState = vi.hoisted(() => ({ loaded: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/demo/showcase/shell-lyrics',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/design-studio/registry', () => {
  registryState.loaded = true;
  return {
    getDesignStudioItem: (id: string) =>
      id === 'lyrics-view'
        ? { preview: () => <h1>Lyrics preview</h1> }
        : undefined,
  };
});

// Other surfaces are covered by their behavior suites; this isolates preview loading.
vi.mock('@/components/features/onboarding/OnboardingExperienceShell', () => ({
  OnboardingExperienceShell: () => null,
}));
vi.mock('@/components/organisms/AppShellContentPanel', () => ({
  AppShellContentPanel: () => null,
}));
vi.mock('@/features/dashboard/dashboard-pay', () => ({
  DashboardPay: () => null,
}));
vi.mock('@/features/dashboard/insights/InsightsPanel', () => ({
  InsightsPanelView: () => null,
}));
vi.mock('@/features/dashboard/organisms/GroupedLinksManager', () => ({
  GroupedLinksManager: () => null,
}));
vi.mock('@/features/dashboard/organisms/onboarding/OnboardingDspStep', () => ({
  OnboardingDspStep: () => null,
}));
vi.mock(
  '@/features/dashboard/organisms/onboarding/OnboardingHandleStep',
  () => ({ OnboardingHandleStep: () => null })
);
vi.mock(
  '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep',
  () => ({ OnboardingProfileReviewStep: () => null })
);
vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState',
  () => ({ ReleasesEmptyState: () => null })
);
vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView',
  () => ({ ShellReleasesView: () => null })
);
vi.mock('./DemoAuthShell', () => ({ DemoAuthShell: () => null }));
vi.mock('./DemoClientProviders', () => ({ DemoClientProviders: () => null }));
vi.mock('./DemoReleaseLandingSurface', () => ({
  DemoReleaseLandingSurface: () => null,
}));
vi.mock('./DemoReleasePresaveSurface', () => ({
  DemoReleasePresaveSurface: () => null,
}));
vi.mock('./DemoReleasesExperience', () => ({
  DemoReleasesExperience: () => null,
}));
vi.mock('./DemoReleaseTasksSurface', () => ({
  DemoReleaseTasksSurface: () => null,
}));
vi.mock('./DemoReleaseTrackedLinksSurface', () => ({
  DemoReleaseTrackedLinksSurface: () => null,
}));
vi.mock('./DemoSettingsPanel', () => ({ DemoSettingsPanel: () => null }));
vi.mock('./DemoTimWhiteProfileSurface', () => ({
  DemoTimWhiteProfileSurface: () => null,
}));
vi.mock('./SettingsDemoHarness', () => ({ SettingsDemoHarness: () => null }));

const { DemoShowcaseSurface } = await import('./DemoShowcaseSurface');

describe('demo showcase preview loading', () => {
  it('defers design previews until a design surface is requested', async () => {
    expect(registryState.loaded).toBe(false);

    render(<DemoShowcaseSurface surface='shell-lyrics' />);

    expect(
      await screen.findByRole('heading', { name: 'Lyrics preview' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('demo-showcase-shell-lyrics')).toBeVisible();
    expect(registryState.loaded).toBe(true);
  });

  it('keeps missing preview IDs fail-closed', async () => {
    const { DemoDesignStudioShowcase } = await import(
      './DemoDesignStudioShowcase'
    );

    expect(() =>
      DemoDesignStudioShowcase({ itemId: 'missing', testId: 'missing-preview' })
    ).toThrow('Missing Design Studio item: missing');
  });
});
