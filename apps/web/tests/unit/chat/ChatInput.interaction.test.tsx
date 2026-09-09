import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode, useState } from 'react';
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
    expect(attachTrigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(
      screen.queryByRole('button', { name: /Attach Files/i })
    ).not.toBeInTheDocument();

    await user.click(attachTrigger);

    expect(
      screen.getByRole('option', { name: /Attach Files/i })
    ).toBeInTheDocument();
  });
});

function ControlledComposer(props: Partial<ComponentProps<typeof ChatInput>>) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <ChatInput
      onSubmit={vi.fn()}
      isLoading={false}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
}

describe('shared composer palette', () => {
  it.each([
    'plus',
    'slash',
  ])('uses the same ordered attachments and filters audio through %s', async entry => {
    const user = userEvent.setup();
    const file = vi.fn();
    const audio = vi.fn();
    const submit = vi.fn();
    render(
      withProviders(
        <ControlledComposer
          onFileAttach={file}
          onAudioAttach={audio}
          onSubmit={submit}
        />
      )
    );
    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    if (entry === 'plus')
      await user.click(
        screen.getByRole('button', { name: 'Attachment options' })
      );
    else await user.type(textarea, '/');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Attach Files');
    expect(screen.getByText('Skills')).toBeInTheDocument();
    const filter =
      entry === 'plus'
        ? screen.getByLabelText('Filter Commands And References')
        : textarea;
    expect(filter).toHaveFocus();
    await user.type(filter, 'audio');
    expect(
      screen.getByRole('option', { name: /Upload audio/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Attach Files/ })).toBeNull();
    await user.keyboard('{Enter}');
    expect(audio).toHaveBeenCalledOnce();
    expect(file).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textarea).toHaveValue('');
  });

  it('preserves the draft and caret when plus filtering is dismissed', async () => {
    const user = userEvent.setup();
    render(
      withProviders(
        <ControlledComposer value='Keep this draft' onFileAttach={vi.fn()} />
      )
    );
    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 5);
    await user.click(
      screen.getByRole('button', { name: 'Attachment options' })
    );
    await user.type(
      screen.getByLabelText('Filter Commands And References'),
      'missing item'
    );
    await user.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(textarea).toHaveValue('Keep this draft');
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe(5);
  });

  it('keeps unavailable attachment actions out of the shared slash palette', async () => {
    const user = userEvent.setup();
    render(
      withProviders(
        <ControlledComposer onFileAttach={vi.fn()} isFileProcessing />
      )
    );
    expect(
      screen.getByRole('button', { name: 'Attachment options' })
    ).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: /chat message input/i }),
      '/'
    );
    expect(
      screen.queryByRole('option', { name: /Attach Files|Upload audio/ })
    ).toBeNull();
  });
});
