import { describe, expect, it, vi } from 'vitest';
import { ChatUsageAlert } from '@/components/jovie/components/ChatUsageAlert';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries/useChatUsageQuery', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

describe('ChatUsageAlert', () => {
  it('shows warning state when near limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        remaining: 1,
        dailyLimit: 10,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { getByText } = fastRender(<ChatUsageAlert />);

    expect(getByText('You’re almost out of messages')).toBeDefined();
    expect(getByText(/You have 1 message left today/)).toBeDefined();
  });

  it('shows exhausted state with upgrade CTA', () => {
    mockUseChatUsageQuery.mockReturnValue({
      isLoading: false,
      data: {
        remaining: 0,
        dailyLimit: 100,
        isNearLimit: false,
        isExhausted: true,
      },
    });

    const { getByText, getByRole } = fastRender(<ChatUsageAlert />);

    expect(getByText('You’re out of messages for today')).toBeDefined();
    expect(getByRole('link', { name: 'Upgrade' })).toBeDefined();
  });
});
