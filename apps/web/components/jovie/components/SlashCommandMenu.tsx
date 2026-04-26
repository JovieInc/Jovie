'use client';

import {
  Calendar,
  Disc3,
  Image as ImageIcon,
  Link2Off,
  Link as LinkIcon,
  type LucideIcon,
  MessageSquare,
  Music2,
  UserCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef, EntityRefMeta } from '@/lib/commands/entities';
import { commandsForSurface, type SkillCommand } from '@/lib/commands/registry';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { type EventRecord, useEventsQuery } from '@/lib/queries/useEventsQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { cn } from '@/lib/utils';
import { type PickerState } from './useChatPicker';

export type SlashMenuMode = 'all' | EntityKind;

const SKILL_ICON_MAP: Record<string, LucideIcon> = {
  Image: ImageIcon,
  UserCircle,
  Link: LinkIcon,
  Link2Off,
  MessageSquare,
};

const KIND_ICON_MAP: Record<EntityKind, LucideIcon> = {
  release: Disc3,
  artist: UserCircle,
  track: Music2,
  event: Calendar,
};

export interface SlashMenuItem {
  readonly kind: 'skill' | 'entity';
  readonly skill?: SkillCommand;
  readonly entity?: EntityRef;
}

interface ListSection {
  readonly id: string;
  readonly label: string;
  readonly items: SlashMenuItem[];
}

