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
 *   - additional-section item (e.g. recent thread) → caller-handled via
 *     `onAdditionalSelect`
 */

import { Dialog, DialogContent } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { type EntityRef } from '@/lib/commands/entities';
import { resolveEntityHref } from '@/lib/commands/entity-routing';
import {
  type Command,
  commandsForSurface,
  type NavCommand,
  type SkillCommand,
} from '@/lib/commands/registry';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
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
   * Used by `CommandPalette` to surface "Recent threads" + "Actions"
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
  const skills = useMemo(
    () => commands.filter((c): c is SkillCommand => c.kind === 'skill'),
    [commands]
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
        const id =
          item.kind === 'nav'
            ? item.nav.id
            : item.kind === 'skill'
              ? item.skill.id
              : item.entity.id;
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
        className='overflow-hidden rounded-[18px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-0 shadow-popover sm:max-w-[560px]'
        hideClose
      >
        <DialogPrimitive.Title className='sr-only'>
          Command palette
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className='sr-only'>
          Search routes, skills, releases, artists, and recent threads.
        </DialogPrimitive.Description>
        <div
          className='flex flex-col'
          data-testid='shared-command-palette'
          data-surface='cmdk'
        >
          <div className='flex items-center gap-2.5 border-b border-(--linear-app-frame-seam) px-4 py-3'>
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
              placeholder='Jump to a page, skill, release, or thread…'
              className='flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
              aria-label='Command palette search'
            />
            <span className='hidden shrink-0 rounded-md border border-(--linear-app-frame-seam) bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tertiary-token sm:inline'>
              Esc
            </span>
          </div>
          <div
            className='max-h-[420px] overflow-y-auto p-[5px]'
            role='menu'
            aria-label='Command results'
          >
            <PaletteList
              sections={allSections}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              commitIndex={commitIndex}
              emptyHint='No matches.'
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
