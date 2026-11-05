import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';

const chat = vi.hoisted(() => ({
  messages: [] as UIMessage[],
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  stuck: true,
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(readonly options: unknown) {}
  },
}));
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    setMessages: chat.setMessages,
    status: 'ready',
    stop: vi.fn(),
  }),
}));
vi.mock('next/dynamic', async () => ({
  default: (await import('next/dist/shared/lib/app-dynamic')).default,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => false }));
vi.mock('@/components/jovie/hooks', async () => {
  const { useStickToBottom } = await import(
    '@/components/jovie/hooks/useStickToBottom'
  );
  return {
    useChatJankMonitor: () => ({ onSend: vi.fn() }),
    useStickToBottom: () => {
      const controller = useStickToBottom();
      chat.stuck = controller.isStuckToBottom;
      return controller;
    },
  };
});
vi.mock('@/components/jovie/hooks/useChipTray', () => ({
  composeMessage: (_chips: readonly unknown[], text: string) => text,
  useChipTray: () => ({
    chips: [],
    clear: vi.fn(),
    addEntity: vi.fn(),
    addSkill: vi.fn(),
    removeAt: vi.fn(),
    removeLast: vi.fn(),
  }),
}));
vi.mock('@/components/jovie/utils', () => ({
  extractErrorMetadata: () => ({}),
  getErrorType: () => 'server',
  getPreferredErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/lib/queries/useHandleAvailabilityQuery', () => ({
  useHandleAvailabilityQuery: () => ({
    data: { available: true },
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    query: '',
    state: 'idle',
    isPending: false,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('@/components/features/onboarding/OnboardingProfileRail', () => ({
  OnboardingProfileRail: () => null,
}));
vi.mock('@/components/jovie/tool-ui', () => ({
  ToolPartsRenderer: () => null,
}));
vi.mock('@/components/jovie/components', async () => {
  const { forwardRef } = await import('react');
  return {
    ChatEmptyStateComposerRegion: ({
      above,
      children,
    }: {
      above?: React.ReactNode;
      children: React.ReactNode;
    }) => (
      <div>
        {above}
        {children}
      </div>
    ),
    ChatInput: forwardRef<
      HTMLTextAreaElement,
      { value: string; onChange: (value: string) => void }
    >(function Composer({ value, onChange }, ref) {
      return (
        <textarea
          ref={ref}
          aria-label='Chat Message Input'
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      );
    }),
    ChatMessage: ({
      parts,
    }: {
      parts: Array<{ type: string; text?: string }>;
    }) => <p>{parts.map(part => part.text ?? '').join('')}</p>,
  };
});

let frames: FrameRequestCallback[] = [];
let resizeCallbacks: Map<Element, () => void>;

function flushResizeFrames() {
  act(() => {
    for (const callback of resizeCallbacks.values()) callback();
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(performance.now());
  });
}

function rect(top: number, height: number, width = 334): DOMRect {
  return DOMRect.fromRect({ x: 16, y: top, width, height });
}

/** Captured mobile geometry: page containment is NOT mask/header visibility. */
function installCapturedGeometry(
  container: HTMLElement,
  { ownerContentTop = 722.75, groupHeight = 120, scrollHeight = 1374 } = {}
) {
  const region = container.querySelector<HTMLElement>(
    '[aria-live="polite"].overflow-y-auto'
  );
  if (!region)
    throw new Error('The production transcript scroll region is missing');
  // /start mounts OnboardingShell, whose anonymous branch passes
  // headerOverlay={!isSignedIn}; this must exercise that real faded state.
  expect(region).toHaveClass('pt-16', 'system-b-chat-thread-top-fade');
  let scrollTop = 687;
  Object.defineProperties(region, {
    clientHeight: { configurable: true, value: 686 },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(scrollHeight - 686, Math.max(0, value));
      },
    },
  });
  // JSDOM has no Tailwind layout engine. These are the production pt-16/pb-5
  // insets: the real top-fade stays transparent to48px and opaque at64px.
  region.style.paddingTop = '64px';
  region.style.paddingBottom = '20px';
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      if (this === region) return rect(32, 686);
      if (
        this instanceof HTMLElement &&
        this.closest('[data-testid="onboarding-handle-check"]')
      ) {
        const ownerTop = ownerContentTop - scrollTop;
        if (this.matches('[data-testid="onboarding-handle-check"]'))
          return rect(ownerTop - 28, groupHeight);
        if (this.matches('[data-component="composite-field"]'))
          return rect(ownerTop, 36);
        if (this.matches('input')) return rect(ownerTop + 8, 20);
        if (this.matches('button')) return rect(ownerTop + 48, 36, 120);
      }
      return rect(0, 0);
    }
  );
  return region;
}

function expectGroupVisible(region: HTMLElement) {
  const field = screen.getByRole('textbox', { name: 'Edit Proposed Handle' });
  const owner = field.closest<HTMLElement>(
    '[data-component="composite-field"]'
  );
  if (!owner) throw new Error('The real field focus owner is missing');
  const visibleTop = region.getBoundingClientRect().top + 64;
  const visibleBottom = region.getBoundingClientRect().bottom - 20;
  const confirm = screen.getByRole('button', { name: 'Confirm Handle' });
  for (const control of [owner, confirm]) {
    expect(
      control.getBoundingClientRect().top,
      'focused field and Confirm must clear the real mask/header'
    ).toBeGreaterThanOrEqual(visibleTop);
    expect(
      control.getBoundingClientRect().bottom,
      'focused controls must clear the composer/scroll edge'
    ).toBeLessThanOrEqual(visibleBottom);
  }
  return field;
}

beforeEach(() => {
  chat.messages = [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Choose my profile' }],
    },
    {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: 'Check this handle' }],
    },
    {
      id: 'handle',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'checkHandle',
          toolCallId: 'handle',
          state: 'output-available',
          input: { handle: 'validartist' },
          output: { action: 'check_handle', handle: 'validartist' },
        },
      ],
    },
  ];
  chat.sendMessage.mockClear();
  chat.setMessages.mockClear();
  chat.stuck = true;
  frames = [];
  resizeCallbacks = new Map();
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.stubGlobal('requestIdleCallback', () => 1);
  vi.stubGlobal('cancelIdleCallback', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        resizeCallbacks.set(target, () => this.callback([], this));
      }
      unobserve(target: Element) {
        resizeCallbacks.delete(target);
      }
      disconnect() {
        /* Refs own cleanup; each test owns its observer map. */
      }
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OnboardingChat focused tool visibility', () => {
  it.each([false, true])(
    'reveals the real native handle editor and Confirm beyond the mask (reduced motion=%s)',
    async reduced => {
      vi.spyOn(globalThis, 'matchMedia').mockImplementation(query => ({
        matches: query.includes('prefers-reduced-motion') && reduced,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: () => true,
      }));
      const user = userEvent.setup();
      const view = render(
        <OnboardingChat
          headerOverlay
          initialMessages={chat.messages}
          turnstileToken='token'
          turnstileStatus='verified'
        />
      );
      const change = await screen.findByRole('button', {
        name: 'Change Handle',
      });
      const region = installCapturedGeometry(view.container);
      const composer = screen.getByRole('textbox', {
        name: 'Chat Message Input',
      });
      fireEvent.change(composer, { target: { value: 'Keep this draft' } });
      await user.click(change);
      const field = expectGroupVisible(region);
      expect(field).toHaveFocus();
      expect(field.parentElement?.tagName).toBe('LABEL');
      expect(screen.getByRole('textbox', { name: 'Chat Message Input' })).toBe(
        composer
      );
      expect(composer).toHaveValue('Keep this draft');
      expect(chat.sendMessage).not.toHaveBeenCalled();
    }
  );

  it('keeps edit ownership through a queued resize, then lets an explicit new turn re-pin', async () => {
    const user = userEvent.setup();
    const view = render(
      <OnboardingChat
        headerOverlay
        initialMessages={chat.messages}
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );
    const change = await screen.findByRole('button', { name: 'Change Handle' });
    const region = installCapturedGeometry(view.container);
    // Queue the existing controller before the native editor takes focus.
    act(() => {
      for (const callback of resizeCallbacks.values()) callback();
    });
    await user.click(change);
    const field = expectGroupVisible(region);
    await user.type(field, '2');
    const edited = (field as HTMLInputElement).value;
    flushResizeFrames();
    expectGroupVisible(region);
    expect(field).toHaveFocus();
    expect(field).toHaveValue(edited);
    expect(chat.stuck).toBe(false);
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Confirm Handle' })
    ).toHaveFocus();
    expectGroupVisible(region);
    const composer = screen.getByRole('textbox', {
      name: 'Chat Message Input',
    });
    await user.click(composer);
    chat.messages = [
      ...chat.messages,
      { id: 'u3', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    view.rerender(
      <OnboardingChat
        headerOverlay
        initialMessages={chat.messages}
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );
    await waitFor(() => expect(chat.stuck).toBe(true));
    expect(region.scrollTop).toBe(688);
    expect(screen.getByRole('textbox', { name: 'Chat Message Input' })).toBe(
      composer
    );
  });

  it('reveals the focused owner and its existing paint when a tall tool crosses the bottom edge', async () => {
    const view = render(
      <OnboardingChat
        headerOverlay
        initialMessages={chat.messages}
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );
    const change = await screen.findByRole('button', { name: 'Change Handle' });
    const region = installCapturedGeometry(view.container, {
      ownerContentTop: 1380,
      groupHeight: 900,
      scrollHeight: 2000,
    });
    // Activate the disclosure directly to isolate the editor's native focus
    // effect from any earlier pointer-focus scroll on the disclosure button.
    fireEvent.click(change);
    const field = screen.getByRole('textbox', { name: 'Edit Proposed Handle' });
    const owner = field.closest<HTMLElement>(
      '[data-component="composite-field"]'
    );
    if (!owner) throw new Error('The real field focus owner is missing');
    // The canonical ring and forced-colors outline both extend 2px + 2px.
    expect(owner.getBoundingClientRect().bottom + 4).toBeLessThanOrEqual(
      region.getBoundingClientRect().bottom - 20
    );
    expect(owner.getBoundingClientRect().top - 4).toBeGreaterThanOrEqual(
      region.getBoundingClientRect().top + 64
    );
    expect(field).toHaveFocus();
    expect(chat.stuck).toBe(false);
  });

  it('keeps an already-visible tool still when its native editor receives focus', async () => {
    const user = userEvent.setup();
    const view = render(
      <OnboardingChat
        headerOverlay
        initialMessages={chat.messages}
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );
    const change = await screen.findByRole('button', { name: 'Change Handle' });
    const region = installCapturedGeometry(view.container, {
      ownerContentTop: 900,
    });
    const scrollWrite = vi.spyOn(region, 'scrollTop', 'set');
    await user.click(change);
    expectGroupVisible(region);
    expect(
      screen.getByRole('textbox', { name: 'Edit Proposed Handle' })
    ).toHaveFocus();
    expect(region.scrollTop).toBe(687);
    expect(scrollWrite).not.toHaveBeenCalled();
  });
});
