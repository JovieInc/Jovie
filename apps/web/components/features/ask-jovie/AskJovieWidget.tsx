'use client';

import { Send, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { JovieIcon } from '@/components/atoms/JovieIcon';
import { track } from '@/lib/analytics';
import { PROFILE_Z } from '@/lib/profile/z-index-constants';
import { cn } from '@/lib/utils';

interface AskJovieWidgetProps {
  /** Profile handle the conversation is scoped to. */
  readonly username: string;
  /** Display name used in visitor-facing copy. */
  readonly artistName: string;
}

type ChatMessage = {
  readonly id: number;
  readonly role: 'visitor' | 'jovie';
  readonly text: string;
};

type MessageCategory =
  | 'fan_mail'
  | 'booking'
  | 'press'
  | 'collaboration'
  | 'business'
  | 'other';

type FollowIntent = 'new_release_alerts' | 'local_show_alerts';

const CATEGORY_LABELS: ReadonlyArray<{ id: MessageCategory; label: string }> = [
  { id: 'fan_mail', label: 'Fan Message' },
  { id: 'booking', label: 'Booking' },
  { id: 'press', label: 'Press / Media' },
  { id: 'collaboration', label: 'Collab' },
  { id: 'business', label: 'Business' },
  { id: 'other', label: 'Other' },
];

const SUGGESTED_QUESTIONS = [
  'Tell me about this artist',
  'What song should I start with?',
  'When are they playing in LA?',
  'Where can I listen?',
];

const INTENT_LABELS: ReadonlyArray<{ id: FollowIntent; label: string }> = [
  { id: 'new_release_alerts', label: 'New Music Alerts' },
  { id: 'local_show_alerts', label: 'Local Show Alerts' },
];

let nextMessageId = 1;
const makeMessage = (role: ChatMessage['role'], text: string): ChatMessage => ({
  id: nextMessageId++,
  role,
  text,
});

/**
 * Ask Jovie — conversational identity surface on a public profile.
 * Answers grounded profile questions, escalates what it cannot answer to the
 * owner as structured messages, and captures follow intents with contact info.
 */
export function AskJovieWidget({ username, artistName }: AskJovieWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  // Escalation state: the question Jovie could not answer, if any.
  const [unansweredQuestion, setUnansweredQuestion] = useState<string | null>(
    null
  );
  const [escalating, setEscalating] = useState(false);
  const [category, setCategory] = useState<MessageCategory>('fan_mail');
  const [intentFlow, setIntentFlow] = useState<FollowIntent | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const pushMessages = useCallback((...items: ChatMessage[]) => {
    setMessages(prev => [...prev, ...items]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, []);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(
        `/api/profile/${encodeURIComponent(username)}/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      return res.json().catch(() => ({}));
    },
    [username]
  );

  const openWidget = () => {
    setOpen(true);
    track('ask_jovie_opened', { username });
    if (messages.length === 0) {
      pushMessages(
        makeMessage(
          'jovie',
          `Hey — I'm Jovie. Ask me anything about ${artistName}, get updates, or send them a message.`
        )
      );
    }
  };

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setInput('');
    setEscalating(false);
    setIntentFlow(null);
    pushMessages(makeMessage('visitor', trimmed));
    setPending(true);
    track('ask_jovie_question', { username });
    try {
      const data = await post({ action: 'question', question: trimmed });
      if (data.answered && typeof data.text === 'string') {
        track('ask_jovie_answered', { username });
        pushMessages(makeMessage('jovie', data.text));
      } else {
        track('ask_jovie_unanswered', { username });
        setUnansweredQuestion(trimmed);
        pushMessages(
          makeMessage(
            'jovie',
            `I don't have that on file for ${artistName}. Want me to send your question to them?`
          )
        );
      }
    } catch {
      pushMessages(
        makeMessage(
          'jovie',
          'Something went wrong on my end — try again in a moment.'
        )
      );
    } finally {
      setPending(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    const body = text || unansweredQuestion || '';
    if (!body || pending) return;
    setPending(true);
    setInput('');
    try {
      const data = await post({
        action: 'message',
        category,
        message: text || body,
        name: name || undefined,
        email: email || undefined,
        question: unansweredQuestion ?? undefined,
      });
      if (data.success) {
        track('ask_jovie_message_sent', { username, category });
        pushMessages(
          makeMessage(
            'jovie',
            `Done — I sent that to ${artistName}${
              email ? ' and noted your email so they can reply' : ''
            }.`
          )
        );
        setEscalating(false);
        setUnansweredQuestion(null);
      } else {
        pushMessages(
          makeMessage(
            'jovie',
            typeof data.error === 'string'
              ? data.error
              : "I couldn't send that — try again."
          )
        );
      }
    } catch {
      pushMessages(makeMessage('jovie', "I couldn't send that — try again."));
    } finally {
      setPending(false);
    }
  };

  const submitIntent = async () => {
    if (!email.trim() || pending) return;
    setPending(true);
    try {
      const data = await post({
        action: 'intent',
        intent: intentFlow,
        email: email.trim(),
        name: name || undefined,
        city: city || undefined,
      });
      if (data.success) {
        track('ask_jovie_intent_captured', { username, intent: intentFlow });
        const what =
          intentFlow === 'local_show_alerts'
            ? `when ${artistName} plays${city ? ` near ${city}` : ' near you'}`
            : `when ${artistName} drops new music`;
        pushMessages(
          makeMessage(
            'jovie',
            `You're on the list — I'll let you know ${what}.`
          )
        );
        setIntentFlow(null);
        setCity('');
      } else {
        pushMessages(
          makeMessage(
            'jovie',
            typeof data.error === 'string'
              ? data.error
              : 'Please enter a valid email address.'
          )
        );
      }
    } catch {
      pushMessages(makeMessage('jovie', 'Something went wrong — try again.'));
    } finally {
      setPending(false);
    }
  };

  const startIntent = (intent: FollowIntent) => {
    setIntentFlow(intent);
    setEscalating(false);
    track('ask_jovie_intent_started', { username, intent });
    pushMessages(
      makeMessage(
        'visitor',
        intent === 'local_show_alerts'
          ? `Tell me when ${artistName} is playing near me`
          : `Tell me when ${artistName} drops new music`
      ),
      makeMessage(
        'jovie',
        intent === 'local_show_alerts'
          ? 'Easy — drop your email and city below and I will only email you about that.'
          : 'Easy — drop your email below and I will only email you about new music.'
      )
    );
  };

  return (
    <>
      {/* Trigger: understated icon at rest; hover = one 360° spin + label. */}
      {!open && (
        <button
          type='button'
          onClick={openWidget}
          aria-label={`Ask Jovie about ${artistName}`}
          className={cn(
            'group fixed bottom-4 right-4 flex items-center gap-0 overflow-hidden rounded-full bg-surface-0 py-2.5 pl-2.5 shadow-xl ring-1 ring-(--color-border-subtle) backdrop-blur-md transition-[padding] duration-subtle ease-subtle hover:pr-4 motion-reduce:transition-none',
            PROFILE_Z.DRAWER_CONTENT
          )}
        >
          <JovieIcon size={22} className='ask-jovie-spin-once shrink-0' />
          <span className='max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium text-primary-token opacity-0 transition-[margin,max-width,opacity] duration-subtle ease-subtle group-hover:ml-2 group-hover:max-w-24 group-hover:opacity-100 motion-reduce:transition-none'>
            Ask Jovie
          </span>
        </button>
      )}

      {open && (
        <div
          role='dialog'
          aria-label={`Ask Jovie about ${artistName}`}
          className={cn(
            'fixed bottom-4 right-4 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-surface-0 shadow-2xl ring-1 ring-(--color-border-subtle) backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-subtle ease-out motion-reduce:animate-none',
            PROFILE_Z.DRAWER_CONTENT
          )}
        >
          <div className='flex items-center justify-between gap-2 border-b border-subtle px-4 py-3'>
            <div className='flex items-center gap-2'>
              <JovieIcon size={18} />
              <div className='leading-tight'>
                <p className='text-sm font-semibold text-primary-token'>
                  Ask Jovie
                </p>
                <p className='text-xs text-tertiary-token'>{artistName}</p>
              </div>
            </div>
            <button
              type='button'
              onClick={() => setOpen(false)}
              aria-label='Close Ask Jovie'
              className='flex h-9 w-9 items-center justify-center rounded-full text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </button>
          </div>

          <div
            ref={listRef}
            className='flex-1 space-y-2 overflow-y-auto px-4 py-3'
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug',
                  msg.role === 'visitor'
                    ? 'ml-auto bg-surface-2 text-primary-token'
                    : 'mr-auto bg-surface-1 text-primary-token'
                )}
              >
                {msg.text}
              </div>
            ))}
            {pending && (
              <div className='mr-auto rounded-2xl bg-surface-1 px-3 py-2 text-sm text-tertiary-token'>
                …
              </div>
            )}

            {messages.length <= 1 && (
              <div className='flex flex-wrap gap-1.5 pt-1'>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button
                    key={q}
                    type='button'
                    onClick={() => void ask(q)}
                    className='rounded-full border border-subtle px-3 py-1.5 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1'
                  >
                    {q}
                  </button>
                ))}
                {INTENT_LABELS.map(intent => (
                  <button
                    key={intent.id}
                    type='button'
                    onClick={() => startIntent(intent.id)}
                    className='rounded-full border border-subtle px-3 py-1.5 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1'
                  >
                    {intent.label}
                  </button>
                ))}
              </div>
            )}

            {unansweredQuestion && !escalating && (
              <button
                type='button'
                onClick={() => setEscalating(true)}
                className='rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-secondary-token transition-colors duration-subtle hover:bg-surface-1'
              >
                Send to {artistName}
              </button>
            )}

            {escalating && (
              <div className='space-y-2 rounded-xl border border-subtle p-3'>
                <p className='text-xs font-medium text-secondary-token'>
                  What is this about?
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {CATEGORY_LABELS.map(c => (
                    <button
                      key={c.id}
                      type='button'
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors duration-subtle',
                        category === c.id
                          ? 'border-transparent bg-surface-2 text-primary-token'
                          : 'border-subtle text-tertiary-token hover:bg-surface-1'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder='Name (optional)'
                  className='w-full rounded-lg border border-subtle bg-transparent px-3 py-1.5 text-sm text-primary-token placeholder:text-tertiary-token'
                />
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type='email'
                  placeholder='Email (optional, for a reply)'
                  className='w-full rounded-lg border border-subtle bg-transparent px-3 py-1.5 text-sm text-primary-token placeholder:text-tertiary-token'
                />
                <button
                  type='button'
                  onClick={() => void sendMessage()}
                  disabled={pending}
                  className='w-full rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-primary-token transition-colors duration-subtle hover:opacity-90 disabled:opacity-50'
                >
                  Send message
                </button>
              </div>
            )}

            {intentFlow && (
              <div className='space-y-2 rounded-xl border border-subtle p-3'>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type='email'
                  placeholder='Email'
                  className='w-full rounded-lg border border-subtle bg-transparent px-3 py-1.5 text-sm text-primary-token placeholder:text-tertiary-token'
                />
                {intentFlow === 'local_show_alerts' && (
                  <input
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder='Your city'
                    className='w-full rounded-lg border border-subtle bg-transparent px-3 py-1.5 text-sm text-primary-token placeholder:text-tertiary-token'
                  />
                )}
                <button
                  type='button'
                  onClick={() => void submitIntent()}
                  disabled={pending || !email.trim()}
                  className='w-full rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-primary-token transition-colors duration-subtle hover:opacity-90 disabled:opacity-50'
                >
                  Notify me
                </button>
              </div>
            )}
          </div>

          <form
            className='flex items-center gap-2 border-t border-subtle px-3 py-2'
            onSubmit={e => {
              e.preventDefault();
              if (escalating || unansweredQuestion) {
                void sendMessage();
              } else {
                void ask(input);
              }
            }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                escalating ? 'Add a message…' : `Ask about ${artistName}…`
              }
              className='min-w-0 flex-1 rounded-full bg-surface-1 px-3 py-2 text-sm text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
            />
            <button
              type='submit'
              disabled={pending || !input.trim()}
              aria-label='Send'
              className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary-token transition-colors duration-subtle hover:opacity-90 disabled:opacity-40'
            >
              <Send className='h-4 w-4' aria-hidden='true' />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
