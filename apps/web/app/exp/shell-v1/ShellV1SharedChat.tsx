'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { ThreadTurn } from '@/components/shell/ThreadTurn';
import { cn } from '@/lib/utils';

type DemoChatTurn = {
  readonly id: string;
  readonly speaker: 'jovie' | 'me';
  readonly content: string;
};

function assistantReplyFor(prompt: string): string {
  return [
    `Here’s the cleanest next move for **${prompt.toLowerCase()}**.`,
    '',
    '**Start with the part that unlocks everything else:**',
    '',
    '- Choose the one outcome that matters most',
    '- Set a date you can actually keep',
    '- Prepare the fan-facing message before adding more channels',
    '',
    'I can turn that into a short plan and keep it moving from here.',
  ].join('\n');
}

export function ShellV1SharedChatCanvas() {
  const [composerValue, setComposerValue] = useState('');
  const [turns, setTurns] = useState<DemoChatTurn[]>([]);
  const nextTurnIdRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const isActive = turns.length > 0;

  useEffect(() => {
    if (!isActive) return;
    transcriptEndRef.current?.scrollIntoView({ block: 'end' });
  }, [isActive, turns]);

  const submitPrompt = () => {
    const prompt = composerValue.trim();
    if (!prompt) return;

    nextTurnIdRef.current += 1;
    const turnId = `demo-${nextTurnIdRef.current}`;
    setTurns(previous => [
      ...previous,
      { id: `${turnId}-me`, speaker: 'me', content: prompt },
      {
        id: `${turnId}-jovie`,
        speaker: 'jovie',
        content: assistantReplyFor(prompt),
      },
    ]);
    setComposerValue('');
  };

  return (
    <article
      className='relative flex h-full min-h-0 flex-col'
      data-testid='shell-v1-chat'
    >
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          isActive && 'pb-40'
        )}
        data-testid='shell-v1-chat-transcript'
      >
        {isActive ? (
          <div className='mx-auto flex w-full max-w-prose flex-col gap-5 px-4 pt-8 sm:px-6 sm:pt-12'>
            {turns.map(turn => (
              <ThreadTurn key={turn.id} speaker={turn.speaker}>
                {turn.speaker === 'jovie' ? (
                  <ChatMarkdown
                    content={turn.content}
                    className='max-w-(--linear-prose-max) leading-relaxed [&_li]:my-1 [&_p]:mb-3'
                  />
                ) : (
                  turn.content
                )}
              </ThreadTurn>
            ))}
            <div ref={transcriptEndRef} className='h-px' aria-hidden='true' />
          </div>
        ) : null}
      </div>

      <footer
        className={cn(
          'pointer-events-none absolute inset-x-0 z-20 px-4 transition-[bottom,transform,background-color] duration-cinematic ease-cinematic motion-reduce:transition-none sm:px-6',
          isActive
            ? 'bottom-0 bg-(--app-shell-content-surface) pb-[max(1rem,env(safe-area-inset-bottom))] pt-3'
            : 'bottom-1/2 translate-y-1/2'
        )}
        data-testid='shell-v1-chat-composer'
      >
        <div className='pointer-events-auto mx-auto w-full max-w-[45rem]'>
          <ChatInput
            value={composerValue}
            onChange={setComposerValue}
            onSubmit={event => {
              event?.preventDefault();
              submitPrompt();
            }}
            isLoading={false}
            isSubmitting={false}
            placeholder='Ask Jovie'
            variant={isActive ? 'default' : 'start'}
          />
        </div>
      </footer>
    </article>
  );
}

export function ShellV1SharedChat() {
  return (
    <AppShellFrame
      sidebar={null}
      containerClassName='[color-scheme:dark]'
      contentClassName='overflow-hidden!'
      main={<ShellV1SharedChatCanvas />}
    />
  );
}
