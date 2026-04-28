'use client';

import { ExternalLink } from 'lucide-react';
import type { RetrievedChatSource } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

interface MessageSourceChipsProps {
  readonly sources: readonly RetrievedChatSource[];
}

const VISIBLE_LIMIT = 3;
const TITLE_MAX_CHARS = 28;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Source chips render under an assistant reply bubble when canon
 * retrieval populated sources. Empty source list = no chip row at all
 * (no "no sources found" placeholder).
 *
 * Per design phase: pill, h-22px, badge token bg, no icon, no animation.
 * Click target opens `sourceUrl` in new tab if present, else
 * non-interactive with a tooltip indicating internal-only reference.
 */
export function MessageSourceChips({ sources }: MessageSourceChipsProps) {
  if (sources.length === 0) return null;

  const visible = sources.slice(0, VISIBLE_LIMIT);
  const overflow = sources.length - VISIBLE_LIMIT;

  return (
    <ul
      className='mt-2 flex flex-wrap items-center gap-1.5 pl-0.5 list-none m-0 p-0'
      data-testid='chat-source-chips'
      aria-label='Sources used for this answer'
    >
      {visible.map(source => (
        <li key={source.title}>
          <SourceChip source={source} />
        </li>
      ))}
      {overflow > 0 && (
        <li>
          <span
            className={cn(
              'inline-flex h-[22px] items-center rounded-full px-2',
              'bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.05)]',
              'text-2xs font-medium tracking-tight text-tertiary-token'
            )}
          >
            +{overflow} more
          </span>
        </li>
      )}
    </ul>
  );
}

function SourceChip({ source }: { source: RetrievedChatSource }) {
  const label = truncate(source.title, TITLE_MAX_CHARS);
  const tooltip = source.sourceUrl
    ? `${source.title} — score ${source.score.toFixed(2)}`
    : `${source.title} — internal Jovie reference (score ${source.score.toFixed(2)})`;

  const baseClasses = cn(
    'inline-flex h-[22px] items-center gap-1 rounded-full px-2',
    'bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.05)]',
    'text-2xs font-medium tracking-tight text-secondary-token',
    'transition-colors duration-150'
  );

  if (source.sourceUrl) {
    return (
      <a
        href={source.sourceUrl}
        target='_blank'
        rel='noopener noreferrer'
        title={tooltip}
        className={cn(
          baseClasses,
          'hover:bg-[rgba(0,0,0,0.09)] dark:hover:bg-[rgba(255,255,255,0.08)]'
        )}
      >
        <span className='truncate max-w-[12ch] sm:max-w-[20ch]'>{label}</span>
        <ExternalLink className='h-2.5 w-2.5 shrink-0' aria-hidden='true' />
      </a>
    );
  }

  return (
    <span
      title={tooltip}
      role='note'
      className={baseClasses}
      data-testid='chat-source-chip-internal'
    >
      <span className='truncate max-w-[12ch] sm:max-w-[20ch]'>{label}</span>
    </span>
  );
}
