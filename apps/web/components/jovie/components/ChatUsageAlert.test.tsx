import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatUsageAlert } from './ChatUsageAlert';

const mockUseChatUsageQuery = vi.fn();
const mockUpgrade = vi.fn();

vi.mock('@/lib/queries', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children: ReactNode }) => (
    <button type='button' onClick={() => mockUpgrade()}>
      {children}
    </button>
  ),
}));

vi.mock('@/lib/env-client', () => ({
  env: { IS_E2E: false },
}));

function mockUsage(
  data: Record<string, unknown> | null = {
    plan: 'free',
    used: 14,
    remaining: 1,
    weeklyLimit: 15,
    warningThreshold: 3,
    isNearLimit: true,
    isExhausted: false,
  }
) {
  mockUseChatUsageQuery.mockReturnValue({ isLoading: false, data });
}

describe('ChatUsageAlert', () => {
  beforeEach(() => {
    mockUseChatUsageQuery.mockReset();
    mockUpgrade.mockReset();
  });

  it('shows the exhausted plan limit as a notice, not an error', () => {
    mockUsage({
      plan: 'free',
      used: 15,
      remaining: 0,
      weeklyLimit: 15,
      warningThreshold: 3,
      isNearLimit: true,
      isExhausted: true,
    });
    const { container } = render(<ChatUsageAlert />);
    expect(container.querySelector('[data-variant]')).toHaveAttribute(
      'data-variant',
      'info'
    );
  });

  it('renders nothing while usage is healthy', () => {
    mockUsage({
      plan: 'free',
      used: 2,
      remaining: 13,
      weeklyLimit: 15,
      warningThreshold: 3,
      isNearLimit: false,
      isExhausted: false,
    });

    const { container } = render(<ChatUsageAlert />);

    expect(container).toBeEmptyDOMElement();
  });

  it('warns when the weekly allowance is nearly exhausted', () => {
    mockUsage();

    render(<ChatUsageAlert />);

    expect(
      screen.getByText("You're almost out of messages")
    ).toBeInTheDocument();
    expect(screen.getByText(/14 of 15 weekly messages/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
  });

  it('keeps rendering silent while the usage query is loading', () => {
    mockUseChatUsageQuery.mockReturnValue({ isLoading: true, data: null });

    const { container } = render(<ChatUsageAlert />);

    expect(container).toBeEmptyDOMElement();
  });

  it('starts the upgrade from the near-limit notice', async () => {
    mockUsage();
    const user = userEvent.setup();
    const { container } = render(<ChatUsageAlert />);

    await user.click(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    );

    expect(mockUpgrade).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('lets a paid plan reach View plans from the keyboard', async () => {
    mockUsage({
      plan: 'pro',
      used: 15,
      remaining: 0,
      weeklyLimit: 15,
      warningThreshold: 3,
      isNearLimit: true,
      isExhausted: true,
    });
    const user = userEvent.setup();
    const { container } = render(<ChatUsageAlert />);

    await user.tab();

    const viewPlans = screen.getByRole('link', { name: 'View plans' });
    expect(viewPlans).toHaveFocus();
    expect(viewPlans).toHaveAttribute('href', '/pricing');
    expect(
      screen.getByText(/refresh when the current window ends/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the last notice through a refetch instead of blanking', async () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      isFetching: true,
      data: {
        plan: 'free',
        used: 14,
        remaining: 1,
        weeklyLimit: 15,
        warningThreshold: 3,
        isNearLimit: true,
        isExhausted: false,
        _stale: true,
      },
    });

    const { container } = render(<ChatUsageAlert />);

    expect(
      screen.getByText("You're almost out of messages")
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
