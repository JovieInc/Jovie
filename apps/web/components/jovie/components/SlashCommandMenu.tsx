'use client';

/**
 * SlashCommandMenu — chat slash picker (thin adapter over SharedCommandPalette).
 *
 * The composer (ChatInput) owns picker reducer state and the textarea
 * caret; this module hands that state to the shared `InlinePalette` shell
 * along with the per-state header. All visual rows + filtering helpers
 * live in `picker-rows.tsx` so cmd+k and chat-slash render identically.
 *
 * Public surface kept stable for upstream consumers:
 *   - `SlashCommandMenu` component
 *   - `useSlashItems` hook (also used by ChatInput to compute `activeEntity`)
 *   - `activeEntityFor`, `pickerEntityKind` selectors
 *   - `EntityRefMeta` re-export
 *   - `SlashMenuMode` type
 *   - `SlashMenuItem` shape (for tests + sibling consumers)
 */

import {
  Calendar,
  Disc3,
  type LucideIcon,
  Music2,
  UserCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import {
  flattenSections,
  InlinePalette,
} from '@/components/organisms/SharedCommandPalette';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import { commandsForSurface, type SkillCommand } from '@/lib/commands/registry';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { useEventsQuery } from '@/lib/queries/useEventsQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import {
  artistResultToEntityRef,
  type ReleaseLikeRow,
  releaseRowMatches,
  releaseRowToEntityRef,
} from './entity-mappers';
import { eventRowMatches, eventToEntityRef } from './event-provider';
import type { PickerItem } from './picker-rows';
import { type PickerState } from './useChatPicker';

// Re-export EntityRefMeta from a single canonical home for picker consumers.
export type { EntityRefMeta } from '@/lib/commands/entities';

export type SlashMenuMode = 'all' | EntityKind;

const KIND_ICON_MAP: Record<EntityKind, LucideIcon> = {
  release: Disc3,
  artist: UserCircle,
  track: Music2,
  event: Calendar,
};

/**
 * Legacy item shape. Internally we now use `PickerItem` (from picker-rows),
 * but ChatInput and tests still import `SlashMenuItem`, so we keep it as a
 * structurally compatible alias.
 */
export interface SlashMenuItem {
  readonly kind: 'skill' | 'entity';
  readonly skill?: SkillCommand;
  readonly entity?: EntityRef;
}

export interface SlashPromptAction {
  readonly label: string;
  readonly prompt: string;
}

interface ListSection {
  readonly id: string;
  readonly label: string;
  readonly items: SlashMenuItem[];
}

