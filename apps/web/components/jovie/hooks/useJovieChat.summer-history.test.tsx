import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/ovie/summer/history/route';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import {
  appendSummerTurn,
  CURRENT_SUMMER_IDENTITY,
  SUMMER_SESSION_DECISION_ID,
} from '@/lib/ovie/summer-session';
import {
  resetChatTimelineStateCacheForTests,
  useJovieChat,
} from './useJovieChat';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  stop: vi.fn(),
  messages: [],
  store: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getSessionContext: h.session }));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: h.store,
}));
vi.mock('@/lib/env-server', () => ({
  env: { OVIE_SUMMER_FOUNDER_APP_USER_ID: 'founder' },
}));
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: h.messages,
    sendMessage: h.send,
    stop: h.stop,
    status: 'ready',
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@tanstack/react-pacer', () => ({
  useAsyncRateLimiter: () => ({
    maybeExecute: vi.fn(),
    getRemainingInWindow: () => 1,
    state: { isExecuting: false },
  }),
}));

function Transcript({
  chatMode,
  conversationId,
}: {
  readonly chatMode?: 'ov';
  readonly conversationId?: string;
}) {
  const chat = useJovieChat({
    profileId: 'founder-profile',
    chatMode,
    conversationId,
  });
  return (
    <section aria-label='Transcript'>
      {chat.messages.map(message => (
        <p key={message.id}>
          {message.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
        </p>
      ))}
      {chat.chatError && <p role='alert'>{chat.chatError.message}</p>}
      <button type='button' onClick={() => chat.submitMessage('Unsafe resend')}>
        Send
      </button>
    </section>
  );
}

describe('Summer history restoration', () => {
  let store: MemoryOperatingStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetChatTimelineStateCacheForTests();
    store = new MemoryOperatingStore();
    h.store.mockReturnValue(store);
    h.session.mockResolvedValue({ user: { id: 'founder' } });
    await appendSummerTurn(store, {
      clientTurnId: 'original-turn',
      userText: 'Remember the shipping decision',
      assistantText: 'Keep the existing owner.',
      eveWorkId: null,
      eveAcks: [],
      correlationId: 'original-correlation',
      state: 'completed',
      toolReceipt: null,
      createdAt: '2026-09-20T00:00:00.000Z',
    });
    // Real GET, canonical store, Query observer and timeline reducer. No network.
    fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/ovie/summer/history');
      return GET();
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function mount(chatMode?: 'ov', conversationId?: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = render(<Transcript {...{ chatMode, conversationId }} />, {
      wrapper,
    });
    return {
      ...view,
      client,
      mode: (chatMode?: 'ov') =>
        view.rerender(<Transcript chatMode={chatMode} />),
    };
  }

  it('restores recorded user and Summer messages on OV mount and full remount without sending', async () => {
    const first = mount('ov');
    await waitFor(() =>
      expect(screen.getByText('Keep the existing owner.')).toBeTruthy()
    );
    expect(screen.getByText('Remember the shipping decision')).toBeTruthy();
    first.unmount();
    resetChatTimelineStateCacheForTests();
    mount('ov');
    await waitFor(() =>
      expect(screen.getByText('Keep the existing owner.')).toBeTruthy()
    );
    expect(screen.getAllByText('Keep the existing owner.')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('never loads Summer history in a new customer chat', () => {
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Keep the existing owner.')).toBeNull();
  });

  it('merges repeated durable reads without duplicates or store writes', async () => {
    const cas = vi.spyOn(store, 'putDecisionIfUnchanged');
    const { client } = mount('ov');
    await screen.findByText('Keep the existing owner.');
    await act(() => client.invalidateQueries({ queryKey: ['summer-history'] }));
    expect(screen.getAllByText('Keep the existing owner.')).toHaveLength(1);
    expect(screen.getAllByText('Remember the shipping decision')).toHaveLength(
      1
    );
    expect(cas).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('hides previously loaded history when authorization is lost', async () => {
    const { client } = mount('ov');
    await screen.findByText('Keep the existing owner.');
    h.session.mockResolvedValue({ user: { id: 'customer' } });
    await act(() => client.invalidateQueries({ queryKey: ['summer-history'] }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Keep the existing owner.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(h.send).not.toHaveBeenCalled();
  });

  it('shows recorded failed turns and restores a long conversation after remount', async () => {
    for (let i = 2; i <= 12; i++) {
      await appendSummerTurn(store, {
        clientTurnId: `turn-${i}`,
        userText: `Question ${i}`,
        assistantText: i === 12 ? '' : `Answer ${i}`,
        eveWorkId: null,
        eveAcks: [],
        correlationId: `correlation-${i}`,
        state: i === 12 ? 'failed' : 'completed',
        toolReceipt: null,
        createdAt: '2026-09-20T00:00:00.000Z',
      });
    }
    const view = mount('ov');
    await screen.findByText(/Summer turn status: failed/);
    expect(screen.getByText('Question 12')).toBeTruthy();
    expect(screen.getAllByText(/^Answer \d+/)).toHaveLength(10);
    expect(
      Array.from(
        screen.getByRole('region', { name: 'Transcript' }).querySelectorAll('p')
      )
        .slice(0, 4)
        .map(row => row.textContent)
    ).toEqual([
      'Remember the shipping decision',
      'Keep the existing owner.',
      'Question 2',
      'Answer 2',
    ]);
    view.unmount();
    resetChatTimelineStateCacheForTests();
    mount('ov');
    await screen.findByText(/Summer turn status: failed/);
    expect(screen.getAllByText(/^Answer \d+/)).toHaveLength(10);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('rejects legacy identity visibly without migrating it', async () => {
    await store.putDecision({
      id: SUMMER_SESSION_DECISION_ID,
      kind: 'decision',
      decided: JSON.stringify({
        identity: { ...CURRENT_SUMMER_IDENTITY, runtime: 'mac' },
        turns: [],
      }),
      why: 'fixture',
      provenance: 'test',
      createdAt: '2026-09-20T00:00:00.000Z',
    });
    const cas = vi.spyOn(store, 'putDecisionIfUnchanged');
    mount('ov');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'could not be verified'
    );
    expect(cas).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('cancels a pending read on exit and never renders its late result in customer chat', async () => {
    let release: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          release = resolve;
        })
    );
    const view = mount('ov');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(h.send).not.toHaveBeenCalled();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    view.mode();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      release?.(await GET());
    });
    expect(screen.queryByText('Keep the existing owner.')).toBeNull();
  });

  it('never carries Summer rows into the customer door on a same-instance mode switch', async () => {
    const view = mount('ov', 'customer-thread');
    await screen.findByText('Keep the existing owner.');
    view.mode();
    expect(screen.queryByText('Keep the existing owner.')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.mode('ov');
    await screen.findByText('Keep the existing owner.');
    expect(screen.getAllByText('Remember the shipping decision')).toHaveLength(
      1
    );
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(['missing', 'unavailable', 'unauthorized'] as const)(
    'shows %s history failure without starting or replaying a turn',
    async kind => {
      if (kind === 'missing')
        h.store.mockReturnValue(new MemoryOperatingStore());
      if (kind === 'unavailable')
        h.store.mockImplementation(() => {
          throw new Error('private backend detail');
        });
      if (kind === 'unauthorized')
        h.session.mockResolvedValue({ user: { id: 'customer' } });
      mount('ov');
      await screen.findByRole('alert');
      expect(screen.queryByText('Keep the existing owner.')).toBeNull();
      expect(screen.queryByText('private backend detail')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(h.send).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
});
