import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { idleBillingQueries } from '@/tests/fixtures/idle-billing-queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CompactReleasePlanUpgradeCard,
  ReleasePlanUpgradeInterstitial,
  TasksWorkspaceUpgradeInterstitial,
} from './TasksUpgradeInterstitial';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: () => false,
}));

vi.mock('@/lib/queries', () => idleBillingQueries);

describe('TasksUpgradeInterstitial certificate', () => {
  it('dismisses the compact card through its secondary action', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { container } = render(
      <CompactReleasePlanUpgradeCard onDismiss={onDismiss} />
    );

    await user.click(screen.getByRole('button', { name: 'Maybe Later' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId('compact-release-plan-upgrade-card')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('gates the tasks workspace with an upgrade and a way back to releases', async () => {
    const { container } = render(<TasksWorkspaceUpgradeInterstitial />);

    expect(
      screen.getByRole('heading', { name: 'Upgrade to access Tasks' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Releases' })
    ).toHaveAttribute('href', expect.stringContaining('releases'));
    await expectNoA11yViolations(container);
  });

  it('falls back to "this release" when the title is empty', async () => {
    const { container } = render(
      <ReleasePlanUpgradeInterstitial releaseTitle='   ' />
    );

    expect(
      screen.getByText(
        'Upgrade to track the tasks for this release in one place.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long release title and the upgrade action in the release prompt', async () => {
    const title =
      'Skyline Dreams (Extended Club Mix featuring the Midnight Orchestra and Friends)';
    const { container } = render(
      <ReleasePlanUpgradeInterstitial releaseTitle={title} />
    );

    expect(
      screen.getByText(`Upgrade to track the tasks for ${title} in one place.`)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
