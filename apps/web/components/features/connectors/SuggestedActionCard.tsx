'use client';

import { Button } from '@jovie/ui';
import { CalendarPlus, Clock, Mail, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourceRef {
  readonly messageId: string;
  readonly subject: string;
}

export interface SuggestedActionCardProps {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly venueName?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly sourceRef: SourceRef;
  readonly status:
    | 'pending'
    | 'approved'
    | 'executed'
    | 'rejected'
    | 'failed'
    | 'expired';
  /** READ-ONLY for C-PR-2 — Approve/Reject endpoints are wired in C-PR-3. */
  readonly onApprove?: () => void;
  /** READ-ONLY for C-PR-2 — wired in C-PR-3. */
  readonly onReject?: () => void;
  readonly className?: string;
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildLocationLine(
  venueName: string | null | undefined,
  city: string | null | undefined,
  region: string | null | undefined,
  country: string | null | undefined
): string | null {
  const parts = [venueName, city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function confidenceDotClass(confidence: number): string {
  if (confidence >= 0.9) return 'bg-green-500';
  if (confidence >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Preview card for a suggested calendar event awaiting DJ approval.
 * READ-ONLY in C-PR-2: Approve/Reject endpoints are wired in C-PR-3.
 * The slot-based preview block is ready for v1.1 fan-facing side effects.
 */
export function SuggestedActionCard({
  id,
  title,
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
  const locationLine = buildLocationLine(venueName, city, region, country);
  const isPending = status === 'pending';

  return (
    <div
      className={cn(
        'rounded-lg border border-subtle bg-surface-0 p-4 space-y-3',
        className
      )}
      data-testid={`suggested-action-card-${id}`}
    >
      {/* Header */}
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <CalendarPlus className='h-4 w-4 shrink-0 text-secondary' />
          <span className='text-sm font-medium text-primary'>{title}</span>
        </div>
        <div
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            confidenceDotClass(confidence)
          )}
          title={`Confidence: ${Math.round(confidence * 100)}%`}
        />
      </div>

      {/* Time */}
      <div className='flex items-center gap-1.5 text-xs text-secondary'>
        <Clock className='h-3.5 w-3.5 shrink-0' />
        <span>
          {formatDateTime(startsAt)}
          {endsAt && ` – ${formatDateTime(endsAt)}`}
        </span>
      </div>

      {/* Location */}
      {locationLine && (
        <div className='flex items-center gap-1.5 text-xs text-secondary'>
          <MapPin className='h-3.5 w-3.5 shrink-0' />
          <span>{locationLine}</span>
        </div>
      )}

      {/* Source email chip */}
      <div className='flex items-center gap-1.5'>
        <Mail className='h-3 w-3 shrink-0 text-tertiary' />
        <span
          className='truncate text-xs text-tertiary'
          title={sourceRef.subject}
        >
          {sourceRef.subject}
        </span>
      </div>

      {/* Rationale */}
      <p className='text-xs text-tertiary italic'>{rationale}</p>

      {/* v1.1 side-effects slot (empty in v1) */}
      {/* When v1.1 ships, fill this slot with fan-facing side effect previews */}

      {/* Actions — READ-ONLY until C-PR-3 wires the endpoints */}
      {isPending && (
        <div className='flex gap-2 pt-1'>
          <Button
            size='sm'
            onClick={onApprove}
            disabled={!onApprove}
            className='flex-1'
          >
            Approve
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={onReject}
            disabled={!onReject}
            className='flex-1'
          >
            Reject
          </Button>
        </div>
      )}

      {!isPending && (
        <div className='text-xs text-tertiary capitalize'>Status: {status}</div>
      )}
    </div>
  );
}
