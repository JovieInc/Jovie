import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatInput } from '@/components/jovie/components/ChatInput';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import {
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
  ChatComposerSurface,
  ChatEmptyStateComposerRegion,
  ChatLoadingConversationSkeleton,
} from './JovieChatSections';

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='usage-alert-probe'>usage-alert</div>,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layout: _layout,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layout?: unknown;
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
      layout: _layout,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
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
  useReducedMotion: () => true,
}));

describe('JovieChatSections', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('exports the empty-chat viewport owner so nested shells cannot add a second top gap', () => {
    expect(CHAT_EMPTY_TOP_SPACING_OWNER).toBe('chat-empty-viewport');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain('pt-0');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain(
      'px-(--app-shell-header-padding-x)'
    );
  });

  it('renders the conversation loading skeleton without shifting the composer dock', () => {
    render(<ChatLoadingConversationSkeleton />);

    expect(
      screen.getByTestId('chat-loading-conversation-skeleton')
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('re-exports the Just ask empty region as the shared conversation entry', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <button type='button'>Composer</button>
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('chat-empty-state-greeting')).toHaveTextContent(
      'Just ask'
    );
    expect(
      screen.getByRole('button', { name: 'Composer' })
    ).toBeInTheDocument();
  });
});

function renderComposerSurface({
  suppressUsageAlert = false,
}: {
  readonly suppressUsageAlert?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const chatInputProps: ComponentProps<typeof ChatInput> = {
    value: '',
    onChange: () => undefined,
    onSubmit: () => undefined,
    isLoading: false,
    isSubmitting: false,
    onFileAttach: () => undefined,
    onAudioAttach: () => undefined,
    pendingFiles: [],
    onRemoveFile: () => undefined,
  };

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ChatComposerSurface
          chatInputProps={chatInputProps}
          showThreadView={false}
          suppressUsageAlert={suppressUsageAlert}
          isRateLimited={false}
          showManifest={false}
          manifestCollapsed={false}
          showChips={false}
          pendingFiles={[]}
          aggregate={{
            total: 0,
            done: 0,
            overallPct: 0,
            speed: '0 B/s',
            eta: '—',
            locked: 0,
          }}
          isUploading={false}
          isPro
          onRemoveFile={() => undefined}
          onCollapseManifest={() => undefined}
          onExpandManifest={() => undefined}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('ChatComposerSurface one-chrome-layer wiring', () => {
  it('renders the single usage banner slot by default', () => {
    renderComposerSurface();

    expect(screen.getByTestId('usage-alert-probe')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Chat Message Input' })
    ).toBeInTheDocument();
  });

  it('suppressUsageAlert hides the banner while the composer stays mounted', () => {
    renderComposerSurface({ suppressUsageAlert: true });

    expect(screen.queryByTestId('usage-alert-probe')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Chat Message Input' })
    ).toBeInTheDocument();
  });
});
