'use client';

import { AlertCircle, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatActionCardProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly onAct: () => void;
  readonly onDismiss: () => void;
  readonly className?: string;
}

export function ChatActionCard({
  title,
  body,
  actionLabel,
  onAct,
  onDismiss,
  className,
}: ChatActionCardProps) {
  return (
    <article
      className={cn(
        'relative grid min-h-[148px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-[16px] border border-[color-mix(in_oklab,var(--linear-border-focus)_22%,var(--linear-app-frame-seam))] bg-[linear-gradient(180deg,rgba(255,255,255,0.052)_0%,rgba(255,255,255,0.016)_100%),var(--linear-app-content-surface)] px-4 py-4 text-left shadow-none sm:min-h-[132px] sm:items-center sm:px-5',
        className
      )}
      data-testid='chat-action-card'
    >
      <span
        className='mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-secondary-token sm:mt-0'
        aria-hidden='true'
      >
        <AlertCircle className='h-4 w-4' strokeWidth={2.2} />
      </span>

      <div className='min-w-0 pr-1'>
        <h2 className='text-pretty text-[15px] font-semibold leading-5 text-primary-token sm:text-[15.5px]'>
          {title}
        </h2>
        <p className='mt-1.5 max-w-[48ch] text-pretty text-[12.5px] leading-5 text-tertiary-token'>
          {body}
        </p>
        <button
          type='button'
          onClick={onAct}
          className='mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-medium text-black shadow-[0_6px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.45)] transition-[filter,box-shadow] duration-subtle ease-out hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
        >
          {actionLabel}
          <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.5} />
        </button>
      </div>

      <button
        type='button'
        onClick={onDismiss}
        className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-subtle hover:bg-white/[0.06] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/45'
        aria-label={`Dismiss ${title}`}
      >
        <X className='h-3.5 w-3.5' strokeWidth={2.25} />
      </button>
    </article>
  );
}