interface SlashCommandMenuProps {
  readonly state: PickerState;
  readonly profileId: string;
  readonly onSelectSkill: (skill: SkillCommand) => void;
  readonly onSelectEntity: (entity: EntityRef) => void;
  readonly onSetSelected: (index: number) => void;
  readonly onMoveSelected: (delta: number, total: number) => void;
  readonly onClose: () => void;
  readonly variant?: 'inline' | 'rail';
  /**
   * Optional listbox id provided by the parent textarea so it can wire
   * `aria-controls`. The picker forwards it onto the inner palette so the
   * id stays stable across re-renders.
   */
  readonly listIdProp?: string;
  /**
   * Optional callback fired when the active row id changes so the parent
   * textarea can mirror it onto `aria-activedescendant`.
   */
  readonly onActiveRowChange?: (id: string | null) => void;
  readonly promptActions?: readonly SlashPromptAction[];
  readonly onSelectPrompt?: (prompt: string) => void;
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

export function pickerEntityKind(state: PickerState): EntityKind | null {
  if (state.status === 'entity') return state.kind;
  return null;
}

interface UseSlashItemsResult {
  readonly items: SlashMenuItem[];
  readonly sections: ListSection[];
  readonly isLoading: boolean;
}

/**
 * Build the flat list of menu items + grouped sections for the picker.
 *
 * Calls `useReleasesQuery` and `useArtistSearchQuery` unconditionally so the
 * hook count is stable from the first render.
 */
export function useSlashItems(
  state: PickerState,
  profileId: string
): UseSlashItemsResult {
  const isRoot = state.status === 'root';
  const isEntity = state.status === 'entity';
  const query = state.status === 'closed' ? '' : state.query;

  const { data: releaseData, isLoading: releaseLoading } =
    useReleasesQuery(profileId);

  const { data: eventData, isLoading: eventLoading } =
    useEventsQuery(profileId);

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
      .filter(r => releaseRowMatches(r as ReleaseLikeRow, lowerQuery))
      .slice(0, isEntity ? 8 : 4)
      .map(r => releaseRowToEntityRef(r as ReleaseLikeRow));

    const filteredEvents: EntityRef[] = (eventData ?? [])
      .filter(e => eventRowMatches(e, lowerQuery))
      .slice(0, isEntity ? 8 : 4)
      .map(eventToEntityRef);

    const artistEntities: EntityRef[] = artistSearch.results
      .slice(0, isEntity ? 8 : 4)
      .map(artistResultToEntityRef);

    if (state.status === 'entity') {
      let items: EntityRef[];
      let loading: boolean;
      if (state.kind === 'release') {
        items = filteredReleases;
        loading = releaseLoading;
      } else if (state.kind === 'event') {
        items = filteredEvents;
        loading = eventLoading;
      } else if (state.kind === 'artist') {
        items = artistEntities;
        loading = artistSearch.state === 'loading';
      } else {
        // 'track' has no provider yet — return a real empty state.
        items = [];
        loading = false;
      }
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
      return { items: slashItems, sections, isLoading: loading };
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

function toPickerItem(item: SlashMenuItem): PickerItem | null {
  if (item.kind === 'skill' && item.skill) {
    return { kind: 'skill', skill: item.skill };
  }
  if (item.kind === 'entity' && item.entity) {
    return { kind: 'entity', entity: item.entity };
  }
  return null;
}

function promptActionId(action: SlashPromptAction): string {
  return action.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function promptActionDescription(action: SlashPromptAction): string {
  const trimmed = action.prompt.trim();
  if (!trimmed) return 'Send this prompt to Jovie.';
  return trimmed.length > 88 ? `${trimmed.slice(0, 85)}...` : trimmed;
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
          type to filter skills, releases, artists
        </span>
      )}
    </div>
  );
}

/**
 * Inline picker rendered INSIDE the same surface as the chat input. Two
 * modes: `inline` (root state, list above the input row) and `rail` (entity
 * state, list lives in the left rail of the entity surface).
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
  listIdProp,
  onActiveRowChange,
  promptActions,
  onSelectPrompt,
}: SlashCommandMenuProps) {
  const { sections, isLoading } = useSlashItems(state, profileId);
  const query = state.status === 'closed' ? '' : state.query;
  const promptItems = useMemo<PickerItem[]>(() => {
    if (state.status !== 'root' || !promptActions?.length) return [];
    return promptActions
      .filter(action => fuzzyMatch(`${action.label} ${action.prompt}`, query))
      .map(action => ({
        kind: 'prompt' as const,
        prompt: {
          id: promptActionId(action),
          label: action.label,
          description: promptActionDescription(action),
          prompt: action.prompt,
        },
      }));
  }, [promptActions, query, state.status]);

  // Map legacy SlashMenuItem sections → PickerItem sections for the shared
  // shell. The shape is structurally equivalent; the indirection just gates
  // the optionality.
  const paletteSections = useMemo(() => {
    const mappedSections = sections
      .map(section => ({
        id: section.id,
        label: section.label,
        items: section.items
          .map(toPickerItem)
          .filter((x): x is PickerItem => x !== null),
      }))
      .filter(section => section.items.length > 0);
    if (promptItems.length > 0) {
      mappedSections.unshift({
        id: 'suggestions',
        label: 'Suggestions',
        items: promptItems,
      });
    }
    return mappedSections;
  }, [promptItems, sections]);
  const flatItems = useMemo(
    () => flattenSections(paletteSections),
    [paletteSections]
  );

  const handleCommit = useCallback(
    (pickerItem: PickerItem) => {
      if (pickerItem.kind === 'skill') {
        onSelectSkill(pickerItem.skill);
      } else if (pickerItem.kind === 'entity') {
        onSelectEntity(pickerItem.entity);
      } else if (pickerItem.kind === 'prompt') {
        onSelectPrompt?.(pickerItem.prompt.prompt);
      }
    },
    [onSelectEntity, onSelectPrompt, onSelectSkill]
  );

  // Keyboard nav lives at this layer so commit dispatches happen via the
  // same callbacks (skill vs entity) the composer wires up.
  useEffect(() => {
    if (state.status === 'closed') return;
    function onKey(e: KeyboardEvent) {
      // IME composition (Japanese, Chinese, Korean): the user is mid-glyph
      // and Enter is "commit composition," not "submit." Bail before any
      // navigation key handling so we never swallow the composition.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveSelected(1, flatItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveSelected(-1, flatItems.length);
      } else if (e.key === 'Enter') {
        const selectedIdx =
          flatItems.length === 0
            ? -1
            : Math.max(
                0,
                Math.min(
                  flatItems.length - 1,
                  state.status === 'closed' ? 0 : state.selectedIndex
                )
              );
        const item = flatItems[selectedIdx];
        if (!item) return;
        e.preventDefault();
        handleCommit(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [state, flatItems, handleCommit, onMoveSelected, onClose]);

  if (state.status === 'closed') return null;

  const selectedIndex = state.selectedIndex;

  return (
    <div data-testid='slash-command-menu'>
      <InlinePalette
        sections={paletteSections}
        selectedIndex={selectedIndex}
        setSelectedIndex={onSetSelected}
        onCommit={handleCommit}
        variant={variant}
        header={<SlashHeader state={state} />}
        emptyHint={isLoading ? 'Searching…' : 'No matches'}
        listIdProp={listIdProp}
        onActiveRowChange={onActiveRowChange}
      />
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
