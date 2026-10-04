'use client';

import { CheckCircle2, CircleDashed, Info, XCircle } from 'lucide-react';
import type {
  OutboundReadiness,
  ReadinessItem,
  ReadinessStatus,
} from '@/lib/outbound/readiness';
import { cn } from '@/lib/utils';

const STATUS_ICON: Record<ReadinessStatus, typeof CheckCircle2> = {
  green: CheckCircle2,
  red: XCircle,
  unknown: CircleDashed,
  info: Info,
};

const STATUS_LABEL: Record<ReadinessStatus, string> = {
  green: 'Ready',
  red: 'Blocking',
  unknown: 'Unknown',
  info: 'Note',
};

function Row({
  item,
  nested = false,
}: Readonly<{ item: ReadinessItem; nested?: boolean }>) {
  const Icon = STATUS_ICON[item.status];
  return (
    <li
      className={cn(
        'flex items-start gap-2 border-b border-subtle px-3 py-2',
        nested && 'pl-9'
      )}
      data-testid={`readiness-${item.id}`}
      data-status={item.status}
    >
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          item.status === 'green'
            ? 'text-success'
            : item.status === 'red'
              ? 'text-destructive'
              : 'text-tertiary-token'
        )}
        aria-label={STATUS_LABEL[item.status]}
      />
      <div className='min-w-0 flex-1'>
        <p className='text-app text-primary-token'>
          {item.href ? (
            <a
              href={item.href}
              className='hover:underline'
              target={item.href.startsWith('http') ? '_blank' : undefined}
              rel='noreferrer'
            >
              {item.label}
            </a>
          ) : (
            item.label
          )}
        </p>
        <p className='text-xs text-secondary-token'>{item.detail}</p>
      </div>
      <span className='shrink-0 text-2xs text-tertiary-token'>
        {item.owner}
      </span>
    </li>
  );
}

/** Onboarding readiness: the wait Tim is in, item by item. */
export function OutboundReadinessPanel({
  readiness,
  isLoading,
  isError,
}: Readonly<{
  readiness: OutboundReadiness | undefined;
  isLoading: boolean;
  isError: boolean;
}>) {
  if (!readiness) {
    return (
      <p className='min-h-24 px-3 py-4 text-xs text-secondary-token'>
        {isError
          ? 'Readiness could not load. Refresh to try again.'
          : isLoading
            ? 'Checking readiness…'
            : ''}
      </p>
    );
  }
  return (
    <ul aria-label='Onboarding Readiness' data-testid='outbound-readiness'>
      {readiness.items.map(item => (
        <li key={item.id} className='list-none'>
          <ul>
            <Row item={item} />
            {item.children?.map(child => (
              <Row key={child.id} item={child} nested />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