interface SlashCommandMenuProps {
  /** Picker reducer state. Menu renders only when status !== 'closed'. */
  readonly state: PickerState;
  /**
   * Active creator profile id, threaded through so release search can scope
   * to this profile's catalog. Required for release rows; artist search is
   * Spotify-global and does not need it.
   */
  readonly profileId: string;
  readonly onSelectSkill: (skill: SkillCommand) => void;
  readonly onSelectEntity: (entity: EntityRef) => void;
  readonly onSetSelected: (index: number) => void;
  readonly onMoveSelected: (delta: number, total: number) => void;
  readonly onClose: () => void;
  /**
   * Compact mode renders a single column with no fixed-height inner list —
   * the parent surface (rail) caps the size instead.
   */
  readonly variant?: 'inline' | 'rail';
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function entityKindLabel(kind: EntityKind): string {
  if (kind === 'release') return 'Release';
  if (kind === 'artist') return 'Artist';
  if (kind === 'event') return 'Event';
  return 'Track';
}

function eventTypeLabel(
  type?: 'tour' | 'meetup' | 'guest' | 'charity' | 'other'
): string | null {
  if (!type) return null;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatRowMeta(entity: EntityRef): string | null {
  const meta = entity.meta;
  if (!meta) return entityKindLabel(entity.kind);
  if (meta.kind === 'release') return meta.subtitle ?? 'Release';
  if (meta.kind === 'artist') {
    if (meta.handle) return `@${meta.handle}${meta.isYou ? ' · You' : ''}`;
    return meta.subtitle ?? 'Artist';
  }
  if (meta.kind === 'event') {
    const typeLabel = eventTypeLabel(meta.eventType);
    if (meta.city && typeLabel) return `${meta.city} · ${typeLabel}`;
    if (meta.city) return meta.city;
    if (typeLabel) return typeLabel;
    return meta.subtitle ?? 'Event';
  }
  return meta.subtitle ?? 'Track';
}

function ReleaseArt({ entity }: { readonly entity: EntityRef }) {
  if (entity.thumbnail) {
    return (
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-md shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='36px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className='h-9 w-9 shrink-0 rounded-md bg-gradient-to-br from-[#2a2a2f] to-[#16161a] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]' />
  );
}

function ArtistArt({ entity }: { readonly entity: EntityRef }) {
  if (entity.thumbnail) {
    return (
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='36px'
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
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3a3a40] to-[#1a1a1d] text-[12px] font-semibold tracking-[-0.01em] text-primary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
      {initials || '·'}
    </div>
  );
}

function EventArt({ entity }: { readonly entity: EntityRef }) {
  const meta = entity.meta?.kind === 'event' ? entity.meta : null;
  const iso = meta?.eventDate;
  let day: string | null = null;
  let month: string | null = null;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      day = d.getDate().toString();
      month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    }
  }
  if (!day || !month) {
    return (
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
        <Calendar className='h-[14px] w-[14px]' strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div
      className='flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'
      style={{ background: 'linear-gradient(180deg,#1a1a1f,#0a0a0c)' }}
    >
      <span className='font-display text-[7px] font-semibold uppercase leading-none tracking-[0.1em] text-tertiary-token'>
        {month}
      </span>
      <span className='mt-[1px] font-display text-[13px] font-bold leading-none tracking-[-0.02em] text-primary-token'>
        {day}
      </span>
    </div>
  );
}

function SkillArt({ skill }: { readonly skill: SkillCommand }) {
  const Icon = SKILL_ICON_MAP[skill.iconName] ?? Calendar;
  return (
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06),inset_0_0_0_0.5px_rgba(255,255,255,0.04)]'>
      <Icon className='h-[14px] w-[14px]' strokeWidth={1.5} />
    </div>
  );
}

interface RowVisualProps {
  readonly item: SlashMenuItem;
}

function RowVisual({ item }: RowVisualProps) {
  if (item.kind === 'skill' && item.skill)
    return <SkillArt skill={item.skill} />;
  if (item.entity) {
    if (item.entity.kind === 'release')
      return <ReleaseArt entity={item.entity} />;
    if (item.entity.kind === 'artist')
      return <ArtistArt entity={item.entity} />;
    if (item.entity.kind === 'event') return <EventArt entity={item.entity} />;
    return (
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
        <Music2 className='h-[14px] w-[14px]' strokeWidth={1.5} />
      </div>
    );
  }
  return null;
}

interface RowBodyProps {
  readonly item: SlashMenuItem;
}

function RowBody({ item }: RowBodyProps) {
  if (item.kind === 'skill' && item.skill) {
    return (
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-primary-token'>
          {item.skill.label}
        </p>
        <p className='mt-[3px] truncate text-[11.5px] text-tertiary-token'>
          {item.skill.description}
        </p>
      </div>
    );
  }
  if (item.entity) {
    const meta = formatRowMeta(item.entity);
    return (
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-primary-token'>
          {item.entity.label}
        </p>
        {meta ? (
          <p className='mt-[3px] truncate text-[11.5px] text-tertiary-token'>
            {meta}
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

interface RowProps {
  readonly item: SlashMenuItem;
  readonly index: number;
  readonly isActive: boolean;
  readonly onMouseEnter: (index: number) => void;
  readonly onCommit: (index: number) => void;
}

function PickerRow({
  item,
  index,
  isActive,
  onMouseEnter,
  onCommit,
}: RowProps) {
  return (
    <button
      type='button'
      role='menuitem'
      aria-current={isActive ? 'true' : undefined}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseDown={e => {
        e.preventDefault();
        onCommit(index);
      }}
      className={cn(
        'flex w-full items-center gap-[10px] rounded-lg px-[9px] py-[7px] text-left transition-colors duration-fast',
        isActive
          ? 'bg-white/[0.06] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'
          : 'hover:bg-white/[0.035]'
      )}
    >
      <RowVisual item={item} />
      <RowBody item={item} />
    </button>
  );
}

export function pickerEntityKind(state: PickerState): EntityKind | null {
  if (state.status === 'entity') return state.kind;
  return null;
}

interface UseSlashItemsResult {
  readonly items: SlashMenuItem[];
  readonly sections: ListSection[];
  readonly isLoading: boolean;
}

interface ReleaseLikeRow {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string;
  readonly artistNames?: string[];
  readonly releaseDate?: string;
  readonly releaseType?: string;
  readonly spotifyPopularity?: number | null;
  readonly totalTracks?: number;
  readonly totalDurationMs?: number | null;
}

function shortMonth(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function releaseTypeLabel(type?: string): string {
  if (!type) return 'Release';
  const lower = type.toLowerCase();
  if (lower === 'album') return 'Album';
  if (lower === 'single') return 'Single';
  if (lower === 'ep') return 'EP';
  return type;
}

function releaseRowToEntity(release: ReleaseLikeRow): EntityRef {
  const dateLabel = shortMonth(release.releaseDate);
  const typeLabel = releaseTypeLabel(release.releaseType);
  const subtitle = dateLabel ? `${typeLabel} · ${dateLabel}` : typeLabel;
  return {
    kind: 'release',
    id: release.id,
    label: release.title,
    thumbnail: release.artworkUrl,
    meta: {
      kind: 'release',
      subtitle,
      releaseDate: release.releaseDate,
      releaseType: release.releaseType,
      spotifyPopularity: release.spotifyPopularity ?? null,
      totalTracks: release.totalTracks,
      totalDurationMs: release.totalDurationMs ?? null,
    },
  };
}

function releaseMatches(release: ReleaseLikeRow, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  if (release.title.toLowerCase().includes(lowerQuery)) return true;
  return (release.artistNames ?? []).some(n =>
    n.toLowerCase().includes(lowerQuery)
  );
}

function eventRowMatches(event: EventRecord, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  if (event.title.toLowerCase().includes(lowerQuery)) return true;
  if (event.city && event.city.toLowerCase().includes(lowerQuery)) return true;
  return false;
}

function eventRowToEntity(event: EventRecord): EntityRef {
  return {
    kind: 'event',
    id: event.id,
    label: event.title,
    thumbnail: undefined,
    meta: {
      kind: 'event',
      subtitle: event.subtitle,
      eventDate: event.eventDate,
      venue: event.venue,
      city: event.city,
      provider: event.provider,
      status: event.status,
      capacity: event.capacity,
      eventType: event.eventType,
    },
  };
}

/**
 * Build the flat list of menu items + grouped sections for the picker.
 *
 * Calls `useReleasesQuery` and `useArtistSearchQuery` unconditionally so the
 * hook count is stable from the first render (the prior provider-registry
 * indirection produced a rules-of-hooks crash because the registry wasn't
 * populated until after a useEffect ran).
 */
export function useSlashItems(
  state: PickerState,
  profileId: string
): UseSlashItemsResult {
  const isRoot = state.status === 'root';
  const isEntity = state.status === 'entity';
  const query = state.status === 'closed' ? '' : state.query;

  // Releases come from a creator-scoped local catalog; substring filter.
  const { data: releaseData, isLoading: releaseLoading } =
    useReleasesQuery(profileId);

  // Events also come from a creator-scoped local catalog (today: tour dates);
  // substring filter same as releases.
  const { data: eventData, isLoading: eventLoading } =
    useEventsQuery(profileId);

  // Artist search is Spotify-global, debounced via TanStack Pacer.
  const artistSearch = useArtistSearchQuery({ limit: 8, minQueryLength: 1 });
  const artistSearchSearch = artistSearch.search;
  const artistQueryNeeded = isRoot || (isEntity && state.kind === 'artist');
  const artistQueryString = artistQueryNeeded ? query : '';
  useEffect(() => {
    artistSearchSearch(artistQueryString);
  }, [artistQueryString, artistSearchSearch]);

  return useMemo<UseSlashItemsResult>(() => {
    if (state.status === 'closed') {
      return { items: [], sections: [], isLoading: false };
    }

    const lowerQuery = query.toLowerCase();
    const filteredReleases: EntityRef[] = (releaseData ?? [])
      .filter(r => releaseMatches(r as ReleaseLikeRow, lowerQuery))
      .slice(0, isEntity ? 8 : 4)
      .map(r => releaseRowToEntity(r as ReleaseLikeRow));

    const filteredEvents: EntityRef[] = (eventData ?? [])
      .filter(e => eventRowMatches(e, lowerQuery))
      .slice(0, isEntity ? 8 : 4)
      .map(eventRowToEntity);

    const artistEntities: EntityRef[] = artistSearch.results
      .slice(0, isEntity ? 8 : 4)
      .map(r => ({
        kind: 'artist' as const,
        id: r.id,
        label: r.name,
        thumbnail: r.imageUrl,
        meta: {
          kind: 'artist' as const,
          subtitle: r.isClaimed ? 'You' : 'Spotify artist',
          followers: r.followers,
          popularity: r.popularity,
          verified: r.verified,
          isYou: r.isClaimed,
        },
      }));

    if (state.status === 'entity') {
      let items: EntityRef[];
      if (state.kind === 'release') items = filteredReleases;
      else if (state.kind === 'event') items = filteredEvents;
      else if (state.kind === 'artist') items = artistEntities;
      else items = [];
      const slashItems: SlashMenuItem[] = items.map(e => ({
        kind: 'entity',
        entity: e,
      }));
      const sections: ListSection[] = [
        {
          id: state.kind,
          label: entityKindLabel(state.kind),
          items: slashItems,
        },
      ];
      let kindLoading = false;
      if (state.kind === 'release') kindLoading = releaseLoading;
      else if (state.kind === 'event') kindLoading = eventLoading;
      else if (state.kind === 'artist')
        kindLoading = artistSearch.state === 'loading';
      return {
        items: slashItems,
        sections,
        isLoading: kindLoading,
      };
    }

    // root: skills + entity suggestions per kind
    const skills = commandsForSurface('chat-slash')
      .filter((c): c is SkillCommand => c.kind === 'skill')
      .filter(s => fuzzyMatch(`${s.label} ${s.description}`, query));

    const sections: ListSection[] = [];
    const items: SlashMenuItem[] = [];
    if (skills.length > 0) {
      const skillItems: SlashMenuItem[] = skills.map(s => ({
        kind: 'skill',
        skill: s,
      }));
      sections.push({ id: 'skills', label: 'Skills', items: skillItems });
      items.push(...skillItems);
    }
    if (filteredReleases.length > 0) {
      const groupItems: SlashMenuItem[] = filteredReleases.map(e => ({
        kind: 'entity',
        entity: e,
      }));
      sections.push({ id: 'release', label: 'Releases', items: groupItems });
      items.push(...groupItems);
    }
    if (artistEntities.length > 0) {
      const groupItems: SlashMenuItem[] = artistEntities.map(e => ({
        kind: 'entity',
        entity: e,
      }));
      sections.push({ id: 'artist', label: 'Artists', items: groupItems });
      items.push(...groupItems);
    }
    if (filteredEvents.length > 0) {
      const groupItems: SlashMenuItem[] = filteredEvents.map(e => ({
        kind: 'entity',
        entity: e,
      }));
      sections.push({ id: 'event', label: 'Events', items: groupItems });
      items.push(...groupItems);
    }

    return {
      items,
      sections,
      isLoading:
        releaseLoading || eventLoading || artistSearch.state === 'loading',
    };
  }, [
    state,
    query,
    isEntity,
    releaseData,
    releaseLoading,
    eventData,
    eventLoading,
    artistSearch.results,
    artistSearch.state,
  ]);
}

interface SlashHeaderProps {
  readonly state: PickerState;
}

function SlashHeader({ state }: SlashHeaderProps) {
  if (state.status === 'closed') return null;
  if (state.status === 'entity') {
    const Icon = KIND_ICON_MAP[state.kind];
    return (
      <div className='flex items-center gap-[10px] border-b border-white/[0.055] px-[18px] pb-3 pt-4 text-[13px] tracking-[-0.005em]'>
        <span className='inline-flex items-center gap-1.5 rounded-[5px] border border-white/10 bg-white/[0.05] px-2 py-[2px] text-[11px] font-semibold uppercase tracking-[0.04em] text-primary-token shadow-[inset_0_0.5px_0_rgba(255,255,255,0.04)]'>
          <Icon className='h-3 w-3' strokeWidth={1.6} />
          {entityKindLabel(state.kind)}
        </span>
        {state.query ? (
          <span className='truncate text-tertiary-token'>{state.query}</span>
        ) : (
          <span className='truncate text-tertiary-token'>type to filter…</span>
        )}
      </div>
    );
  }
  return (
    <div className='flex items-center gap-[10px] border-b border-white/[0.055] px-[18px] pb-3 pt-4 text-[13px] tracking-[-0.005em]'>
      <span className='inline-flex h-[21px] items-center rounded-[4px] bg-white/[0.06] px-1.5 text-[12.5px] font-semibold leading-none text-primary-token shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06),inset_0_0_0_0.5px_rgba(255,255,255,0.04)]'>
        /
      </span>
      {state.query ? (
        <span className='truncate text-primary-token'>{state.query}</span>
      ) : (
        <span className='truncate text-tertiary-token'>
          type to filter skills, releases, artists, events
        </span>
      )}
    </div>
  );
}

/**
 * Inline picker rendered INSIDE the same surface as the chat input
 * (no popover, no portal — see Variant F brief). Two modes:
 *   - `inline`: 'root' state, list above the input row.
 *   - `rail`:  'entity' state, list lives in the left rail of an entity surface.
 */
export function SlashCommandMenu({
  state,
  profileId,
  onSelectSkill,
  onSelectEntity,
  onSetSelected,
  onMoveSelected,
  onClose,
  variant = 'inline',
}: SlashCommandMenuProps) {
  const { items, sections, isLoading } = useSlashItems(state, profileId);

  // Keyboard nav lives at this layer: arrow keys drive the picker,
  // Enter commits the active item, Escape closes.
  useEffect(() => {
    if (state.status === 'closed') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveSelected(1, items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveSelected(-1, items.length);
      } else if (e.key === 'Enter') {
        const item = items[state.status === 'closed' ? 0 : state.selectedIndex];
        if (!item) return;
        e.preventDefault();
        if (item.kind === 'skill' && item.skill) onSelectSkill(item.skill);
        else if (item.kind === 'entity' && item.entity)
          onSelectEntity(item.entity);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [state, items, onMoveSelected, onSelectSkill, onSelectEntity, onClose]);

  if (state.status === 'closed') return null;

  const handleCommit = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.kind === 'skill' && item.skill) onSelectSkill(item.skill);
    else if (item.kind === 'entity' && item.entity) onSelectEntity(item.entity);
  };

  const flatIndexFor = (sectionStartIdx: number, localIdx: number) =>
    sectionStartIdx + localIdx;

  return (
    <div
      className={cn('flex flex-col', variant === 'rail' && 'h-full min-h-0')}
      data-testid='slash-command-menu'
    >
      {variant === 'inline' ? <SlashHeader state={state} /> : null}
      {variant === 'rail' ? <SlashHeader state={state} /> : null}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-[5px]',
          variant === 'inline' && 'max-h-[260px]'
        )}
        role='menu'
      >
        {items.length === 0 ? (
          <div className='px-3 py-6 text-center text-xs text-tertiary-token'>
            {isLoading ? 'Searching…' : 'No matches'}
          </div>
        ) : (
          (() => {
            let cursor = 0;
            return sections.map(section => {
              const start = cursor;
              cursor += section.items.length;
              return (
                <div key={section.id}>
                  <div className='px-[10px] pb-[5px] pt-[11px] text-[9.5px] font-semibold uppercase tracking-[0.1em] text-quaternary-token'>
                    {section.label}
                  </div>
                  {section.items.map((item, localIdx) => {
                    const flatIdx = flatIndexFor(start, localIdx);
                    return (
                      <PickerRow
                        key={
                          item.kind === 'skill' && item.skill
                            ? `skill:${item.skill.id}`
                            : `entity:${item.entity?.kind}:${item.entity?.id}`
                        }
                        item={item}
                        index={flatIdx}
                        isActive={flatIdx === state.selectedIndex}
                        onMouseEnter={onSetSelected}
                        onCommit={handleCommit}
                      />
                    );
                  })}
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
}

/** Resolve the currently-active EntityRef from the picker state + items. */
export function activeEntityFor(
  state: PickerState,
  items: SlashMenuItem[]
): EntityRef | null {
  if (state.status === 'closed') return null;
  const item = items[state.selectedIndex];
  if (item?.kind === 'entity' && item.entity) return item.entity;
  return null;
}

export type { EntityRefMeta };
