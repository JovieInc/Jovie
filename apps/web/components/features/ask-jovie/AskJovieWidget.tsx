'use client';

import { Button } from '@jovie/ui';
import { Send, X } from 'lucide-react';
import {
  type InputHTMLAttributes,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { JovieIcon } from '@/components/atoms/JovieIcon';
import { FilterChip } from '@/components/molecules/filters';
import { EntityCard } from '@/components/organisms/entity-card';
import type {
  EntityCardModel,
  EntityKind,
} from '@/components/organisms/entity-card/types';
import { track } from '@/lib/analytics';
import type { AskJovieQuestionIntent } from '@/lib/ask-jovie/answer';
import { PROFILE_Z } from '@/lib/profile/z-index-constants';
import { cn } from '@/lib/utils';

interface AskJovieWidgetProps {
  /** Profile handle the conversation is scoped to. */
  readonly username: string;
  /** Display name used in visitor-facing copy. */
  readonly artistName: string;
}

type FollowIntent = 'new_release_alerts' | 'local_show_alerts';

type ChatMessage = {
  readonly id: number;
  readonly role: 'visitor' | 'jovie';
  readonly text: string;
  readonly card?: EntityCardModel;
  readonly followUp?: {
    readonly intent: FollowIntent;
    readonly label: string;
  };
  readonly normalizedIntent?: AskJovieQuestionIntent;
  readonly sourceRevision?: string;
};

type MessageCategory =
  | 'fan_mail'
  | 'booking'
  | 'press'
  | 'collaboration'
  | 'business'
  | 'other';

type Flow = 'escalate' | FollowIntent;

type CardOutcome =
  | 'listen'
  | 'tickets'
  | 'shop'
  | 'watch'
  | 'view'
  | 'message'
  | 'subscribe';

const CARD_OUTCOMES: Partial<Record<EntityKind, CardOutcome>> = {
  music: 'listen',
  show: 'tickets',
  merch: 'shop',
  video: 'watch',
  alerts: 'subscribe',
};

function outcomeForMessage(message: ChatMessage): CardOutcome | undefined {
  if (!message.card) return undefined;
  if (message.normalizedIntent === 'business') return 'message';
  if (message.normalizedIntent === 'official_links') return 'view';
  if (message.card.kind === 'show' && message.card.cta?.label === 'Notify Me') {
    return 'subscribe';
  }
  return CARD_OUTCOMES[message.card.kind];
}

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

const INPUT_CLASS =
  'w-full rounded-lg border border-subtle bg-transparent px-3 py-1.5 text-sm text-primary-token placeholder:text-tertiary-token';
const CARD_CLASS = 'space-y-2 rounded-xl border border-subtle p-3';

const Field = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={INPUT_CLASS} />
);

function CardAction({
  disabled,
  onSubmit,
  children,
}: {
  disabled?: boolean;
  onSubmit: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <Button
      type='button'
      variant='secondary'
      onClick={() => void onSubmit()}
      disabled={disabled}
      className='w-full'
    >
      {children}
    </Button>
  );
}

