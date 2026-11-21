import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/navigation', () => ({
  usePathname: () => '/demo/showcase/analytics',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/features/onboarding/OnboardingExperienceShell', () => ({
  OnboardingExperienceShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/organisms/AppShellContentPanel', () => ({
  AppShellContentPanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/features/dashboard/dashboard-pay', () => ({
  DashboardPay: () => null,
}));
vi.mock('@/features/dashboard/insights/InsightsPanel', () => ({
  InsightsPanelView: ({
    insights,
    selectedCategory,
    onCategoryChange,
  }: {
    insights: ReadonlyArray<{ id: string }>;
    selectedCategory: string;
    onCategoryChange: (value: 'all' | 'growth') => void;
  }) => (
    <div>
      <p data-testid='insight-count'>{insights.length}</p>
      <p data-testid='insight-category'>{selectedCategory}</p>
      <button type='button' onClick={() => onCategoryChange('growth')}>
        Show growth
      </button>
    </div>
  ),
}));
vi.mock('@/features/dashboard/organisms/GroupedLinksManager', () => ({
  GroupedLinksManager: () => null,
}));
vi.mock('@/features/dashboard/organisms/onboarding/OnboardingDspStep', () => ({
  OnboardingDspStep: () => null,
}));
vi.mock(
  '@/features/dashboard/organisms/onboarding/OnboardingHandleStep',
  () => ({
    OnboardingHandleStep: ({
      handleInput,
      onHandleChange,
    }: {
      handleInput: string;
      onHandleChange: (value: string) => void;
    }) => (
      <label>
        Handle
        <input
          value={handleInput}
          onChange={event => onHandleChange(event.target.value)}
        />
      </label>
    ),
  })
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
vi.mock('./DemoAuthShell', () => ({
  DemoAuthShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('./DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('./DemoReleaseLandingSurface', () => ({
  DemoReleaseLandingSurface: () => null,
}));
vi.mock('./DemoReleasePresaveSurface', () => ({
  DemoReleasePresaveSurface: () => null,
}));
vi.mock('./DemoReleasesExperience', () => ({
  DemoReleasesExperience: () => <p>Releases experience</p>,
}));
vi.mock('./DemoReleaseTasksSurface', () => ({
  DemoReleaseTasksSurface: () => null,
}));
vi.mock('./DemoReleaseTrackedLinksSurface', () => ({
  DemoReleaseTrackedLinksSurface: () => null,
}));
vi.mock('./DemoSettingsPanel', () => ({
  DemoSettingsPanel: () => <p>Settings panel</p>,
}));
vi.mock('./DemoTimWhiteProfileSurface', () => ({
  DemoTimWhiteProfileSurface: () => null,
}));
vi.mock('./SettingsDemoHarness', () => ({ SettingsDemoHarness: () => null }));

const { DemoShowcaseSurface } = await import('./DemoShowcaseSurface');

describe('DemoShowcaseSurface', () => {
  it('narrows the analytics insights when a category is chosen', async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoShowcaseSurface surface='analytics' />);

    expect(screen.getByTestId('insight-category')).toHaveTextContent('all');
    const allCount = Number(screen.getByTestId('insight-count').textContent);

    await user.click(screen.getByRole('button', { name: 'Show growth' }));

    expect(screen.getByTestId('insight-category')).toHaveTextContent('growth');
    expect(
      Number(screen.getByTestId('insight-count').textContent)
    ).toBeLessThanOrEqual(allCount);
    await expectNoA11yViolations(container);
  });

  it('keeps the typed onboarding handle across re-renders', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DemoShowcaseSurface surface='onboarding-handle' />
    );
    const input = screen.getByLabelText('Handle');

    await user.clear(input);
    await user.type(input, 'newhandle');
    rerender(<DemoShowcaseSurface surface='onboarding-handle' />);

    expect(screen.getByLabelText('Handle')).toHaveValue('newhandle');
    await expectNoA11yViolations(container);
  });

  it('renders the settings and releases surfaces without violations', async () => {
    const settings = render(<DemoShowcaseSurface surface='settings' />);
    expect(screen.getByText('Settings panel')).toBeInTheDocument();
    await expectNoA11yViolations(settings.container);
    settings.unmount();

    const releases = render(<DemoShowcaseSurface surface='releases' />);
    expect(screen.getByText('Releases experience')).toBeInTheDocument();
    await expectNoA11yViolations(releases.container);
  });
});
