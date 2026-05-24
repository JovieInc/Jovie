'use client';

import { AlertTriangle } from 'lucide-react';

import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

type ReleaseActionErrorCardVariant = 'card' | 'inline';

interface ReleaseActionErrorCardProps {
  readonly message: string;
  readonly actionLabel: string;
  readonly onRetry: () => void;
  readonly title?: string;
  readonly onDismiss?: () => void;
  readonly variant?: ReleaseActionErrorCardVariant;
  readonly testId?: string;
  readonly className?: string;
}

export function ReleaseActionErrorCard({
  message,
  actionLabel,
  onRetry,
  title,
  onDismiss,
  variant = 'card',
  testId,
  className,
}: ReleaseActionErrorCardProps) {
  const isCard = variant === 'card';
  const shellClassName = isCard
    ? 'space-y-2 rounded-[14px] border border-destructive/20 bg-destructive/5 p-3'
    : 'flex w-full items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2';
  const iconWrapperClassName = isCard
    ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-destructive'
    : 'mt-0.25 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-destructive';
  const iconClassName = isCard ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const messageClassName = isCard
    ? 'text-2xs leading-[15px] text-secondary-token'
    : 'text-secondary-token';

  const content = (
    <>
      <div className='flex items-start gap-2'>
        <span className={iconWrapperClassName}>
          <AlertTriangle className={iconClassName} aria-hidden='true' />
        </span>
        <div className='min-w-0 flex-1 space-y-0.5'>
          {title ? (
            <p className='text-xs font-medium text-primary-token'>{title}</p>
          ) : null}
          <p className={messageClassName}>{message}</p>
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <DrawerButton
          type='button'
          onClick={onRetry}
          className='h-7 px-2 text-2xs'
        >
          {actionLabel}
        </DrawerButton>
        {onDismiss ? (
          <DrawerButton
            type='button'
            onClick={onDismiss}
            tone='ghost'
            className='h-7 px-2 text-2xs'
          >
            Dismiss
          </DrawerButton>
        ) : null}
      </div>
    </>
  );

  if (isCard) {
    return (
      <DrawerSurfaceCard
        className={cn(shellClassName, className)}
        testId={testId}
      >
        {content}
      </DrawerSurfaceCard>
    );
  }

  return (
    <div data-testid={testId} className={cn(shellClassName, className)}>
      {content}
    </div>
  );
}
