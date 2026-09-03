import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/jovie/components/ChatInput';

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle' as const,
    search: vi.fn(),
  }),
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/lib/queries/useOwnGraphArtistsQuery', () => ({
  useOwnGraphArtistsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useEntityRecents', () => ({
  useEntityRecents: () => ({ recents: [], record: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layoutId?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
    textarea: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'textarea'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <textarea {...props}>{children}</textarea>,
    span: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    output: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'output'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <output {...props}>{children}</output>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

function withProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('ChatInput attachment menu interaction', () => {
  it('labels the attach trigger as options while keeping file upload as a menu item', async () => {
    const user = userEvent.setup();
    const onFileAttach = vi.fn();

    render(
      withProviders(
        <ChatInput
          value=''
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          isLoading={false}
          isSubmitting={false}
          onFileAttach={onFileAttach}
        />
      )
    );

    const attachTrigger = screen.getByRole('button', {
      name: 'Attachment options',
    });
    expect(attachTrigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(
      screen.queryByRole('button', { name: /Attach Files/i })
    ).not.toBeInTheDocument();

    await user.click(attachTrigger);

    expect(
      screen.getByRole('menuitem', { name: /Attach files/i })
    ).toBeInTheDocument();
  });
});
