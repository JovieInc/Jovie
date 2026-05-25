import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/jovie/components/ChatInput';
import { fastRender } from '@/tests/utils/fast-render';

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

class MockSpeechRecognition extends EventTarget {
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    super();
    MockSpeechRecognition.instances.push(this);
  }
}

function installMockSpeechRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: MockSpeechRecognition,
  });
}

function removeMockSpeechRecognition() {
  MockSpeechRecognition.instances = [];
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
}

function setElectronAPI(api: object) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  });
}

function removeElectronAPI() {
  Reflect.deleteProperty(window, 'electronAPI');
  delete document.documentElement.dataset.desktopRuntime;
}

function ControlledChatInputHarness() {
  const [value, setValue] = useState('');

  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={vi.fn()}
      isLoading={false}
      isSubmitting={false}
    />
  );
}

afterEach(() => {
  removeMockSpeechRecognition();
  removeElectronAPI();
});

describe('ChatInput', () => {
  const baseProps = {
    value: 'Hello there',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
    isSubmitting: false,
  };

  it('keeps the textarea focused when clicking send', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { getByRole } = fastRender(
      withProviders(<ChatInput {...baseProps} onSubmit={onSubmit} />)
    );

    const textarea = getByRole('textbox', { name: /chat message input/i });
    textarea.focus();
    expect(textarea).toHaveFocus();

    await user.click(getByRole('button', { name: /send message/i }));

    expect(onSubmit).toHaveBeenCalled();
    expect(textarea).toHaveFocus();
  });

  it('opens the attachment dropdown when clicking the plus button', async () => {
    const user = userEvent.setup();
    const onImageAttach = vi.fn();
    const { getByRole } = fastRender(
      withProviders(<ChatInput {...baseProps} onImageAttach={onImageAttach} />)
    );

    const textarea = getByRole('textbox', { name: /chat message input/i });
    textarea.focus();
    expect(textarea).toHaveFocus();

    // Click the plus button to open the attachment dropdown
    await user.click(getByRole('button', { name: /attachment options/i }));

    // Dropdown menu receives focus when opened (standard Radix behavior)
    expect(getByRole('menu')).toBeInTheDocument();
    expect(
      getByRole('menuitem', { name: /attach image/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Drop images anywhere in chat.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('renders quick actions inside the slash menu instead of below the composer', () => {
    const onQuickActionSelect = vi.fn();
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          quickActions={[
            {
              label: 'Summarize this thread',
              prompt: 'Summarize this thread in three concise bullets.',
            },
          ]}
          onQuickActionSelect={onQuickActionSelect}
          variant='compact'
        />
      )
    );

    fireEvent.focus(
      screen.getByRole('textbox', { name: /chat message input/i })
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: /chat message input/i }),
      {
        target: { value: '/' },
      }
    );

    expect(screen.queryByTestId('chat-input-quick-actions')).toBeNull();
    expect(screen.getByTestId('slash-command-menu')).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();

    const action = screen.getByText('Summarize this thread').closest('button');
    expect(action).toBeTruthy();
    fireEvent.mouseDown(action!);
    expect(onQuickActionSelect).toHaveBeenCalledWith(
      'Summarize this thread in three concise bullets.'
    );
  });

  it('renders the elevated no-shadow composer geometry', () => {
    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='' onImageAttach={vi.fn()} />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.className).toContain('--linear-app-content-surface');
    expect(surface.className).toContain('--linear-app-frame-seam');
    expect(surface.className).toContain('shadow-none');
    expect(surface.className).toContain('--linear-border-focus');

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    expect(textarea.className).toContain('text-[15px]');
    expect(textarea.className).toContain('leading-6');
    expect(textarea.className).toContain('text-white/92');
    expect(textarea.className).toContain('focus-visible:shadow-none!');
    expect(textarea).toHaveStyle({
      boxShadow: 'none',
      outline: 'none',
    });

    for (const buttonName of [
      /attachment options/i,
      /dictation unavailable/i,
      /send message/i,
    ]) {
      expect(
        screen.getByRole('button', { name: buttonName }).className
      ).toMatch(/h-9 w-9/);
    }
  });

  it('keeps the hero attach button ahead of the input field', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          variant='hero'
          onImageAttach={vi.fn()}
        />
      )
    );

    const attachButton = screen.getByRole('button', {
      name: /attachment options/i,
    });
    const inlineField = screen.getByTestId('chat-input-inline-field');

    expect(attachButton.compareDocumentPosition(inlineField)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders the larger hero composer geometry for the empty state', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          onImageAttach={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.getAttribute('data-variant')).toBe('hero');
    expect(surface.style.maxWidth).toBe('min(calc(100vw - 32px), 840px)');
    expect(surface.style.borderRadius).toBe('36px');

    expect(surface.firstElementChild?.firstElementChild?.className).toContain(
      'min-h-[52px]'
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(inlineField.className).toContain('min-h-8');

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    expect(textarea.className).toContain('text-[15px]');
    expect(textarea.className).toContain('leading-6');
  });

  it('expands hero geometry while typing the first message in an empty chat', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value='draft message'
          onImageAttach={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.style.borderRadius).toBe('36px');

    expect(surface.firstElementChild?.firstElementChild?.className).toContain(
      'min-h-[88px]'
    );
    expect(surface.firstElementChild?.firstElementChild?.className).toContain(
      'grid'
    );
  });

  it('renders the grid layout (not pill) for hero variant when pending images are present', () => {
    const pendingImages = [
      {
        id: 'p1',
        name: 'preview.png',
        mediaType: 'image/png',
        previewUrl: 'blob:mock',
        dataUrl: 'data:image/png;base64,AAAA',
      },
    ];
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          onImageAttach={vi.fn()}
          pendingImages={pendingImages}
          onRemoveImage={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.style.borderRadius).toBe('36px'); // geometry still 36 for hero non-entity

    const inlineField = screen.getByTestId('chat-input-inline-field');
    const container = inlineField.parentElement;
    expect(container?.className).toContain('min-h-[88px]');
    expect(container?.className).toContain('grid');
    expect(container?.className).not.toContain('min-h-[52px]');
  });

  it('keeps a quiet disabled dictation control when speech input is unavailable', () => {
    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = screen.getByRole('button', {
      name: /dictation unavailable/i,
    });

    expect(dictationButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
  });

  it('toggles dictation when speech input is supported', async () => {
    const user = userEvent.setup();
    installMockSpeechRecognition();

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByRole('button', {
      name: /dictate message/i,
    });
    await waitFor(() => expect(dictationButton).toBeEnabled());

    await user.click(dictationButton);

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(dictationButton).toHaveAttribute('aria-pressed', 'true');
    expect(dictationButton.className).toContain(
      'bg-[color-mix(in_oklab,var(--geist-cyan-solid)_12%,var(--linear-app-content-surface))]'
    );
    expect(
      screen.getByRole('button', { name: /stop dictation/i })
    ).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /stop dictation/i }));

    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /dictate message/i })
    ).toBeEnabled();
  });

  it('keeps dictation disabled in stale Electron when the desktop bridge cannot allow fallback', async () => {
    installMockSpeechRecognition();
    setElectronAPI({ versions: { app: '0.1.0' } });

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = screen.getByRole('button', {
      name: /dictation unavailable/i,
    });
    await waitFor(() => expect(dictationButton).toBeDisabled());
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('uses Web Speech fallback when the Electron bridge allows trusted dictation', async () => {
    const user = userEvent.setup();
    installMockSpeechRecognition();
    setElectronAPI({
      getDictationStatus: vi.fn().mockResolvedValue({
        ok: true,
        nativeAvailable: false,
        webSpeechFallbackAllowed: true,
        mode: 'web-speech',
        reason: 'native-unavailable',
      }),
    });

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByRole('button', {
      name: /dictate message/i,
    });
    await waitFor(() => expect(dictationButton).toBeEnabled());
    await user.click(dictationButton);

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('keeps structured chips inline with the editable text field', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          chips={[
            {
              type: 'entity',
              kind: 'release',
              id: 'rel_1',
              label: 'Performance Budget',
              uid: 'chip-release-1',
            },
          ]}
          onRemoveChipAt={vi.fn()}
        />
      )
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(
      within(inlineField).getByText('Performance Budget')
    ).toBeInTheDocument();
    expect(screen.getByTitle('Release: Performance Budget')).toHaveStyle({
      '--jovie-entity-accent': 'var(--geist-purple-solid)',
    });
    expect(inlineField).toContainElement(
      screen.getByRole('textbox', { name: /chat message input/i })
    );
    expect(screen.getByTestId('chat-input-chip-tray')).toHaveClass('contents');
  });

  it('keeps mixed skill and entity chips inline and individually removable', async () => {
    const user = userEvent.setup();
    const onRemoveChipAt = vi.fn();

    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          chips={[
            {
              type: 'skill',
              id: 'generateAlbumArt',
              uid: 'chip-skill-1',
            },
            {
              type: 'entity',
              kind: 'release',
              id: 'rel_1',
              label: 'Take Me Over',
              uid: 'chip-release-1',
            },
          ]}
          onRemoveChipAt={onRemoveChipAt}
        />
      )
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(within(inlineField).getByTestId('skill-chip')).toHaveTextContent(
      'Generate album art'
    );
    expect(within(inlineField).getByTestId('entity-chip')).toHaveTextContent(
      'Take Me Over'
    );
    expect(inlineField).toContainElement(
      screen.getByRole('textbox', { name: /chat message input/i })
    );

    await user.click(
      screen.getByRole('button', { name: /remove take me over/i })
    );

    expect(onRemoveChipAt).toHaveBeenCalledWith(1);
  });

  it('lets keyboard users remove skill chips', async () => {
    const user = userEvent.setup();
    const onRemoveChipAt = vi.fn();

    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          chips={[
            {
              type: 'skill',
              id: 'generateAlbumArt',
              uid: 'chip-skill-1',
            },
          ]}
          onRemoveChipAt={onRemoveChipAt}
        />
      )
    );

    screen
      .getByRole('button', { name: /remove generate album art skill/i })
      .focus();
    await user.keyboard('{Enter}');

    expect(onRemoveChipAt).toHaveBeenCalledWith(0);
  });

  it('keeps empty submit disabled until content or attachments are present', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    fastRender(
      withProviders(<ChatInput {...baseProps} value='' onSubmit={onSubmit} />)
    );

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
    await user.click(sendButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enables send when textarea DOM input is replayed into controlled state', async () => {
    fastRender(withProviders(<ControlledChatInputHarness />));

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();

    fireEvent.input(textarea, {
      target: { value: 'typed while the page was still hydrating' },
    });

    await waitFor(() => expect(sendButton).toBeEnabled());
  });

  it('shows the stop action while streaming even when the draft is empty', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='' isStreaming onStop={onStop} />
      )
    );

    const stopButton = screen.getByRole('button', {
      name: /stop generating/i,
    });
    expect(stopButton).toBeEnabled();
    await user.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
