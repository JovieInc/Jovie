import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUsageAlert } from '@/components/jovie/components/ChatUsageAlert';
import { fastRender } from '@/tests/utils/fast-render';

const appRoot = resolve(__dirname, '../../..');

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

  it('keeps ChatUsageAlert as the canonical weekly usage alert owner', () => {
    const chatUsageAlertSource = readFileSync(
      resolve(appRoot, 'components/jovie/components/ChatUsageAlert.tsx'),
      'utf8'
    );

    expect(chatUsageAlertSource).toContain('getChatUsageCopy');
    expect(chatUsageAlertSource).toContain('aiWeeklyMessageLimit');
    expect(chatUsageAlertSource).toContain('useChatUsageQuery');
  });

  it('shows warning state when near limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'free',
        used: 9,
        remaining: 1,
        weeklyLimit: 15,
        warningThreshold: 3,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { getByText } = fastRender(<ChatUsageAlert />);

    expect(getByText("You're almost out of messages")).toBeInTheDocument();
    expect(getByText(/9 of 15 weekly messages/)).toBeInTheDocument();
  });

  it('shows exhausted state with upgrade CTA', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'free',
        used: 15,
        remaining: 0,
        weeklyLimit: 15,
        warningThreshold: 3,
        isNearLimit: false,
        isExhausted: true,
      },
    });

    const { getByText, getByRole } = fastRender(<ChatUsageAlert />);

    expect(
      getByText("You're out of messages for this week")
    ).toBeInTheDocument();
    expect(getByRole('button', { name: /Upgrade to Pro/ })).toBeInTheDocument();
  });

  it('shows view plans button for pro users at limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        plan: 'pro',
        used: 70,
        remaining: 0,
        weeklyLimit: 70,
        warningThreshold: 14,
        isNearLimit: false,
        isExhausted: true,
      },
    });

    const { getByText, getByRole } = fastRender(<ChatUsageAlert />);

    expect(
      getByText(/messages refresh when the current window ends/)
    ).toBeInTheDocument();
    expect(getByRole('link', { name: 'View plans' })).toBeInTheDocument();
  });
});
