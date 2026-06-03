'use client';

import Image from 'next/image';
import type { EntityRef, EntityRefMeta } from '@/lib/commands/entities';
import { cn } from '@/lib/utils';
import { formatLongDate } from './entity-mappers';

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

function eyebrowFor(entity: EntityRef): string {
  const meta = entity.meta;
  if (!meta) {
    if (entity.kind === 'release') return 'Release';
    if (entity.kind === 'artist') return 'Artist';
    if (entity.kind === 'event') return 'Event';
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
  if (meta.kind === 'event') {
    const type = eventTypeLabel(meta.eventType);
    return type ? `Event · ${type}` : 'Event';
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
        <span className='system-b-entity-preview-stat-pair'>
          <strong className='system-b-entity-preview-stat-strong'>
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
        <span className='system-b-entity-preview-stat-pair'>
          Spotify
          <strong className='system-b-entity-preview-stat-strong'>
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
        <span className='system-b-entity-preview-stat-pair'>
          <strong className='system-b-entity-preview-stat-strong'>
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
        <span className='system-b-entity-preview-stat-pair'>
          Spotify
          <strong className='system-b-entity-preview-stat-strong'>
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

function eventTypeLabel(
  type?: 'tour' | 'livestream' | 'listening_party' | 'ama' | 'signing'
): string | null {
  if (!type) return null;
  if (type === 'listening_party') return 'Listening party';
  if (type === 'ama') return 'AMA';
  return capitalize(type);
}

function formatDoorsTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Skip if the source had no time-of-day (midnight UTC is the typical
  // marker for date-only). 00:00 doors is almost never a real datapoint.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildEventStats(
  meta: Extract<EntityRefMeta, { kind: 'event' }>
): StatChip[] {
  const out: StatChip[] = [];
  if (meta.city) out.push({ key: 'city', label: meta.city });
  const doors = formatDoorsTime(meta.eventDate);
  if (doors)
    out.push({
      key: 'doors',
      label: (
        <span className='system-b-entity-preview-stat-pair'>
          Doors
          <strong className='system-b-entity-preview-stat-strong'>
            {doors}
          </strong>
        </span>
      ),
    });
  if (typeof meta.capacity === 'number' && meta.capacity > 0) {
    out.push({
      key: 'capacity',
      label: (
        <span className='system-b-entity-preview-stat-pair'>
          Capacity
          <strong className='system-b-entity-preview-stat-strong'>
            {meta.capacity.toLocaleString()}
          </strong>
        </span>
      ),
    });
  }
  if (meta.status) {
    out.push({ key: 'status', label: meta.status, emphasis: 'solid' });
  }
  const typeLabel = eventTypeLabel(meta.eventType);
  if (typeLabel) out.push({ key: 'type', label: typeLabel });
  return out;
}

function statsFor(entity: EntityRef): StatChip[] {
  const meta = entity.meta;
  if (!meta) return [];
  if (meta.kind === 'release') return buildReleaseStats(meta);
  if (meta.kind === 'artist') return buildArtistStats(meta);
  if (meta.kind === 'event') return buildEventStats(meta);
  return buildTrackStats(meta);
}

interface DateStampParts {
  readonly month: string;
  readonly day: string;
}

function dateStampParts(iso: string | undefined): DateStampParts | null {
  if (!iso) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const month = d
    .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase();
  const day = d.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
  return { month, day };
}

function EventDateArtwork({ stamp }: { readonly stamp: DateStampParts }) {
  return (
    <div
      className='system-b-entity-preview-artwork system-b-entity-preview-event-art'
      data-testid='entity-preview-event-art'
    >
      <span className='system-b-entity-preview-event-month'>{stamp.month}</span>
      <span className='system-b-entity-preview-event-day'>{stamp.day}</span>
    </div>
  );
}

function PreviewArtwork({ entity }: { readonly entity: EntityRef }) {
  if (
    entity.kind === 'event' &&
    entity.meta?.kind === 'event' &&
    !entity.thumbnail
  ) {
    const stamp = dateStampParts(entity.meta.eventDate);
    if (stamp) return <EventDateArtwork stamp={stamp} />;
  }
  if (entity.thumbnail) {
    return (
      <div className='system-b-entity-preview-artwork system-b-entity-preview-media-art'>
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
    <div className='system-b-entity-preview-artwork system-b-entity-preview-placeholder-art'>
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
    <section
      aria-label='Selected entity preview'
      className={cn('system-b-entity-preview-pane', className)}
      data-testid='entity-preview-pane'
    >
      <div className='system-b-entity-preview-layout'>
        <PreviewArtwork entity={entity} />
        <div className='system-b-entity-preview-content'>
          <div className='system-b-entity-preview-eyebrow'>{eyebrow}</div>
          <h3
            aria-live='polite'
            aria-atomic='true'
            className='system-b-entity-preview-title'
          >
            {entity.label}
          </h3>
          {stats.length > 0 ? (
            <div className='system-b-entity-preview-stats'>
              {stats.map((stat, i) => (
                <span
                  key={stat.key}
                  className={cn(
                    'system-b-entity-preview-stat',
                    stat.emphasis === 'solid'
                      ? 'system-b-entity-preview-stat-solid'
                      : 'system-b-entity-preview-stat-muted',
                    i === 0 &&
                      stat.emphasis !== 'solid' &&
                      'system-b-entity-preview-stat-first',
                    i > 0 &&
                      stat.emphasis !== 'solid' &&
                      'system-b-entity-preview-stat-separated'
                  )}
                >
                  {stat.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
