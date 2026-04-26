'use client';

import Image from 'next/image';
import type { EntityRef, EntityRefMeta } from '@/lib/commands/entities';
import { cn } from '@/lib/utils';

/**
 * Right-column preview pane for the chat composer's entity picker.
 *
 * Renders a 72px artwork tile + an eyebrow + title + inline stat strip with
 * hairline dot separators (per variant F mockup — text + dots, not boxed
 * pills, except the "solid" badges like "Sold out").
 *
 * Stats degrade gracefully: any field missing from `entity.meta` is skipped.
 * Providers attach what they cheaply have; this view never throws.
 */
export interface EntityPreviewPaneProps {
  readonly entity: EntityRef;
  readonly className?: string;
}

interface StatChip {
  readonly key: string;
  readonly label: React.ReactNode;
  readonly emphasis?: 'solid';
}

function durationToClock(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function compactNumber(value: number | undefined): string | null {
  if (typeof value !== 'number' || value <= 0) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function formatLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function eyebrowFor(entity: EntityRef): string {
  const meta = entity.meta;
  if (!meta) {
    if (entity.kind === 'release') return 'Release';
    if (entity.kind === 'artist') return 'Artist';
    return 'Track';
  }
  if (meta.kind === 'release') {
    const type = meta.releaseType ? capitalize(meta.releaseType) : null;
    return type ? `Release · ${type}` : 'Release';
  }
  if (meta.kind === 'artist') {
    if (meta.isYou) return 'Artist · You';
    if (meta.verified) return 'Artist · Verified';
    return 'Artist';
  }
  if (meta.releaseTitle) return `Track · ${meta.releaseTitle}`;
  return 'Track';
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function buildReleaseStats(
  meta: Extract<EntityRefMeta, { kind: 'release' }>
): StatChip[] {
  const out: StatChip[] = [];
  if (typeof meta.totalTracks === 'number' && meta.totalTracks > 0) {
    out.push({
      key: 'tracks',
      label: (
        <span className='inline-flex items-center gap-[3px]'>
          <strong className='font-semibold tabular-nums text-primary-token'>
            {meta.totalTracks}
          </strong>
          tracks
        </span>
      ),
    });
  }
  const longDate = formatLongDate(meta.releaseDate);
  if (longDate) out.push({ key: 'date', label: longDate });
  const clock = durationToClock(meta.totalDurationMs ?? null);
  if (clock) out.push({ key: 'duration', label: clock });
  if (
    typeof meta.spotifyPopularity === 'number' &&
    meta.spotifyPopularity > 0
  ) {
    out.push({
      key: 'spotify',
      label: (
        <span className='inline-flex items-center gap-[3px]'>
          Spotify
          <strong className='font-semibold tabular-nums text-primary-token'>
            {meta.spotifyPopularity}
          </strong>
        </span>
      ),
    });
  }
  return out;
}

function buildArtistStats(
  meta: Extract<EntityRefMeta, { kind: 'artist' }>
): StatChip[] {
  const out: StatChip[] = [];
  if (meta.handle) out.push({ key: 'handle', label: `@${meta.handle}` });
  if (meta.profileUrl) out.push({ key: 'url', label: meta.profileUrl });
  const followers = compactNumber(meta.followers);
  if (followers) {
    out.push({
      key: 'followers',
      label: (
        <span className='inline-flex items-center gap-[3px]'>
          <strong className='font-semibold tabular-nums text-primary-token'>
            {followers}
          </strong>
          followers
        </span>
      ),
    });
  }
  if (
    typeof meta.popularity === 'number' &&
    meta.popularity > 0 &&
    !meta.isYou
  ) {
    out.push({
      key: 'popularity',
      label: (
        <span className='inline-flex items-center gap-[3px]'>
          Spotify
          <strong className='font-semibold tabular-nums text-primary-token'>
            {meta.popularity}
          </strong>
        </span>
      ),
    });
  }
  if (meta.verified && !meta.isYou) {
    out.push({ key: 'verified', label: 'Verified', emphasis: 'solid' });
  }
  return out;
}

function buildTrackStats(
  meta: Extract<EntityRefMeta, { kind: 'track' }>
): StatChip[] {
  const out: StatChip[] = [];
  const clock = durationToClock(meta.durationMs ?? null);
  if (clock) out.push({ key: 'duration', label: clock });
  if (meta.releaseTitle) out.push({ key: 'release', label: meta.releaseTitle });
  return out;
}

function statsFor(entity: EntityRef): StatChip[] {
  const meta = entity.meta;
  if (!meta) return [];
  if (meta.kind === 'release') return buildReleaseStats(meta);
  if (meta.kind === 'artist') return buildArtistStats(meta);
  return buildTrackStats(meta);
}

function PreviewArtwork({ entity }: { readonly entity: EntityRef }) {
  if (entity.thumbnail) {
    return (
      <div className='relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08),0_12px_24px_-8px_rgba(0,0,0,0.55)]'>
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='72px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  const initials = entity.label
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
  return (
    <div className='flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#2a2a2f] to-[#16161a] text-[22px] font-semibold tracking-[-0.02em] text-primary-token shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),inset_0_0.5px_0_rgba(255,255,255,0.08),0_12px_24px_-8px_rgba(0,0,0,0.55)]'>
      {initials || '·'}
    </div>
  );
}

export function EntityPreviewPane({
  entity,
  className,
}: EntityPreviewPaneProps) {
  const stats = statsFor(entity);
  const eyebrow = eyebrowFor(entity);
  return (
    <div
      className={cn(
        'flex flex-1 flex-col bg-gradient-to-b from-white/[0.022] to-transparent px-6 py-[22px]',
        className
      )}
      data-testid='entity-preview-pane'
    >
      <div className='flex items-start gap-4'>
        <PreviewArtwork entity={entity} />
        <div className='min-w-0 flex-1 pt-px'>
          <div className='mb-2 font-display text-[9.5px] font-semibold uppercase tracking-[0.12em] text-quaternary-token'>
            {eyebrow}
          </div>
          <h3 className='m-0 mb-3.5 font-display text-[19px] font-semibold leading-[1.15] tracking-[-0.022em] text-primary-token'>
            {entity.label}
          </h3>
          {stats.length > 0 ? (
            <div className='flex flex-wrap items-center text-[12px] leading-[1.5] tracking-[-0.002em] text-tertiary-token'>
              {stats.map((stat, i) => (
                <span
                  key={stat.key}
                  className={cn(
                    'relative inline-flex items-center whitespace-nowrap',
                    stat.emphasis === 'solid'
                      ? 'ml-2 rounded-[3px] bg-white/10 px-[7px] py-px font-display text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary-token'
                      : 'px-[10px]',
                    i === 0 && stat.emphasis !== 'solid' && 'pl-0',
                    i > 0 &&
                      stat.emphasis !== 'solid' &&
                      "before:absolute before:left-0 before:top-1/2 before:h-[2px] before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-quaternary-token before:content-['']"
                  )}
                >
                  {stat.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