let nextMessageId = 1;
const makeMessage = (
  role: ChatMessage['role'],
  text: string,
  details: Omit<ChatMessage, 'id' | 'role' | 'text'> = {}
): ChatMessage => ({ id: nextMessageId++, role, text, ...details });

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
  const [unansweredQuestion, setUnansweredQuestion] = useState<string | null>(
    null
  );
  const [flow, setFlow] = useState<Flow | null>(null);
  const [category, setCategory] = useState<MessageCategory>('fan_mail');
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
          keepalive: body.action === 'outcome',
        }
      );
      return res.json().catch(() => ({}));
    },
    [username]
  );

  const reply = (
    text: string,
    details: Omit<ChatMessage, 'id' | 'role' | 'text'> = {}
  ) => pushMessages(makeMessage('jovie', text, details));

  const recordCardOutcome = useCallback(
    (message: ChatMessage) => {
      const { card, normalizedIntent, sourceRevision } = message;
      const outcome = outcomeForMessage(message);
      if (!card || !outcome || !normalizedIntent || !sourceRevision) return;
      track('ask_jovie_entity_action', {
        username,
        intent: normalizedIntent,
        entityType: card.kind,
        outcome,
      });
      void post({
        action: 'outcome',
        intent: normalizedIntent,
        outcome,
        entityType: card.kind,
        entityId: card.id,
        sourceRevision,
      }).catch(() => {});
    },
    [post, username]
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
    setFlow(null);
    pushMessages(makeMessage('visitor', trimmed));
    setPending(true);
    track('ask_jovie_question', { username });
    try {
      const data = await post({ action: 'question', question: trimmed });
      if (data.answered && typeof data.text === 'string') {
        track('ask_jovie_answered', { username });
        reply(data.text, {
          card: data.card,
          followUp: data.followUp,
          normalizedIntent: data.intent,
          sourceRevision: data.provenance?.sourceRevision,
        });
      } else {
        track('ask_jovie_unanswered', { username });
        setUnansweredQuestion(trimmed);
        reply(
          `I don't have that on file for ${artistName}. Want me to send your question to them?`
        );
      }
    } catch {
      reply('Something went wrong on my end — try again in a moment.');
    } finally {
      setPending(false);
    }
  };

  const sendMessage = async () => {
    const body = input.trim() || unansweredQuestion || '';
    if (!body || pending) return;
    setPending(true);
    setInput('');
    try {
      const data = await post({
        action: 'message',
        category,
        message: body,
        name: name || undefined,
        email: email || undefined,
        question: unansweredQuestion ?? undefined,
      });
      if (data.success) {
        track('ask_jovie_message_sent', { username, category });
        reply(
          `Done — I sent that to ${artistName}${
            email ? ' and noted your email so they can reply' : ''
          }.`
        );
        setFlow(null);
        setUnansweredQuestion(null);
      } else {
        reply(
          typeof data.error === 'string'
            ? data.error
            : "I couldn't send that — try again."
        );
      }
    } catch {
      reply("I couldn't send that — try again.");
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
        intent: flow,
        email: email.trim(),
        name: name || undefined,
        city: city || undefined,
      });
      if (data.success) {
        track('ask_jovie_intent_captured', { username, intent: flow });
        const what =
          flow === 'local_show_alerts'
            ? `when ${artistName} plays${city ? ` near ${city}` : ' near you'}`
            : `when ${artistName} drops new music`;
        reply(`You're on the list — I'll let you know ${what}.`);
        setFlow(null);
        setCity('');
      } else {
        reply(
          typeof data.error === 'string'
            ? data.error
            : 'Please enter a valid email address.'
        );
      }
    } catch {
      reply('Something went wrong — try again.');
    } finally {
      setPending(false);
    }
  };

  const startIntent = (intent: FollowIntent) => {
    setFlow(intent);
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
      {!open && (
        <Button
          type='button'
          variant='secondary'
          onClick={openWidget}
          aria-label={`Ask Jovie about ${artistName}`}
          data-ask-jovie-launcher=''
          className={cn(
            'group fixed right-4 bottom-4',
            PROFILE_Z.DRAWER_CONTENT
          )}
        >
          <JovieIcon size={22} className='shrink-0' />
          <span className='hidden group-hover:inline'>Ask Jovie</span>
        </Button>
      )}

      {open && (
        <div
          role='dialog'
          aria-label={`Ask Jovie about ${artistName}`}
          className={cn(
            'fixed inset-x-4 bottom-4 flex max-h-120 flex-col overflow-hidden rounded-2xl bg-surface-0 shadow-2xl ring-1 ring-(--color-border-subtle) backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-subtle ease-out motion-reduce:animate-none sm:left-auto sm:w-88',
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
            <CircleIconButton
              variant='ghost'
              size='xs'
              onClick={() => setOpen(false)}
              ariaLabel='Close Ask Jovie'
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </CircleIconButton>
          </div>

          <div
            className='flex-1 space-y-2 overflow-y-auto px-4 py-3'
            ref={listRef}
          >
            {messages.map(msg =>
              msg.role === 'visitor' ? (
                <div
                  key={msg.id}
                  className='ml-auto max-w-4/5 rounded-2xl bg-surface-2 px-3 py-2 text-sm leading-snug text-primary-token'
                >
                  {msg.text}
                </div>
              ) : (
                <div key={msg.id} className='mr-auto max-w-4/5 space-y-2'>
                  <div className='rounded-2xl bg-surface-1 px-3 py-2 text-sm leading-snug text-primary-token'>
                    {msg.text}
                  </div>
                  {msg.card ? (
                    <EntityCard
                      model={msg.card}
                      treatment='compact'
                      className='w-full'
                      dataTestId={`ask-jovie-${msg.card.kind}-card`}
                      onClick={() => recordCardOutcome(msg)}
                    />
                  ) : null}
                  {msg.followUp ? (
                    <FilterChip
                      pressed={false}
                      onClick={() => startIntent(msg.followUp!.intent)}
                    >
                      {msg.followUp.label}
                    </FilterChip>
                  ) : null}
                </div>
              )
            )}
            {pending && (
              <div className='mr-auto rounded-2xl bg-surface-1 px-3 py-2 text-sm text-tertiary-token'>
                …
              </div>
            )}

            {messages.length <= 1 && (
              <div className='flex flex-wrap gap-1.5 pt-1'>
                {[
                  ...SUGGESTED_QUESTIONS.map(q => ({
                    label: q,
                    run: () => void ask(q),
                  })),
                  ...INTENT_LABELS.map(i => ({
                    label: i.label,
                    run: () => startIntent(i.id),
                  })),
                ].map(chip => (
                  <FilterChip
                    key={chip.label}
                    pressed={false}
                    onClick={chip.run}
                  >
                    {chip.label}
                  </FilterChip>
                ))}
              </div>
            )}

            {unansweredQuestion && flow === null && (
              <FilterChip pressed={false} onClick={() => setFlow('escalate')}>
                Send to {artistName}
              </FilterChip>
            )}

            {flow === 'escalate' && (
              <div className={CARD_CLASS}>
                <p className='text-xs font-medium text-secondary-token'>
                  What is this about?
                </p>
                <div className='flex flex-wrap gap-1.5'>
                  {CATEGORY_LABELS.map(c => (
                    <FilterChip
                      key={c.id}
                      pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.label}
                    </FilterChip>
                  ))}
                </div>
                <Field
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder='Name (optional)'
                />
                <Field
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type='email'
                  placeholder='Email (optional, for a reply)'
                />
                <CardAction disabled={pending} onSubmit={sendMessage}>
                  Send Message
                </CardAction>
              </div>
            )}

            {flow !== null && flow !== 'escalate' && (
              <div className={CARD_CLASS}>
                <Field
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type='email'
                  placeholder='Email'
                />
                {flow === 'local_show_alerts' && (
                  <Field
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder='Your city'
                  />
                )}
                <CardAction
                  disabled={pending || !email.trim()}
                  onSubmit={submitIntent}
                >
                  Notify Me
                </CardAction>
              </div>
            )}
          </div>

          <form
            className='flex items-center gap-2 border-t border-subtle px-3 py-2'
            onSubmit={e => {
              e.preventDefault();
              if (flow === 'escalate' || unansweredQuestion) {
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
                flow === 'escalate'
                  ? 'Add a message…'
                  : `Ask about ${artistName}…`
              }
              className='min-w-0 flex-1 rounded-full bg-surface-1 px-3 py-2 text-sm text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
            />
            <CircleIconButton
              type='submit'
              variant='surface'
              size='xs'
              disabled={pending || !input.trim()}
              ariaLabel='Send'
            >
              <Send className='h-4 w-4' aria-hidden='true' />
            </CircleIconButton>
          </form>
        </div>
      )}
    </>
  );
}
