'use client';

import { Button } from '@jovie/ui';
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

type OpportunityCardProps = {
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly className?: string;
  readonly dataTestId?: string;
} & (
  | {
      readonly format: 'compact';
      readonly disabled?: boolean;
      readonly onSelect: () => void;
    }
  | {
      readonly format: 'editorial';
      readonly metadata: ReactNode;
      readonly children: ReactNode;
    }
);

/** Two presentation formats: a lightweight action, or a full editorial card. */
export function OpportunityCard(props: OpportunityCardProps) {
  const descriptionId = useId();
  if (props.format === 'compact') {
    return (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={props.onSelect}
        disabled={props.disabled}
        aria-label={props.title}
        aria-describedby={descriptionId}
        data-opportunity-format='compact'
        data-testid={props.dataTestId}
        className={cn(
          'w-full justify-start gap-2 text-left font-normal',
          props.className
        )}
      >
        <span aria-hidden='true' className='shrink-0'>
          {props.icon}
        </span>
        <span className='min-w-0 truncate'>{props.title}</span>
        <span id={descriptionId} className='sr-only'>
          {props.description}
        </span>
      </Button>
    );
  }
  return (
    <article
      className={cn('system-b-opportunity-inbox-card', props.className)}
      data-opportunity-format='editorial'
      data-testid={props.dataTestId}
    >
      <header className='system-b-opportunity-inbox-card-meta'>
        {props.icon}
        {props.metadata}
      </header>
      <h2 className='system-b-opportunity-inbox-card-title'>{props.title}</h2>
      <p className='system-b-opportunity-inbox-card-why'>{props.description}</p>
      {props.children}
    </article>
  );
}
