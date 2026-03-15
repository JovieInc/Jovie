'use client';

import { Button } from '@jovie/ui';
import { Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

export interface StarterEmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary';
}

export interface StarterEmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly icon?: React.ReactNode;
  readonly primaryAction?: StarterEmptyStateAction;
  readonly secondaryAction?: StarterEmptyStateAction;
  readonly className?: string;
  readonly testId?: string;
}

export function StarterEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
  testId,
}: StarterEmptyStateProps) {
  const renderAction = (
    action: StarterEmptyStateAction,
    isPrimary: boolean
  ) => {
    const variant = action.variant ?? (isPrimary ? 'primary' : 'secondary');

    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Button
            key={`${action.label}-${action.href}`}
            asChild
            variant={variant === 'primary' ? 'primary' : 'secondary'}
            size='sm'
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        );
      }

      return (
        <Button
          key={`${action.label}-${action.href}`}
          asChild
          variant={variant === 'primary' ? 'primary' : 'secondary'}
          size='sm'
        >
          <a href={action.href} onClick={action.onClick}>
            {action.label}
          </a>
        </Button>
      );
    }

    return (
      <Button
        key={action.label}
        type='button'
        variant={variant === 'primary' ? 'primary' : 'secondary'}
        size='sm'
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    );
  };

  return (
    <ContentSurfaceCard
      aria-live='polite'
      data-testid={testId ?? 'app-empty-state'}
      className={cn('border-dashed bg-(--linear-bg-surface-1) p-6', className)}
    >
      <div className='flex items-start gap-4'>
        <div className='flex h-12 w-12 items-center justify-center rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-primary) shadow-sm'>
          {icon ?? <Sparkles className='h-6 w-6' aria-hidden='true' />}
        </div>
        <div className='flex-1 space-y-2'>
          <div>
            <p className='text-sm font-medium text-(--linear-text-primary)'>
              {title}
            </p>
            <p className='text-sm text-(--linear-text-secondary)'>
              {description}
            </p>
          </div>

          {(primaryAction || secondaryAction) && (
            <div className='flex flex-wrap gap-3'>
              {primaryAction ? renderAction(primaryAction, true) : null}
              {secondaryAction ? renderAction(secondaryAction, false) : null}
            </div>
          )}
        </div>

        <Rocket
          className='hidden h-10 w-10 text-(--linear-accent) sm:block'
          aria-hidden='true'
        />
      </div>
    </ContentSurfaceCard>
  );
}
