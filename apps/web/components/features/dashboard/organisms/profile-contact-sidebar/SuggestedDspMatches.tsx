'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { useDspMatchActions } from '@/features/dashboard/organisms/dsp-matches/hooks';
import { type DspMatch, useDspMatchesQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

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
    () =>
      matches
        ? [...matches].sort((a, b) => b.confidenceScore - a.confidenceScore)
        : [],
    [matches]
  );

  const { confirmMatch, rejectMatch, isMatchConfirming, isMatchRejecting } =
    useDspMatchActions({
      profileId,
      onConfirmSuccess: () => toast.success('Confirmed'),
      onRejectSuccess: () => toast.success('Rejected'),
      onError: (err, action) =>
        toast.error(`Failed to ${action}. Please try again.`),
    });

  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  if (isLoading) {
    return (
      <div className='mt-3 space-y-1.5'>
        <SectionHeading count={0} />
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className='flex items-center gap-2.5 rounded-md px-2 py-1'
          >
            <div className='h-4 w-4 rounded skeleton' />
            <div className='h-3.5 flex-1 rounded skeleton' />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='mt-3 space-y-1.5'>
        <SectionHeading count={0} />
        <p className='px-2 text-xs text-tertiary-token'>
          Couldn&apos;t load suggestions.{' '}
          <button
            type='button'
            onClick={() => refetch()}
            className='text-accent underline underline-offset-2 hover:text-accent/80'
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (!sorted.length) return null;

  return (
    <div className='mt-3 space-y-1.5'>
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
      {hiddenCount > 0 && !expanded && (
        <button
          type='button'
          onClick={() => setExpanded(true)}
          className='px-2 text-xs font-book text-accent hover:text-accent/80'
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}

function SectionHeading({ count }: { readonly count: number }) {
  return (
    <div className='flex items-center gap-2 px-2'>
      <span className='text-2xs font-book uppercase tracking-widest text-tertiary-token'>
        Suggested
      </span>
      {count > 0 && (
        <span className='inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-1 px-1 text-3xs font-caption text-tertiary-token'>
          {count}
        </span>
      )}
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
  const isLoading = isConfirming || isRejecting;
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
        'group flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-surface-1 focus-within:bg-surface-1',
        isLoading && 'opacity-60'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <span className='contents'>
            <DspProviderIcon provider={match.providerId} size='sm' />
            <span className='min-w-0 flex-1 truncate text-app font-book text-primary-token'>
              {match.externalArtistName || label}
            </span>
            <div className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-100'>
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  onConfirm();
                }}
                disabled={isLoading}
                className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-success focus-visible:bg-surface-2 focus-visible:text-success focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus'
                aria-label={`Confirm ${label} match for ${match.externalArtistName || 'Unknown'}`}
              >
                {isConfirming ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Check className='h-3.5 w-3.5' />
                )}
              </button>
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  onReject();
                }}
                disabled={isLoading}
                className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-error focus-visible:bg-surface-2 focus-visible:text-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus'
                aria-label={`Reject ${label} match for ${match.externalArtistName || 'Unknown'}`}
              >
                {isRejecting ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <X className='h-3.5 w-3.5' />
                )}
              </button>
            </div>
          </span>
        </PopoverTrigger>
        <PopoverContent
          side='left'
          sideOffset={8}
          className='hidden w-[240px] rounded-[10px] border-subtle bg-surface-0 p-3 lg:block'
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
  const isLoading = isConfirming || isRejecting;

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
        <ConfidenceBadge score={match.confidenceScore} size='sm' />
        {match.matchingIsrcCount > 0 && (
          <span className='text-xs text-tertiary-token'>
            {match.matchingIsrcCount} tracks verified
          </span>
        )}
      </div>

      <div className='flex items-center gap-1.5'>
        {match.externalArtistUrl && (
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
              <ExternalLink className='mr-1 h-3 w-3' />
              Open
            </a>
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          onClick={onReject}
          disabled={isLoading}
          className='h-7 flex-1 rounded-full text-xs font-caption'
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={onConfirm}
          disabled={isLoading}
          className='h-7 flex-1 rounded-full text-xs font-caption'
        >
          {isConfirming ? 'Confirming...' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
