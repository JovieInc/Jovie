import { describe, expect, it, vi } from 'vitest';
import { HeaderChatUsageIndicator } from '@/features/dashboard/atoms/HeaderChatUsageIndicator';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseChatUsageQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/app/chat');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

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
        plan: 'free',
        remaining: 2,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { getByRole, getByText } = fastRender(<HeaderChatUsageIndicator />);

    expect(getByRole('link')).toBeDefined();
    expect(getByText('2 messages left')).toBeDefined();
  });

  it('renders healthy paid plan usage in header', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        plan: 'pro',
        remaining: 42,
        isNearLimit: false,
        isExhausted: false,
      },
    });

    const { getByRole, getByText } = fastRender(<HeaderChatUsageIndicator />);

    expect(getByRole('link')).toBeDefined();
    expect(getByText('Pro')).toBeDefined();
    expect(getByText('42 messages left')).toBeDefined();
  });

  it('suppresses the banner on nested demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        remaining: 1,
        isNearLimit: true,
        isExhausted: false,
      },
    });

    const { queryByRole } = fastRender(<HeaderChatUsageIndicator />);

    expect(queryByRole('link')).toBeNull();
  });
});
