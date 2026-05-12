'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowUp, Loader2 } from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import {
  ChatProposeCheckoutCard,
  type CheckoutCardPayload,
} from './ChatProposeCheckoutCard';
import {
  ChatProposeNextStepCard,
  type NextStepCardPayload,
} from './ChatProposeNextStepCard';

/**
 * Anonymous onboarding chat client (JOV-2132 PR 3).
 *
 * Streams against `/api/chat` in `mode='onboarding'`. The first request also
 * carries the Cloudflare Turnstile token; subsequent requests in the same
 * session do not (the signed cookie + session-lifetime rate limit carry
 * trust forward).
 *
 * v1 visual: a single column of message bubbles with a composer at the
 * bottom. Tool-call previews are rendered as small inline chips so the LLM's
 * tool use is visible while we iterate on the dedicated tool cards in a
 * follow-up commit on this branch.
 */

interface OnboardingChatProps {
  /** Turnstile token from the widget. Required on first message. */
  readonly turnstileToken: string | null;
}

/** Pull the user-visible text out of a UIMessage's parts. */
function getMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

interface ToolPart {
  readonly type: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly output?: unknown;
  readonly state?: string;
}

function isToolPart(part: unknown): part is ToolPart {
  if (!part || typeof part !== 'object') return false;
  const type = (part as { type?: unknown }).type;
  return (
    type === 'dynamic-tool' ||
    (typeof type === 'string' && type.startsWith('tool-'))
  );
}

function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  // Convention: AI SDK emits parts of type `tool-<name>` when output is present.
  return part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : part.type;
}

/**
 * Extract tool parts from a message. Returns the structured parts (not text)
 * so the renderer can decide between rich cards (proposeNextStep,
 * proposeCheckout) and the chip fallback for the rest.
 */
function getToolParts(message: UIMessage): readonly ToolPart[] {
  return (message.parts ?? []).filter(isToolPart);
}

interface ToolOutputWithAction {
  readonly action?: string;
}

function isNextStepPayload(output: unknown): output is NextStepCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_next_step'
  );
}

function isCheckoutPayload(output: unknown): output is CheckoutCardPayload {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as ToolOutputWithAction).action === 'propose_checkout'
  );
}

export function OnboardingChat({ turnstileToken }: OnboardingChatProps) {
  const [input, setInput] = useState('');
  const [hasSentFirst, setHasSentFirst] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        // `prepareSendMessagesRequest` lets us mutate the body per-request so
        // the first POST carries the Turnstile token; subsequent POSTs skip it.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            mode: 'onboarding' as const,
            messages,
            ...(hasSentFirst ? {} : { turnstileToken }),
          },
        }),
      }),
    [hasSentFirst, turnstileToken]
  );

  const { messages, sendMessage, status } = useChat({
    id: 'onboarding',
    transport,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const text = input.trim();
      if (!text || isStreaming) return;
      if (!hasSentFirst && !turnstileToken) {
        // Turnstile hasn't issued a token yet; the widget normally resolves
        // within ~500ms. Silently no-op so the user can retry.
        return;
      }
      sendMessage({ text });
      setHasSentFirst(true);
      setInput('');
    },
    [hasSentFirst, input, isStreaming, sendMessage, turnstileToken]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Auto-scroll on new content
  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, isStreaming]);

  const composerDisabled = isStreaming || (!hasSentFirst && !turnstileToken);

  return (
    <div className='flex flex-1 flex-col'>
      <div
        ref={messagesRef}
        className='flex-1 space-y-3 overflow-y-auto px-1 py-6'
        aria-live='polite'
      >
        {messages.length === 0 ? (
          <p className='text-center text-[13px] text-white/40'>
            {`heads up — I'll remember this chat so you can pick up where we left off when you sign up. what are you working on?`}
          </p>
        ) : null}

        {messages.map(message => {
          const text = getMessageText(message);
          const toolParts = getToolParts(message);
          return (
            <div
              key={message.id}
              className={cn(
                'flex flex-col',
                message.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              {text || toolParts.length === 0 ? (
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6',
                    message.role === 'user'
                      ? 'bg-white text-black'
                      : 'border border-white/[0.08] bg-white/[0.035] text-white/82'
                  )}
                >
                  {text || (
                    <span className='text-white/40'>
                      <Loader2
                        className='inline h-3.5 w-3.5 animate-spin'
                        aria-hidden
                      />
                    </span>
                  )}
                </div>
              ) : null}

              {toolParts.map((part, i) => {
                const toolName = getToolName(part);
                const key = part.toolCallId ?? `${message.id}-tool-${i}`;
                const output = part.output;

                if (
                  toolName === 'proposeNextStep' &&
                  isNextStepPayload(output)
                ) {
                  return (
                    <div key={key} className='w-full max-w-[440px]'>
                      <ChatProposeNextStepCard payload={output} />
                    </div>
                  );
                }
                if (
                  toolName === 'proposeCheckout' &&
                  isCheckoutPayload(output)
                ) {
                  return (
                    <div key={key} className='w-full max-w-[440px]'>
                      <ChatProposeCheckoutCard payload={output} />
                    </div>
                  );
                }
                // Fallback: small chip surfacing the tool name. The dedicated
                // cards for searchSpotifyArtist / confirmSpotifyArtist /
                // checkHandle / proposeSocialLink / recordInterviewSignal
                // land in follow-up commits on this branch.
                return (
                  <span
                    key={key}
                    className='mt-1 inline-flex rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60'
                  >
                    {toolName}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className='sticky bottom-0 flex items-end gap-2 border-t border-white/[0.07] bg-[#06070a]/90 pb-3 pt-3 backdrop-blur'
      >
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            !hasSentFirst && !turnstileToken
              ? 'just a sec…'
              : 'tell me what you are working on'
          }
          disabled={composerDisabled}
          className='min-h-[44px] max-h-[160px] flex-1 resize-none rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-white/32 focus:border-white/24 disabled:cursor-not-allowed disabled:opacity-50'
          aria-label='Type a message to Jovie'
        />
        <button
          type='submit'
          disabled={composerDisabled || input.trim().length === 0}
          className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40 focus-ring-themed'
          aria-label='Send message'
        >
          <ArrowUp className='h-4 w-4' aria-hidden />
        </button>
      </form>
    </div>
  );
}
