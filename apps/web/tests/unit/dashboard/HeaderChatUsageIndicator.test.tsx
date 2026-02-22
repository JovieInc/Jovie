import { describe, expect, it, vi } from 'vitest';
import { HeaderChatUsageIndicator } from '@/components/dashboard/atoms/HeaderChatUsageIndicator';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries/useChatUsageQuery', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

describe('HeaderChatUsageIndicator', () => {
  it('renders nothing when usage is healthy', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        remaining: 12,
        isNearLimit: false,
        isExhausted: false,
      },
    });

    const { queryByRole } = fastRender(<HeaderChatUsageIndicator />);

    expect(queryByRole('link')).toBeNull();
  });

  it('renders near-limit copy in header', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        remaining: 2,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { getByRole, getByText } = fastRender(<HeaderChatUsageIndicator />);

    expect(getByRole('link')).toBeDefined();
    expect(getByText('2 messages left')).toBeDefined();
  });
});
