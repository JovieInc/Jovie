import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { NudgeState } from '@/lib/queries/usePlanGate';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  nudgeState: 'never_trialed' as NudgeState,
  onUpgrade: vi.fn(),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { children: ReactNode }) => (
    <button type='button' onClick={mocks.onUpgrade}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/queries/usePlanGate', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/queries/usePlanGate')
  >('@/lib/queries/usePlanGate');
  return {
    ...actual,
    usePlanGate: () => ({ nudgeState: mocks.nudgeState }),
  };
});

import { SmartLinkGateBanner } from './SmartLinkGateBanner';

describe('SmartLinkGateBanner certificate', () => {
  it('offers a support email link at the soft cap', async () => {
    mocks.nudgeState = 'never_trialed';
    const { container } = render(
      <SmartLinkGateBanner mode='soft-cap' releasedCount={124} softCap={100} />
    );

    expect(
      screen.getByRole('complementary', { name: 'Smart link limit notice' })
    ).toBeInTheDocument();
    expect(screen.getByText('You have 124 smart links')).toBeInTheDocument();
    expect(
      screen.getByText('Need more than 100? Request a higher limit.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email support' })).toHaveAttribute(
      'href',
      'mailto:support@jov.ie?subject=Smart%20link%20limit%20increase%20request'
    );
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hands the unreleased prompt to the shared upgrade button', async () => {
    mocks.nudgeState = 'never_trialed';
    mocks.onUpgrade.mockClear();
    const user = userEvent.setup();
    const { container } = render(
      <SmartLinkGateBanner mode='unreleased' unreleasedCount={2} />
    );

    expect(
      screen.getByRole('complementary', { name: 'Smart link upgrade prompt' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('You have 2 upcoming releases')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );
    expect(mocks.onUpgrade).toHaveBeenCalledTimes(1);
  });

  it.each<[NudgeState, string, string]>([
    [
      'trial_late',
      '1 upcoming release after your trial',
      'Lock in Artist Presence',
    ],
    ['recently_lapsed', '1 upcoming release', 'Reclaim Artist Presence'],
    ['stale_lapsed', '1 upcoming release', 'Get Artist Presence'],
  ])('adapts the copy for %s', async (state, headline, cta) => {
    mocks.nudgeState = state;
    const { container } = render(
      <SmartLinkGateBanner mode='unreleased' unreleasedCount={1} />
    );

    expect(screen.getByText(headline)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: cta })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
