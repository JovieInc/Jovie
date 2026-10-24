'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopCanvas.test.tsx
import { Button } from '@jovie/ui';
import {
  ChevronLeft,
  ChevronRight,
  House,
  MessageSquareText,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * The generated part of a living Home canvas: the prompt, the reply, and the
 * structured cards rendered in place. History controls step through earlier
 * canvas states without leaving Home. The panel reserves its minimum height
 * while a reply streams, so the card swap does not move the sections below.
 */
export function HomeLoopAnswerPanel({
  prompt,
  reply,
  pending,
  position,
  total,
  onBack,
  onForward,
  onHome,
  onOpenTranscript,
  children,
}: Readonly<{
  readonly prompt: string;
  readonly reply: string;
  readonly pending: boolean;
  /** 1-based position of this state in the canvas history. */
  readonly position: number;
  readonly total: number;
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onHome: () => void;
  readonly onOpenTranscript: () => void;
  /** Structured cards for this turn, already rendered by the persona. */
  readonly children?: ReactNode;
}>) {
  return (
    <section
      aria-busy={pending}
      aria-label='Generated Answer'
      aria-live='polite'
      className='flex min-h-32 flex-col gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2'
      data-state={pending ? 'pending' : 'ready'}
      data-testid='home-loop-answer'
    >
      <header className='flex items-center gap-2'>
        <p className='min-w-0 flex-1 truncate text-xs text-tertiary-token'>
          {prompt}
        </p>
        <span className='text-2xs tabular-nums text-tertiary-token'>
          {`${position} of ${total}`}
        </span>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label='Previous Answer'
          disabled={position <= 1}
          onClick={onBack}
        >
          <ChevronLeft aria-hidden='true' className='size-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label='Next Answer'
          disabled={position >= total}
          onClick={onForward}
        >
          <ChevronRight aria-hidden='true' className='size-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label='Open Conversation'
          onClick={onOpenTranscript}
        >
          <MessageSquareText aria-hidden='true' className='size-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label='Back To Home'
          onClick={onHome}
          data-testid='home-loop-answer-home'
        >
          <House aria-hidden='true' className='size-3.5' />
        </Button>
      </header>
      {reply ? (
        <p className='line-clamp-4 whitespace-pre-line text-sm text-primary-token'>
          {reply}
        </p>
      ) : pending ? (
        <div
          className='flex flex-col gap-1.5'
          data-testid='home-loop-answer-pending'
        >
          <LoadingSkeleton height='h-3' width='w-4/5' />
          <LoadingSkeleton height='h-3' width='w-3/5' />
        </div>
      ) : null}
      {children ? (
        <div className='grid gap-2 xl:grid-cols-2'>{children}</div>
      ) : null}
    </section>
  );
}
