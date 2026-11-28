import { act, fireEvent, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import type { ChatInputProps } from './components/ChatInput';
import { resetChatTimelineStateCacheForTests } from './hooks/useJovieChat';
import { JovieChat } from './JovieChat';

const h = vi.hoisted(() => ({
  inputProps: null as ChatInputProps | null,
  messages: [] as UIMessage[],
  send: vi.fn(),
  upload: vi.fn(),
  stop: vi.fn(),
  history: {
    conversation: { id: 'draft-owner-thread', title: 'Existing thread' },
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First answer',
        createdAt: '2026-10-01T00:00:01Z',
      },
    ],
  },
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
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/chat/draft-owner-thread',
}));
vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useChatConversationQuery: () => ({
    data: h.history,
    isLoading: false,
    isError: false,
    error: null,
  }),
  usePlanGate: () => ({ chatFileUploadLimit: 5, isPro: false }),
  usePendingOpportunityCardsQuery: () => ({ data: [] }),
  useInsightsSummaryQuery: () => ({ data: undefined }),
}));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => false }));
vi.mock('@/lib/blob/upload-presigned-lazy', () => ({
  uploadPresignedLazy: h.upload,
}));
vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => null,
}));
vi.mock('@/components/jovie/components/EntityResolutionProvider', () => ({
  EntityResolutionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/components/jovie/components', async importOriginal => {
  const { forwardRef } = await import('react');
  return {
    ...(await importOriginal<typeof import('@/components/jovie/components')>()),
    // Keep the real composer, controller, rate limiter, and attachment hook.
    ChatInput: forwardRef<HTMLTextAreaElement, ChatInputProps>((props, ref) => {
      h.inputProps = props;
      return (
        <textarea
          ref={ref}
          aria-label='Draft'
          value={props.value}
          onChange={event => props.onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') props.onSubmit();
          }}
        />
      );
    }),
    ChatMessage: () => null,
    ScrollToBottom: () => null,
  };
});

describe('chat attachment ownership', () => {
  beforeEach(() => {
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    h.inputProps = null;
    h.send.mockReset().mockResolvedValue(undefined);
    h.upload.mockReset().mockResolvedValue({
      url: 'https://files.example.test/notes.txt',
      pathname: 'chat/test-user/notes.txt',
    });
    h.stop.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['rejected', 'accepted'] as const)(
    'retains staged attachments until a send is %s',
    async outcome => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              blobUrl: 'https://files.example.test/notes.txt',
              contentType: 'text/plain',
            })
          )
        )
      );
      const view = renderWithQueryClient(
        <JovieChat conversationId='draft-owner-thread' />
      );
      await act(async () => {
        fireEvent.change(view.container.querySelector('input[type="file"]')!, {
          target: {
            files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
          },
        });
      });
      expect(h.inputProps?.pendingFiles).toHaveLength(1);
      expect(h.inputProps?.pendingFiles?.[0].status).toBe('ready');
      const input = screen.getByRole('textbox', { name: 'Draft' });
      const draft =
        outcome === 'accepted' ? 'Review attachment' : 'x'.repeat(4001);
      await act(async () => {
        fireEvent.change(input, { target: { value: draft } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(h.inputProps?.pendingFiles).toHaveLength(
        outcome === 'accepted' ? 0 : 1
      );
      if (outcome === 'accepted') {
        expect(h.send).toHaveBeenCalledWith(
          {
            text: draft,
            files: [
              {
                type: 'file',
                mediaType: 'text/plain',
                url: 'https://files.example.test/notes.txt',
              },
            ],
          },
          expect.any(Object)
        );
      } else {
        expect(h.send).not.toHaveBeenCalled();
        expect(input).toHaveValue(draft);
      }
    }
  );

  it.each(['', 'Review attachment'])(
    'retries a locally rate-limited attachment and clears its staged copy (%s)',
    async caption => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              blobUrl: 'https://files.example.test/notes.txt',
              contentType: 'text/plain',
            })
          )
        )
      );
      const view = renderWithQueryClient(
        <JovieChat conversationId='draft-owner-thread' />
      );
      await act(async () =>
        fireEvent.change(view.container.querySelector('input[type="file"]')!, {
          target: {
            files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
          },
        })
      );
      const input = screen.getByRole('textbox', { name: 'Draft' });
      await act(async () => {
        fireEvent.change(input, { target: { value: 'x'.repeat(4001) } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      await act(async () => {
        fireEvent.change(input, { target: { value: caption } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(h.send).not.toHaveBeenCalled();
      expect(h.inputProps?.pendingFiles).toHaveLength(1);
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Retry Message' }))
      );
      expect(h.send).toHaveBeenCalledExactlyOnceWith(
        {
          text: caption,
          files: [
            {
              type: 'file',
              mediaType: 'text/plain',
              url: 'https://files.example.test/notes.txt',
            },
          ],
        },
        expect.any(Object)
      );
      expect(h.inputProps?.pendingFiles).toHaveLength(0);
    }
  );
});
