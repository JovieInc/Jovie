'use client';

/**
 * CmdKPalette — modal cmd+k surface backed by SharedCommandPalette primitives.
 *
 * Owns its own input + selection state, fetches the same release/artist
 * sources the chat slash picker uses, and routes commits:
 *   - nav → router.push(href)
 *   - skill → router.push(/app/chat?skill=<id>) — chat picks up the chip
 *   - entity (release) → its detail surface (currently `/.../tasks`)
 *   - entity (artist/track) → no-op (no detail page yet)
 *   - additional-section item (e.g. recent chat) → caller-handled via
 *     `onAdditionalSelect`
 */

import { Dialog, DialogContent } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { filterSkillsHidingBrokenAlbumArt } from '@/lib/chat/album-art-capability';
import { type EntityRef } from '@/lib/commands/entities';
import { resolveEntityHref } from '@/lib/commands/entity-routing';
import {
  type Command,
  commandsForSurface,
  type NavCommand,
  type SkillCommand,
} from '@/lib/commands/registry';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { useChatCapabilitiesQuery } from '@/lib/queries/useChatCapabilitiesQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { cn } from '@/lib/utils';
import {
  artistResultToEntityRef,
  type ReleaseLikeRow,
  releaseRowMatches,
  releaseRowToEntityRef,
} from '../jovie/components/entity-mappers';
import { pickerItemKey } from '../jovie/components/picker-rows';
import {
  buildRegistrySections,
  filterAdditionalSections,
  flattenSections,
  PaletteList,
  type PaletteSection,
} from './SharedCommandPalette';

interface CmdKPaletteProps {
  readonly profileId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Optional extra sections appended after the registry-driven sections.
   * Used by `CommandPalette` to surface "Recent chats" + "Actions"
   * without baking them into the registry.
   */
  readonly additionalSectionsAfter?: PaletteSection[];
  /** Caller-handled commit for `additionalSectionsAfter` items. */
  readonly onAdditionalSelect?: (id: string) => void;
}

function useCmdkData(profileId: string, query: string, open: boolean) {
  const commands = useMemo<readonly Command[]>(
    () => commandsForSurface('cmdk'),
    []
  );
  const { data: chatCapabilities } = useChatCapabilitiesQuery({
    profileId,
    enabled: open,
  });
  const skills = useMemo(
    () =>
      filterSkillsHidingBrokenAlbumArt(
        commands.filter((c): c is SkillCommand => c.kind === 'skill'),
        chatCapabilities?.tools.albumArt
      ),
    [chatCapabilities?.tools.albumArt, commands]
  );
  const navs = useMemo(
    () => commands.filter((c): c is NavCommand => c.kind === 'nav'),
    [commands]
  );

  const { data: releaseData } = useReleasesQuery(profileId, { enabled: open });
  const releaseEntities = useMemo<EntityRef[]>(
    () =>
      (releaseData ?? [])
        .filter(r =>
          releaseRowMatches(r as ReleaseLikeRow, query.toLowerCase())
        )
        .slice(0, 8)
        .map(r => releaseRowToEntityRef(r as ReleaseLikeRow)),
    [releaseData, query]
  );

  const artistSearch = useArtistSearchQuery({ limit: 8, minQueryLength: 1 });
  const artistSearchSearch = artistSearch.search;
  const artistSearchClear = artistSearch.clear;
  useEffect(() => {
    if (!open) return;
    artistSearchSearch(query);
  }, [query, artistSearchSearch, open]);
  useEffect(() => {
    if (!open) artistSearchClear();
  }, [open, artistSearchClear]);
  const artistEntities = useMemo<EntityRef[]>(
    () => artistSearch.results.map(artistResultToEntityRef),
    [artistSearch.results]
  );

  return useMemo(
    () =>
      buildRegistrySections(
        query,
        skills,
        navs,
        releaseEntities,
        artistEntities
      ),
    [query, skills, navs, releaseEntities, artistEntities]
  );
}

