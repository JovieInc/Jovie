'use client';

import { Badge, Button } from '@jovie/ui';
import { CalendarPlus, Clock, Mail, MapPin, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { CALENDAR_CREATE_EVENT_KIND } from '@/lib/connectors/suggested-action-kinds';
import { cn } from '@/lib/utils';

interface SourceRef {
  readonly messageId: string;
  readonly subject: string;
}

export interface SuggestedActionCardProps {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly presentation?: 'card' | 'row';
  readonly reviewHref?: string;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly venueName?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly confidence: number | null;
  readonly rationale: string;
  readonly sourceRef: SourceRef;
  readonly status:
    | 'pending'
    | 'approved'
    | 'executed'
    | 'rejected'
    | 'failed'
    | 'expired';
  /** Supply a handler only when this surface can execute the action. */
  readonly onApprove?: () => void;
  /** Supply a handler only when this surface can reject the action. */
  readonly onReject?: () => void;
  readonly className?: string;
}

const ACTION_STATUS = {
  approved: { label: 'Approved', tone: 'info' },
  executed: { label: 'Executed', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'error' },
  expired: { label: 'Expired', tone: 'neutral' },
} as const;

function formatDateTime(iso: string): string | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(iso)) {
    return null;
  }
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.toISOString().slice(0, 10) !== iso.slice(0, 10)) return null;

  const date = new Date(isDateOnly ? `${iso}T00:00:00.000Z` : iso);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(isDateOnly
        ? { timeZone: 'UTC' }
        : { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    }).format(date);
  } catch {
    return null;
  }
}

function buildLocationLine(
  venueName: string | null | undefined,
  city: string | null | undefined,
  region: string | null | undefined,
  country: string | null | undefined
): string | null {
  const parts = [venueName, city, region, country]
    .map(value => (typeof value === 'string' ? value.trim() : null))
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(', ') : null;
}

function getConfidencePresentation(confidence: number | null): {
  readonly label: string;
  readonly percentage: number | null;
  readonly tone: 'success' | 'warning' | 'error' | 'neutral';
} {
  if (confidence === null || !Number.isFinite(confidence)) {
    return {
      label: 'Confidence Unavailable',
      percentage: null,
      tone: 'neutral',
    };
  }
  const normalizedConfidence = Math.min(1, Math.max(0, confidence));
  const percentage = Math.round(normalizedConfidence * 100);

  if (normalizedConfidence >= 0.9) {
    return { label: 'High Confidence', percentage, tone: 'success' };
  }
  if (normalizedConfidence >= 0.7) {
    return { label: 'Medium Confidence', percentage, tone: 'warning' };
  }
  return { label: 'Low Confidence', percentage, tone: 'error' };
}

export function SuggestedActionCard({
  id,
  title,
  kind = CALENDAR_CREATE_EVENT_KIND,
  presentation = 'card',
  reviewHref,
  startsAt,
  endsAt,
  venueName,
  city,
  region,
  country,
  confidence,
  rationale,
  sourceRef,
  status,
  onApprove,
  onReject,
  className,
}: SuggestedActionCardProps) {
  const startsAtLabel = formatDateTime(startsAt);
  const endsAtLabel = endsAt ? formatDateTime(endsAt) : null;
  const locationLine =
    buildLocationLine(venueName, city, region, country) ??
    'Location unavailable';
  const rawSubject = sourceRef?.subject;
  const sourceSubject =
    (typeof rawSubject === 'string' && rawSubject.trim()) ||
    'Source email unavailable';
  const confidencePresentation = getConfidencePresentation(confidence);
  const isPending = status === 'pending';
  const isCalendar = kind === CALENDAR_CREATE_EVENT_KIND;
  const ActionIcon = isCalendar ? CalendarPlus : Sparkles;
  const confidenceLabel =
    confidencePresentation.percentage === null
      ? confidencePresentation.label
      : `${confidencePresentation.label}, ${confidencePresentation.percentage}%`;

  return (
    <article
      className={cn(
        'space-y-3',
        presentation === 'card'
          ? 'rounded-lg border border-subtle bg-surface-0 p-4'
          : 'py-4',
        className
      )}
      data-testid={`suggested-action-card-${id}`}
      data-status={status}
    >
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='flex min-w-0 items-start gap-2'>
          <ActionIcon
            className='mt-0.5 h-4 w-4 shrink-0 text-secondary'
            aria-hidden='true'
          />
          <h3 className='min-w-0 text-balance text-sm font-medium text-primary'>
            {title}
          </h3>
        </div>
        {isCalendar && (
          <Badge
            variant='outline'
            size='sm'
            tone={confidencePresentation.tone}
            className='shrink-0'
            aria-label={confidenceLabel}
          >
            {confidencePresentation.label}
            {confidencePresentation.percentage !== null &&
              ` · ${confidencePresentation.percentage}%`}
          </Badge>
        )}
      </div>

      {isCalendar && (
        <>
          <div className='flex flex-wrap items-center gap-1.5 text-xs text-secondary'>
            <Clock className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
            {startsAtLabel ? (
              <time dateTime={startsAt}>{startsAtLabel}</time>
            ) : (
              <span>Date unavailable</span>
            )}
            {endsAtLabel && (
              <>
                {' – '}
                <time dateTime={endsAt ?? undefined}>{endsAtLabel}</time>
              </>
            )}
          </div>

          <div className='flex items-center gap-1.5 text-xs text-secondary'>
            <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
            <span>{locationLine}</span>
          </div>

          <div className='flex items-center gap-1.5'>
            <Mail
              className='h-3 w-3 shrink-0 text-tertiary'
              aria-hidden='true'
            />
            <span
              className='truncate text-xs text-tertiary'
              title={
                sourceSubject === 'Source email unavailable'
                  ? undefined
                  : sourceSubject
              }
            >
              {sourceSubject}
            </span>
          </div>
        </>
      )}

      {rationale && (
        <p className='break-words text-xs text-secondary'>{rationale}</p>
      )}

      <div className='flex min-h-7 items-center pt-1'>
        {isPending && reviewHref ? (
          <Button size='sm' variant='secondary' asChild>
            <Link href={reviewHref} aria-label={`Review ${title} in Inbox`}>
              Review in Inbox
            </Link>
          </Button>
        ) : isPending ? (
          <div className='flex w-full gap-2'>
            <Button
              size='sm'
              onClick={onApprove}
              disabled={!onApprove}
              className='flex-1'
              aria-label={`Approve ${title}`}
            >
              Approve
            </Button>
            <Button
              size='sm'
              variant='secondary'
              onClick={onReject}
              disabled={!onReject}
              className='flex-1'
              aria-label={`Reject ${title}`}
            >
              Reject
            </Button>
          </div>
        ) : (
          <Badge
            variant='outline'
            size='sm'
            tone={ACTION_STATUS[status].tone}
            role='status'
            aria-label={`Status: ${ACTION_STATUS[status].label}`}
          >
            Status: {ACTION_STATUS[status].label}
          </Badge>
        )}
      </div>
    </article>
  );
}
