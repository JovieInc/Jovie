import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThreadComposer } from './ThreadComposer';

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

type MotionProps = {
  readonly initial?: unknown;
  readonly animate?: unknown;
  readonly exit?: unknown;
  readonly layoutId?: unknown;
  readonly transition?: unknown;
};

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      initial: _i,
      animate: _a,
      exit: _e,
      layoutId: _l,
      transition: _t,
      ...props
    }: ComponentProps<'div'> & MotionProps) => <div {...props} />,
    textarea: ({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: ComponentProps<'textarea'> & MotionProps) => <textarea {...props} />,
    span: ({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: ComponentProps<'span'> & MotionProps) => <span {...props} />,
    output: ({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: ComponentProps<'output'> & MotionProps) => <output {...props} />,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

function renderComposer(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <main>{ui}</main>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function composerBox() {
  return screen.getByRole('textbox', { name: /chat message input/i });
}

describe('ThreadComposer', () => {
  it('submits the trimmed draft on Enter and clears it, axe-clean', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = renderComposer(
      <ThreadComposer placeholder='Reply to this chat...' onSubmit={onSubmit} />
    );
    const textbox = composerBox();
    expect(textbox).toHaveAttribute('placeholder', 'Reply to this chat...');
    await user.type(textbox, '  Draft the release note  ');
    expect(textbox).toHaveValue('  Draft the release note  ');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Draft the release note');
    expect(textbox).toHaveValue('');
    await expectNoA11yViolations(container);
  });

  it('never submits a whitespace-only draft', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderComposer(
      <ThreadComposer placeholder='Reply to this chat...' onSubmit={onSubmit} />
    );
    await user.type(composerBox(), '    {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the draft even without a submit handler', async () => {
    const user = userEvent.setup();
    renderComposer(<ThreadComposer placeholder='Reply to this chat...' />);
    const textbox = composerBox();
    await user.type(textbox, 'Hello{Enter}');
    expect(textbox).toHaveValue('');
  });

  it('keeps the loading and submitting composer axe-clean', async () => {
    const { container } = renderComposer(
      <ThreadComposer
        placeholder='Reply to this chat...'
        isLoading
        isSubmitting
      />
    );
    expect(composerBox()).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long and an RTL placeholder axe-clean', async () => {
    const placeholder =
      'Reply to this chat, ask for a new release plan, or tell Jovie which playlist pitches to draft next';
    const { container } = renderComposer(
      <div dir='rtl' lang='ar'>
        <ThreadComposer placeholder={placeholder} />
      </div>
    );
    expect(composerBox()).toHaveAttribute('placeholder', placeholder);
    await expectNoA11yViolations(container);
  });
});
