import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUsageAlert } from './ChatUsageAlert';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
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
  });

  it('keeps rendering silent while the usage query is loading', () => {
    mockUseChatUsageQuery.mockReturnValue({ isLoading: true, data: null });

    const { container } = render(<ChatUsageAlert />);

    expect(container).toBeEmptyDOMElement();
  });
});
