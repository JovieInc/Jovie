import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageLimitUpgradePrompt } from '@/components/molecules/UsageLimitUpgradePrompt';

const trackMock = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

describe('UsageLimitUpgradePrompt', () => {
  beforeEach(() => {
    trackMock.mockClear();
  });

  it('stays hidden below the warning boundary', () => {
    const { container } = render(
      <UsageLimitUpgradePrompt
        current={11}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('shows an upgrade at the warning boundary', () => {
    render(
      <UsageLimitUpgradePrompt
        current={12}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '12 of 15 weekly messages used'
    );
    expect(
      screen.getByRole('link', { name: /upgrade to pro/i })
    ).toHaveAttribute('href', '/pricing');
    expect(trackMock).toHaveBeenCalledWith('usage_limit_upgrade_shown', {
      feature: 'weekly messages',
      current: 12,
      limit: 15,
      percentage: 80,
    });
  });

  it('uses exhausted copy at the limit', () => {
    render(
      <UsageLimitUpgradePrompt
        current={15}
        limit={15}
        featureName='weekly messages'
        upgradeCopy='70 messages per week'
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'weekly messages limit reached'
    );
  });
});