export function CmdKPalette({
  profileId,
  open,
  onOpenChange,
  additionalSectionsAfter,
  onAdditionalSelect,
}: CmdKPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset when closing so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const registrySections = useCmdkData(profileId, query, open);
  const filteredAdditional = useMemo(
    () => filterAdditionalSections(query, additionalSectionsAfter),
    [query, additionalSectionsAfter]
  );
  const allSections = useMemo<PaletteSection[]>(
    () => [...registrySections, ...filteredAdditional],
    [registrySections, filteredAdditional]
  );

  const flatItems = useMemo(() => flattenSections(allSections), [allSections]);
  const additionalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of filteredAdditional) {
      for (const item of s.items) ids.add(pickerItemKey(item));
    }
    return ids;
  }, [filteredAdditional]);

  // Clamp selected index whenever the visible list changes.
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(flatItems.length === 0 ? 0 : flatItems.length - 1);
    }
  }, [flatItems.length, selectedIndex]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const commitIndex = useCallback(
    (idx: number) => {
      const item = flatItems[idx];
      if (!item) return;

      const key = pickerItemKey(item);
      if (additionalIds.has(key)) {
        let id: string;
        if (item.kind === 'nav') id = item.nav.id;
        else if (item.kind === 'skill') id = item.skill.id;
        else if (item.kind === 'prompt') id = item.prompt.id;
        else id = item.entity.id;
        onAdditionalSelect?.(id);
        handleClose();
        return;
      }

      if (item.kind === 'nav') {
        router.push(item.nav.href);
        handleClose();
        return;
      }
      if (item.kind === 'skill') {
        const url = `${APP_ROUTES.CHAT}?skill=${encodeURIComponent(item.skill.id)}`;
        router.push(url);
        handleClose();
        return;
      }
      if (item.kind === 'prompt') {
        handleClose();
        return;
      }
      const href = resolveEntityHref(item.entity);
      if (href) {
        router.push(href);
        handleClose();
      }
    },
    [flatItems, additionalIds, onAdditionalSelect, handleClose, router]
  );

  // Keyboard nav: arrow up/down/enter/escape with IME guard.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === '1' || e.key === '2' || e.key === '3')
      ) {
        const nextIndex = Number(e.key) - 1;
        if (nextIndex < flatItems.length) {
          e.preventDefault();
          setSelectedIndex(nextIndex);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          flatItems.length === 0 ? 0 : Math.min(prev + 1, flatItems.length - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitIndex(selectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    }
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [open, flatItems.length, commitIndex, selectedIndex, handleClose]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // JOV-2982: full-viewport search takeover (not a centered card).
        // Overrides DialogContent centered defaults via tailwind-merge.
        className={cn(
          'left-0 top-0 h-dvh w-screen max-w-none [translate:0_0]',
          'grid gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none',
          'bg-(--linear-app-content-surface)',
          'sm:max-w-none',
          // Full-page: fade only (no zoom — zoom reads as a modal card)
          'data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100'
        )}
        hideClose
        overlayProps={{
          className: 'bg-(--linear-app-content-surface)',
        }}
        testId='cmdk-full-page'
      >
        <DialogPrimitive.Title className='sr-only'>
          Command palette
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className='sr-only'>
          Search routes, skills, releases, artists, and recent conversations.
        </DialogPrimitive.Description>
        <div
          className='mx-auto flex h-full w-full max-w-3xl flex-col'
          data-testid='shared-command-palette'
          data-surface='cmdk'
        >
          <div className='flex shrink-0 items-center gap-2 border-b border-(--linear-app-frame-seam) px-3.5 py-2.5'>
            <Search
              className='size-4 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
            <input
              autoFocus
              type='text'
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder='Jump to a page, skill, release, or conversation...'
              className='flex-1 appearance-none bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token focus:outline-none focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_45%,transparent)]'
              aria-label='Command Palette Search'
            />
            <span className='hidden shrink-0 px-1 text-2xs font-medium text-quaternary-token sm:inline'>
              Esc
            </span>
          </div>
          <div
            className='min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1.5'
            role='listbox'
            aria-label='Command Palette Results'
          >
            <PaletteList
              sections={allSections}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              commitIndex={commitIndex}
              emptyHint='No matches.'
              variant='cmdk'
              showIndexedShortcuts
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
