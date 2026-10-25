'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import type { CompanyTile, CompanyTileTone } from '@/lib/ovie/home/company-hud';
import type { LastLookedSummary } from '@/lib/ovie/home/since-last-looked';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<CompanyTileTone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-error',
  neutral: 'bg-subtle',
};

const TONE_LABEL: Record<CompanyTileTone, string> = {
  good: 'Healthy',
  warn: 'Needs attention',
  bad: 'Problem',
  neutral: 'No status',
};

const SLOTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

const TILE_FRAME =
  'flex h-24 min-w-0 flex-col justify-between gap-1 rounded-lg bg-surface-1 px-3 py-2 text-left';

function SinceLine({ since }: Readonly<{ since: LastLookedSummary }>) {
  return (
    <p
      className='truncate text-2xs text-tertiary-token'
      data-testid='ovie-since-last-looked'
    >
      {since.lines.length === 0
        ? `Nothing changed since you last looked, ${since.ageLabel}`
        : `Since you last looked, ${since.ageLabel}: ${since.lines.join(' · ')}`}
    </p>
  );
}

/**
 * The company on one screen: six tiles in YC reading order, one line each.
 * Opening a tile shows its details and a link to the page that owns them;
 * nothing else is on the surface.
 */
export function OvieCompanyHud({
  tiles,
  since,
}: Readonly<{
  /** `null` while the sources load. */
  readonly tiles: readonly CompanyTile[] | null;
  readonly since: LastLookedSummary | null;
}>) {
  const [openId, setOpenId] = useState<CompanyTile['id'] | null>(null);
  const panelId = useId();
  const open = tiles?.find(tile => tile.id === openId) ?? null;
  return (
    <section
      aria-label='Company'
      className='flex flex-col gap-2'
      data-testid='ovie-company-hud'
      aria-busy={tiles === null}
    >
      {since ? <SinceLine since={since} /> : null}
      <div className='grid grid-cols-2 gap-2 @3xl:grid-cols-3 @6xl:grid-cols-6'>
        {tiles === null
          ? SLOTS.map(slot => (
              <div
                key={slot}
                className={TILE_FRAME}
                data-testid='ovie-tile-loading'
              >
                <LoadingSkeleton height='h-3' width='w-1/2' />
                <LoadingSkeleton height='h-6' width='w-2/3' />
                <LoadingSkeleton height='h-3' width='w-full' />
              </div>
            ))
          : tiles.map(tile => {
              const expanded = tile.id === openId;
              return (
                <button
                  key={tile.id}
                  type='button'
                  className={cn(
                    TILE_FRAME,
                    'transition-colors duration-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    expanded && 'bg-surface-2'
                  )}
                  aria-expanded={expanded}
                  aria-controls={expanded ? panelId : undefined}
                  data-testid={`ovie-tile-${tile.id}`}
                  data-tone={tile.tone}
                  data-measured={tile.measured}
                  title={tile.line}
                  onClick={() => setOpenId(expanded ? null : tile.id)}
                  onKeyDown={event => {
                    if (event.key === 'Escape') setOpenId(null);
                  }}
                >
                  <span className='flex items-center justify-between gap-2'>
                    <span className='truncate text-2xs text-tertiary-token'>
                      {tile.label}
                    </span>
                    <span
                      role='img'
                      aria-label={TONE_LABEL[tile.tone]}
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        TONE_DOT[tile.tone]
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      'truncate font-semibold tabular-nums leading-tight',
                      tile.measured
                        ? 'text-xl text-primary-token'
                        : 'text-sm text-tertiary-token'
                    )}
                  >
                    {tile.value}
                  </span>
                  <span className='truncate text-2xs text-secondary-token'>
                    {tile.line}
                  </span>
                </button>
              );
            })}
      </div>
      {open ? (
        <section
          id={panelId}
          aria-label={`${open.label} details`}
          className='flex flex-wrap items-start justify-between gap-3 rounded-lg bg-surface-1 px-3 py-2'
          data-testid='ovie-tile-details'
        >
          {open.details.length > 0 ? (
            <ul className='flex min-w-0 flex-col gap-0.5 text-2xs text-secondary-token'>
              {open.details.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className='text-2xs text-tertiary-token'>No further detail.</p>
          )}
          <Link
            href={open.href}
            className='shrink-0 text-2xs font-medium text-secondary-token hover:text-primary-token focus-visible:underline'
          >
            {`Open ${open.hrefLabel}`}
          </Link>
        </section>
      ) : null}
    </section>
  );
}
