'use client';

// @coverage-via apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx

import {
  Button,
  PlainButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { useDspMatchActions } from '@/features/dashboard/organisms/dsp-matches/hooks';
import { type DspMatch, useDspMatchesQuery } from '@/lib/queries';
import { compareDspMatchConfidence } from '@/lib/queries/useDspMatchesQuery';
import { cn } from '@/lib/utils';
import { isExternalDspImage } from '@/lib/utils/dsp-images';
import './SuggestedDspMatches.actions.css';

const MAX_VISIBLE = 5;

interface SuggestedDspMatchesProps {
  readonly profileId: string;
}

export function SuggestedDspMatches({ profileId }: SuggestedDspMatchesProps) {
  const {
    data: matches,
    isLoading,
    error,
    refetch,
  } = useDspMatchesQuery({
    profileId,
    status: 'suggested',
    enabled: !!profileId,
  });

  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => (matches ? [...matches].sort(compareDspMatchConfidence) : []),
    [matches]
  );

  const { confirmMatch, rejectMatch, isMatchConfirming, isMatchRejecting } =
    useDspMatchActions({
      profileId,
      onConfirmSuccess: () => toast.success('Confirmed'),
      onRejectSuccess: () => toast.success('Rejected'),
      onError: (_err, action) =>
        toast.error(`Failed to ${action}. Please try again.`),
    });

  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  // Zero matches is the common resolution for this query, so a skeleton
  // that renders during `isLoading` and then collapses to empty produces a
  // visible flash-then-shift for most users (JOV-4159 / #13821). Stay at
  // zero footprint while loading (`display: contents` sentinel — not null,
  // so the certificate layout-shift guard stays green) and only occupy space
  // once we know there is something to show.
  if (isLoading) {
    return (
      <div
        className='contents'
        data-testid='suggested-dsp-matches'
        data-state='loading'
        aria-busy='true'
        aria-hidden='true'
      />
    );
  }

  if (error) {
    return (
      <div
        className='mt-3 space-y-1.5'
        data-testid='suggested-dsp-matches'
        data-state='error'
      >
        <SectionHeading count={0} />
        <p className='px-2 text-xs text-tertiary-token'>
          Couldn&apos;t load suggestions.{' '}
          <PlainButton
            type='button'
            onClick={() => refetch()}
            className='suggested-dsp-matches-retry text-accent underline underline-offset-2'
          >
            Retry
          </PlainButton>
        </p>
      </div>
    );
  }

  if (!sorted.length) return null;

  return (
    <div
      className='mt-3 space-y-1.5'
      data-testid='suggested-dsp-matches'
      data-state='ready'
    >
      <SectionHeading count={sorted.length} />
      <p className='px-2 text-app font-book leading-[18px] text-secondary-token'>
        We found profiles that may be you on other platforms. Confirm or dismiss
        each one.
      </p>
      <ul className='space-y-0.5'>
        {visible.map(match => (
          <SuggestedMatchRow
            key={match.id}
            match={match}
            isConfirming={isMatchConfirming(match.id)}
            isRejecting={isMatchRejecting(match.id)}
            onConfirm={() => confirmMatch(match.id)}
            onReject={() => rejectMatch(match.id)}
          />
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <PlainButton
          type='button'
          onClick={() => setExpanded(true)}
          className='suggested-dsp-matches-show-more px-2 text-xs font-book text-accent'
        >
          Show {hiddenCount} more
        </PlainButton>
      ) : null}
    </div>
  );
}

function SectionHeading({ count }: { readonly count: number }) {
  return (
    <div className='flex items-center gap-2 px-2'>
      <span className='text-2xs font-book text-tertiary-token'>Suggested</span>
      {count > 0 ? (
        <span className='inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-1 px-1 text-3xs font-caption text-tertiary-token'>
          {count}
        </span>
      ) : null}
    </div>
  );
}

interface SuggestedMatchRowProps {
  readonly match: DspMatch;
  readonly isConfirming: boolean;
  readonly isRejecting: boolean;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}

function SuggestedMatchRow({
  match,
  isConfirming,
  isRejecting,
  onConfirm,
  onReject,
}: SuggestedMatchRowProps) {
  const busy = isConfirming || isRejecting;
  const label = PROVIDER_LABELS[match.providerId] ?? match.providerId;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setPopoverOpen(true), 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = null;
    setPopoverOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: mouse events trigger popover display, not a click action
    <li
      className={cn(
        'suggested-dsp-match-row group flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-1 focus-within:bg-surface-1',
        busy && 'suggested-dsp-match-row-busy'
      )}
      data-busy={busy ? '' : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <PlainButton
            type='button'
            className='suggested-dsp-match-trigger contents'
          >
            <DspProviderIcon provider={match.providerId} size='sm' />
            <span className='min-w-0 flex-1 truncate text-app font-book text-primary-token'>
              {match.externalArtistName || label}
            </span>
          </PlainButton>
        </PopoverTrigger>
        <div className='suggested-dsp-match-actions flex shrink-0 items-center gap-0.5'>
          <PlainButton
            type='button'
            onClick={e => {
              e.stopPropagation();
              onConfirm();
            }}
            disabled={busy}
            className='suggested-dsp-match-confirm relative inline-flex h-7 w-7 items-center before:absolute before:inset-x-0 before:top-1/2 before:h-10 before:-translate-y-1/2 justify-center rounded-md text-tertiary-token'
            aria-label={`Confirm ${label} match for ${match.externalArtistName || 'Unknown'}`}
          >
            {isConfirming ? (
              <Loader2
                className='h-3.5 w-3.5 animate-spin'
                aria-hidden='true'
              />
            ) : (
              <Check className='h-3.5 w-3.5' aria-hidden='true' />
            )}
          </PlainButton>
          <PlainButton
            type='button'
            onClick={e => {
              e.stopPropagation();
              onReject();
            }}
            disabled={busy}
            className='suggested-dsp-match-reject relative inline-flex h-7 w-7 items-center before:absolute before:inset-x-0 before:top-1/2 before:h-10 before:-translate-y-1/2 justify-center rounded-md text-tertiary-token'
            aria-label={`Reject ${label} match for ${match.externalArtistName || 'Unknown'}`}
          >
            {isRejecting ? (
              <Loader2
                className='h-3.5 w-3.5 animate-spin'
                aria-hidden='true'
              />
            ) : (
              <X className='h-3.5 w-3.5' aria-hidden='true' />
            )}
          </PlainButton>
        </div>
        <PopoverContent
          side='left'
          sideOffset={8}
          className='hidden w-60 rounded-lg border-subtle bg-surface-0 p-3 lg:block'
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <MatchPopoverContent
            match={match}
            label={label}
            isConfirming={isConfirming}
            isRejecting={isRejecting}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        </PopoverContent>
      </Popover>
    </li>
  );
}

function MatchPopoverContent({
  match,
  label,
  isConfirming,
  isRejecting,
  onConfirm,
  onReject,
}: {
  readonly match: DspMatch;
  readonly label: string;
  readonly isConfirming: boolean;
  readonly isRejecting: boolean;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
}) {
  const busy = isConfirming || isRejecting;

  return (
    <div className='space-y-2.5'>
      <div className='flex items-center gap-2.5'>
        {match.externalArtistImageUrl ? (
          <div className='relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-1'>
            <Image
              src={match.externalArtistImageUrl}
              alt={match.externalArtistName || label}
              fill
              sizes='32px'
              className='object-cover'
              unoptimized={isExternalDspImage(match.externalArtistImageUrl)}
            />
          </div>
        ) : (
          <div className='flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-1'>
            <DspProviderIcon provider={match.providerId} size='md' />
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold text-primary-token'>
            {match.externalArtistName || 'Unknown Artist'}
          </p>
          <p className='text-xs font-book text-tertiary-token'>{label}</p>
        </div>
      </div>

      <div className='flex items-center gap-2'>
        {match.confidenceScore !== null ? (
          <ConfidenceBadge score={match.confidenceScore} size='sm' />
        ) : null}
        {match.matchingIsrcCount > 0 ? (
          <span className='text-xs text-tertiary-token'>
            {match.matchingIsrcCount} tracks verified
          </span>
        ) : null}
      </div>

      <div className='flex items-center gap-1.5'>
        {match.externalArtistUrl ? (
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='h-7 flex-1 rounded-full text-xs font-caption'
          >
            <a
              href={match.externalArtistUrl}
              target='_blank'
              rel='noopener noreferrer'
            >
              <ExternalLink className='mr-1 h-3 w-3' aria-hidden='true' />
              Open
            </a>
          </Button>
        ) : null}
        <Button
          variant='ghost'
          size='sm'
          onClick={onReject}
          disabled={busy}
          className='h-7 flex-1 rounded-full text-xs font-caption'
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={onConfirm}
          disabled={busy}
          className='h-7 flex-1 rounded-full text-xs font-caption'
        >
          {isConfirming ? 'Confirming...' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
