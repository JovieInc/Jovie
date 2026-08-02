import { TooltipProvider } from '@jovie/ui';
import { describe, expect, it, vi } from 'vitest';
import { HeaderChatUsageIndicator } from '@/features/dashboard/atoms/HeaderChatUsageIndicator';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseChatUsageQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/app/chat');

const usage = {
  plan: 'pro' as const,
  dailyLimit: 100,
  used: 0,
  remaining: 100,
  monthlyLimit: 3000,
  monthlyUsed: 0,
  monthlyRemaining: 3000,
  isNearLimit: false,
  isExhausted: false,
  warningThreshold: 5,
};

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/lib/queries/useChatUsageQuery', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

function renderIndicator() {
  return fastRender(
    <TooltipProvider>
      <HeaderChatUsageIndicator />
    </TooltipProvider>
  );
}

describe('HeaderChatUsageIndicator', () => {
  it('renders nothing when usage is healthy', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...usage,
        remaining: 12,
        used: 88,
        monthlyRemaining: 360,
        monthlyUsed: 2640,
      },
    });

    const { queryByRole } = renderIndicator();

    expect(queryByRole('link')).toBeNull();
  });

  it('renders a quiet warning when overall usage is below ten percent', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...usage,
        remaining: 9,
        used: 91,
      },
    });

    const { getByRole, getByText } = renderIndicator();

    expect(getByRole('link')).toBeDefined();
    expect(getByText('9% remaining')).toBeDefined();
    expect(getByRole('link')).toHaveAccessibleName(
      '9% remaining. Open the user menu for daily and monthly usage details.'
    );
  });

  it('hides healthy paid plan usage in the header', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...usage,
        remaining: 42,
        used: 58,
      },
    });

    const { queryByRole } = renderIndicator();

    expect(queryByRole('link')).toBeNull();
  });

  it('does not warn at exactly ten percent remaining', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...usage,
        remaining: 10,
        used: 90,
      },
    });

    const { queryByRole } = renderIndicator();

    expect(queryByRole('link')).toBeNull();
  });

  it('suppresses the banner on nested demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...usage,
        remaining: 1,
        used: 99,
      },
    });

    const { queryByRole } = renderIndicator();

    expect(queryByRole('link')).toBeNull();
  });
});
