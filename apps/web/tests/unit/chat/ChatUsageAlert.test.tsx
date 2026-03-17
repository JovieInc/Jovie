import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUsageAlert } from '@/components/jovie/components/ChatUsageAlert';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries/useChatUsageQuery', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

describe('ChatUsageAlert', () => {
  beforeEach(() => {
    mockUseChatUsageQuery.mockReset();
  });

  it('shows warning state when near limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'free',
        used: 9,
        remaining: 1,
        dailyLimit: 10,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { getByText } = fastRender(<ChatUsageAlert />);

    expect(getByText("You're almost out of messages")).toBeDefined();
    expect(getByText(/9 of 10 daily messages/)).toBeDefined();
  });

  it('shows exhausted state with upgrade CTA', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'free',
        used: 100,
        remaining: 0,
        dailyLimit: 100,
        isNearLimit: false,
        isExhausted: true,
      },
    });

    const { getByText, getByRole } = fastRender(<ChatUsageAlert />);

    expect(getByText("You're out of messages for today")).toBeDefined();
    expect(getByRole('button', { name: /Upgrade to Pro/ })).toBeDefined();
  });

  it('shows view plans button for pro users at limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'pro',
        used: 100,
        remaining: 0,
        dailyLimit: 100,
        isNearLimit: false,
        isExhausted: true,
      },
    });

    const { getByText, getByRole } = fastRender(<ChatUsageAlert />);

    expect(
      getByText(/Come back tomorrow when your quota refreshes/)
    ).toBeDefined();
    expect(getByRole('link', { name: 'View plans' })).toBeDefined();
  });
});
