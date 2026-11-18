'use client';

import { Button } from '@jovie/ui';
import { Check, Lock, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { formatTakeDuration } from '@/lib/teleprompter/studio-recorder';
import type { TeleprompterTakeSource } from '@/lib/teleprompter/takes/contract';
import { cn } from '@/lib/utils';

export interface StudioTake {
  readonly id: string;
  readonly number: number;
  readonly source: TeleprompterTakeSource;
  readonly question?: string;
  readonly durationMs: number;
  readonly localUrl: string;
  readonly status: 'uploading' | 'saved' | 'failed';
  readonly kept: boolean;
}

interface StudioTakesSheetProps {
  readonly title: string;
  readonly takes: readonly StudioTake[];
  readonly onToggleKept: (takeId: string) => void;
  readonly onRetry: (takeId: string) => void;
  readonly onDone: () => void;
}

function takeDetail(take: StudioTake): string {
  if (take.status === 'uploading') return 'Saving…';
  if (take.status === 'failed') return "Didn't save";
  return take.source === 'answer'
    ? `Answer · ${take.question ?? ''}`
    : 'Script';
}

export function StudioTakesSheet({
  title,
  takes,
  onToggleKept,
  onRetry,
  onDone,
}: StudioTakesSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    takes.at(-1)?.id ?? null
  );
  const selected = takes.find(take => take.id === selectedId) ?? takes.at(-1);
  const total = takes.reduce((sum, take) => sum + take.durationMs, 0);

  return (
    <section
      aria-label='Takes'
      style={{
        top: 'calc(var(--studio-ring-width) + 10px)',
        right: 'calc(var(--studio-ring-width) + 10px)',
        bottom: 'calc(var(--studio-ring-width) + 10px)',
      }}
      className='absolute flex w-full max-w-sm flex-col gap-4 rounded-(--system-b-radius-panel) border border-default bg-surface-1 p-4 text-primary-token shadow-xl'
      data-testid='teleprompter-studio-takes'
    >
      <header className='grid gap-1'>
        <h2 className='text-sm font-semibold text-balance'>{title}</h2>
        <p className='text-app text-tertiary-token tabular-nums'>
          {takes.length} {takes.length === 1 ? 'take' : 'takes'} ·{' '}
          {formatTakeDuration(total)}
        </p>
      </header>

      {selected ? (
        <video
          key={selected.id}
          src={selected.localUrl}
          controls
          playsInline
          className='aspect-video w-full -scale-x-100 rounded-(--system-b-radius-card-inner) bg-surface-0 object-cover'
        >
          <track kind='captions' />
        </video>
      ) : null}

      <ul className='grid min-h-0 flex-1 content-start gap-1 overflow-y-auto'>
        {takes.map(take => (
          <li
            key={take.id}
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl p-2',
              take.id === selected?.id && 'bg-surface-2'
            )}
          >
            <Button
              variant='ghost'
              onClick={() => setSelectedId(take.id)}
              className='min-w-0 flex-col items-start'
            >
              <span className='block text-sm font-medium'>
                Take {take.number}{' '}
                <span className='text-tertiary-token tabular-nums'>
                  {formatTakeDuration(take.durationMs)}
                </span>
              </span>
              <span
                className={cn(
                  'block truncate text-app',
                  take.status === 'failed'
                    ? 'text-error-text'
                    : 'text-tertiary-token'
                )}
              >
                {takeDetail(take)}
              </span>
            </Button>
            {take.status === 'failed' ? (
              <Button
                variant='secondary'
                size='sm'
                onClick={() => onRetry(take.id)}
              >
                <RotateCw className='mr-1.5 size-3.5' aria-hidden='true' />
                Retry
              </Button>
            ) : (
              <Button
                variant={take.kept ? 'primary' : 'secondary'}
                size='sm'
                aria-pressed={take.kept}
                disabled={take.status !== 'saved'}
                onClick={() => onToggleKept(take.id)}
              >
                {take.kept ? (
                  <Check className='mr-1.5 size-3.5' aria-hidden='true' />
                ) : null}
                {take.kept ? 'Keeper' : 'Mark Keeper'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <footer className='flex flex-wrap items-center justify-between gap-3'>
        <span className='flex items-center gap-1.5 text-app text-tertiary-token'>
          <Lock className='size-3.5' aria-hidden='true' />
          Only you can see these
        </span>
        <Button variant='primary' onClick={onDone}>
          Done
        </Button>
      </footer>
    </section>
  );
}
