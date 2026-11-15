import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  mockUseChatConversationsQuery,
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => null,
}));

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch: _prefetch, ...props }, ref) {
    return <a {...props} ref={ref} />;
  }),
}));

type ConversationsResult = ReturnType<typeof mockUseChatConversationsQuery>;

function conversationsResult(result: Record<string, unknown>) {
  return { data: undefined, ...result } as unknown as ConversationsResult;
}

function chat(id: string, title: string) {
  const at = new Date().toISOString();
  return {
    id,
    title,
    createdAt: at,
    updatedAt: at,
    latestTurnStatus: 'completed' as const,
  };
}

function nav() {
  return screen.getByRole('navigation', { name: 'Dashboard Navigation' });
}

describe('DashboardNav states', () => {
  beforeEach(() => {
    resetDashboardNavTestMocks();
    mockUsePathname.mockReturnValue(APP_ROUTES.CHAT);
  });

  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('shows a skeleton history row while recent chats load', async () => {
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ isLoading: true })
    );
    const { container } = renderDashboardNav({ renderFn: render });

    expect(nav().querySelector('.skeleton')).not.toBeNull();
    expect(screen.queryByText('Conversations unavailable')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders navigation only when there is no chat history', async () => {
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ data: [] })
    );
    const { container } = renderDashboardNav({ renderFn: render });

    expect(nav().querySelector('[data-sidebar-history-header]')).toBeNull();
    expect(screen.getByRole('link', { name: 'New Chat' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports unavailable history and retries on request', async () => {
    const refetch = vi.fn(() => Promise.resolve());
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ isError: true, refetch })
    );
    const { container } = renderDashboardNav({ renderFn: render });

    expect(screen.getByText('Conversations unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps retry working when an offline refetch rejects', async () => {
    const refetch = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ isError: true, refetch })
    );
    const { container } = renderDashboardNav({ renderFn: render });

    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Conversations unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders long chat titles in full for assistive tech', async () => {
    const title =
      'Plan the full European summer festival run including travel, merch restocks and every press interview request';
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ data: [chat('long', title)] })
    );
    const { container } = renderDashboardNav({ renderFn: render });

    expect(within(nav()).getAllByText(title).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left chat titles accessibly', async () => {
    const title = 'خطة جولة المهرجانات الصيفية في أوروبا';
    mockUseChatConversationsQuery.mockReturnValue(
      conversationsResult({ data: [chat('rtl', title)] })
    );
    const { container } = renderDashboardNav({
      renderFn: ui => render(<div dir='rtl'>{ui}</div>),
    });

    expect(within(nav()).getAllByText(title).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
