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

import { Button, Dialog, DialogContent } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { filterSkillsHidingBrokenAlbumArt } from '@/lib/chat/album-art-capability';
import { type EntityRef } from '@/lib/commands/entities';
import { resolveEntityHref } from '@/lib/commands/entity-routing';
import { rankPaletteReleases } from '@/lib/commands/palette-ranking';
import {
  type Command,
  commandsForSurface,
  isCommandVisible,
  type NavCommand,
  type SkillCommand,
} from '@/lib/commands/registry';
import { useAppFlag } from '@/lib/flags/client';
import { useArtistSearchQuery } from '@/lib/queries/useArtistSearchQuery';
import { useChatCapabilitiesQuery } from '@/lib/queries/useChatCapabilitiesQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { isFormElement } from '@/lib/utils/keyboard';
import {
  artistResultToEntityRef,
  type ReleaseLikeRow,
  releaseRowMatches,
  releaseRowToEntityRef,
} from '../jovie/components/entity-mappers';
import { pickerItemKey } from '../jovie/components/picker-rows';
import { CmdKMainPlaneSearchInput } from './CmdKMainPlaneSearchInput';
import {
  applyPaletteDefaultLimits,
  buildRegistrySections,
  filterAdditionalSections,
  flattenSections,
  hasHiddenPaletteDefaults,
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
  /** `main` renders inside the existing shell plane; `dialog` preserves legacy embedding. */
  readonly presentation?: 'dialog' | 'main';
  /** Supplies the live query field to the breadcrumb/header seam in main mode. */
  readonly onHeaderChange?: (header: ReactNode | null) => void;
}

function useCmdkData(profileId: string, query: string, open: boolean) {
  const youtubeWorkspaceNav = useAppFlag('YOUTUBE_WORKSPACE_NAV');
  const jovieWorkNav = useAppFlag('JOVIE_WORK_NAV');
  const profilesWorkspaceEnabled = useAppFlag('PROFILES_WORKSPACE');
  const commands = useMemo<readonly Command[]>(
    () =>
      commandsForSurface('cmdk', { youtubeWorkspaceNav, jovieWorkNav }).filter(
        command =>
          isCommandVisible(command, {
            PROFILES_WORKSPACE: profilesWorkspaceEnabled,
          })
      ),
    [youtubeWorkspaceNav, jovieWorkNav, profilesWorkspaceEnabled]
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

  const releases = useReleasesQuery(profileId, { enabled: open });
  const releaseData = releases.data;
  const releaseEntities = useMemo<EntityRef[]>(
    () =>
      rankPaletteReleases(
        (releaseData ?? []).filter(r =>
          releaseRowMatches(r as ReleaseLikeRow, query.trim().toLowerCase())
        )
      ).map(r =>
        releaseRowToEntityRef(r as ReleaseLikeRow, {
          includeWorkflowStatus: true,
        })
      ),
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

  const sections = useMemo(
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

  const hasArtistQuery = query.trim().length > 0;
  const isSearching =
    releases.isLoading ||
    releases.isFetching ||
    (hasArtistQuery &&
      (artistSearch.query.trim() !== query.trim() ||
        artistSearch.isPending ||
        artistSearch.state === 'loading'));
  const hasSearchError =
    releases.isError || (hasArtistQuery && artistSearch.state === 'error');
  const retrySearch = () => {
    if (releases.isError) void releases.refetch();
    if (hasArtistQuery && artistSearch.state === 'error') {
      artistSearch.searchImmediate(query);
    }
  };

  return { sections, isSearching, hasSearchError, retrySearch };
}

export function CmdKPalette({
  profileId,
  open,
  onOpenChange,
  additionalSectionsAfter,
  onAdditionalSelect,
  presentation = 'dialog',
  onHeaderChange,
}: CmdKPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedListId = useId();
  const paletteDescriptionId = `${generatedListId}-description`;

  // Reset when closing so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (presentation === 'dialog' && open) inputRef.current?.focus();
  }, [open, presentation]);

  const {
    sections: registrySections,
    isSearching,
    hasSearchError,
    retrySearch,
  } = useCmdkData(profileId, query, open);
  const pendingMessage =
    query.trim().length > 0 ? 'Searching…' : 'Loading results…';
  const filteredAdditional = useMemo(
    () => filterAdditionalSections(query, additionalSectionsAfter),
    [query, additionalSectionsAfter]
  );
  const unboundedSections = useMemo<PaletteSection[]>(
    () => [...registrySections, ...filteredAdditional],
    [registrySections, filteredAdditional]
  );
  const allSections = useMemo<PaletteSection[]>(
    () => applyPaletteDefaultLimits(query, unboundedSections),
    [query, unboundedSections]
  );
  const hasHiddenDefaults = useMemo(
    () => hasHiddenPaletteDefaults(query, unboundedSections),
    [query, unboundedSections]
  );

  const flatItems = useMemo(() => flattenSections(allSections), [allSections]);
  const activeIndex = useMemo<number | null>(() => {
    if (flatItems.length === 0) return null;
    return Math.max(0, Math.min(selectedIndex, flatItems.length - 1));
  }, [flatItems.length, selectedIndex]);
  const activeRowId = useMemo(
    () =>
      activeIndex === null ? null : `${generatedListId}-row-${activeIndex}`,
    [activeIndex, generatedListId]
  );
  const additionalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of filteredAdditional) {
      for (const item of s.items) ids.add(pickerItemKey(item));
    }
    return ids;
  }, [filteredAdditional]);

  // Warm only the route the user is currently about to choose. This keeps the
  // palette responsive without eagerly loading every destination, and makes
  // keyboard search (for example, `Presence` + Enter) benefit from the same
  // warm route cache as pointer navigation.
  const activeHref = useMemo(() => {
    if (activeIndex === null) return null;
    const item = flatItems[activeIndex];
    if (!item || additionalIds.has(pickerItemKey(item))) return null;
    if (item.kind === 'nav') return item.nav.href;
    if (item.kind === 'skill') {
      return `${APP_ROUTES.CHAT}?skill=${encodeURIComponent(item.skill.id)}`;
    }
    if (item.kind === 'prompt' || item.kind === 'action') return null;
    return resolveEntityHref(item.entity);
  }, [activeIndex, additionalIds, flatItems]);

  const prefetchedHrefsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !activeHref || prefetchedHrefsRef.current.has(activeHref)) {
      return;
    }
    prefetchedHrefsRef.current.add(activeHref);
    router.prefetch(activeHref);
  }, [activeHref, open, router]);

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
        else if (item.kind === 'action') id = item.action.id;
        else id = item.entity.id;
        onAdditionalSelect?.(id);
        handleClose();
        return;
      }

      if (item.kind === 'nav') {
        handleClose();
        router.push(item.nav.href);
        return;
      }
      if (item.kind === 'skill') {
        const url = `${APP_ROUTES.CHAT}?skill=${encodeURIComponent(item.skill.id)}`;
        handleClose();
        router.push(url);
        return;
      }
      if (item.kind === 'action') {
        handleClose();
        item.action.onSelect();
        return;
      }
      if (item.kind === 'prompt') {
        handleClose();
        return;
      }
      const href = resolveEntityHref(item.entity);
      if (href) {
        handleClose();
        router.push(href);
      }
    },
    [flatItems, additionalIds, onAdditionalSelect, handleClose, router]
  );

  const focusSearchInput = useCallback(() => {
    const input = document.getElementById(`${generatedListId}-input`);
    if (input instanceof HTMLInputElement && document.activeElement !== input) {
      input.focus();
    }
  }, [generatedListId]);

  const handleKeyboardCommand = useCallback(
    (e: KeyboardEvent, focusedIndex?: number) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (
        (e.metaKey || e.ctrlKey) &&
        !(e.metaKey && e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (e.key.toLowerCase() === 'k') {
          if (e.repeat) return;
          e.preventDefault();
          handleClose();
          return;
        }
        if (e.key === '1' || e.key === '2' || e.key === '3') {
          const nextIndex = Number(e.key) - 1;
          if (nextIndex < flatItems.length) {
            e.preventDefault();
            setSelectedIndex(nextIndex);
            focusSearchInput();
          }
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.repeat && (e.key === 'Enter' || e.key === 'Escape')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          flatItems.length === 0
            ? 0
            : Math.min((focusedIndex ?? prev) + 1, flatItems.length - 1)
        );
        focusSearchInput();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max((focusedIndex ?? prev) - 1, 0));
        focusSearchInput();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const index = focusedIndex ?? activeIndex;
        if (index !== null) commitIndex(index);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    },
    [activeIndex, commitIndex, flatItems.length, focusSearchInput, handleClose]
  );
  const handleKeyboardCommandRef = useRef(handleKeyboardCommand);
  useEffect(() => {
    handleKeyboardCommandRef.current = handleKeyboardCommand;
  }, [handleKeyboardCommand]);

  const resultsRef = useRef<HTMLDivElement>(null);

  // The context-mounted header delegates directly. Global handling belongs
  // to this palette's dialog input or result composite. Escape also dismisses
  // Search from non-form controls; editors retain their own Escape handling.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target === inputRef.current) {
        handleKeyboardCommand(event);
        return;
      }
      const target = event.target;
      if (event.key === 'Escape' && !isFormElement(target)) {
        handleKeyboardCommand(event);
        return;
      }
      if (
        !(target instanceof HTMLElement) ||
        !resultsRef.current?.contains(target) ||
        isFormElement(target)
      ) {
        return;
      }
      if (target.getAttribute('role') === 'option') {
        const index = flatItems.findIndex(
          (_, rowIndex) => target.id === `${generatedListId}-row-${rowIndex}`
        );
        if (index >= 0) handleKeyboardCommand(event, index);
      } else if (target === resultsRef.current) {
        handleKeyboardCommand(event);
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [flatItems, generatedListId, handleKeyboardCommand, open]);

  const dialogInput = (
    <div className='flex h-full min-w-0 flex-1 items-center gap-2'>
      <Search
        className='size-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <input
        ref={inputRef}
        id={`${generatedListId}-input`}
        type='search'
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        placeholder='Search Jovie or run a command…'
        className='min-w-0 flex-1 appearance-none bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token focus:outline-none focus-visible:outline-none'
        aria-label='Command Palette Search'
        role='combobox'
        aria-autocomplete='list'
        aria-controls={generatedListId}
        aria-activedescendant={activeRowId ?? undefined}
        aria-describedby={paletteDescriptionId}
        aria-expanded
        data-testid='command-palette-header-input'
      />
      <span className='hidden shrink-0 text-2xs font-medium text-quaternary-token sm:inline'>
        Esc
      </span>
    </div>
  );

  useEffect(() => {
    if (presentation !== 'main') return undefined;
    if (!open) {
      onHeaderChange?.(null);
      return undefined;
    }
    onHeaderChange?.(
      <CmdKMainPlaneSearchInput
        value={query}
        open={open}
        onQueryChange={nextQuery => {
          setQuery(nextQuery);
          setSelectedIndex(0);
        }}
        // This header element is mounted through context and otherwise keeps
        // the callback from its first render. Resolve through a ref so Enter
        // commits against the current filtered result list.
        onKeyDown={event => handleKeyboardCommandRef.current(event)}
        listId={generatedListId}
        activeRowId={activeRowId}
        descriptionId={paletteDescriptionId}
      />
    );
    return () => onHeaderChange?.(null);
  }, [
    activeRowId,
    generatedListId,
    onHeaderChange,
    open,
    paletteDescriptionId,
    presentation,
    query,
  ]);

  const results = (
    <>
      <p id={paletteDescriptionId} className='sr-only'>
        When the search is empty, each prioritized group shows up to five items.
        Type to search all matching items.
      </p>
      <div
        role='status'
        aria-live='polite'
        className='flex h-10 shrink-0 items-center gap-2 px-4 text-sm text-secondary-token'
      >
        {hasSearchError ? (
          <>
            <span>Some results could not load.</span>
            <Button
              variant='ghost'
              size='sm'
              disabled={isSearching}
              onClick={() => {
                focusSearchInput();
                retrySearch();
              }}
            >
              Retry Search
            </Button>
          </>
        ) : isSearching ? (
          pendingMessage
        ) : null}
      </div>
      <div
        ref={resultsRef}
        className='min-h-0 flex-1 overflow-y-auto pb-2 pt-1.5'
        role='listbox'
        aria-label='Command Palette Results'
        aria-busy={isSearching}
        id={generatedListId}
      >
        <PaletteList
          sections={allSections}
          selectedIndex={activeIndex ?? -1}
          setSelectedIndex={setSelectedIndex}
          commitIndex={commitIndex}
          emptyHint={isSearching || hasSearchError ? null : 'No matches.'}
          variant='cmdk'
          showIndexedShortcuts
          listId={generatedListId}
        />
      </div>
      {hasHiddenDefaults ? (
        <p className='shrink-0 border-t border-(--app-shell-frame-seam) px-3.5 py-2 text-2xs text-tertiary-token'>
          Showing top five per group. Type to search all results.
        </p>
      ) : null}
    </>
  );

  if (presentation === 'main') {
    return open ? (
      <section
        className='flex h-full min-h-0 w-full flex-col bg-(--app-shell-content-surface)'
        data-testid='cmdk-main-plane'
        data-surface='cmdk'
      >
        {results}
      </section>
    ) : null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant='fullscreen' hideClose testId='cmdk-full-page'>
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
          <div className='flex shrink-0 items-center border-b border-(--app-shell-frame-seam) px-3.5 py-2.5'>
            {dialogInput}
          </div>
          {results}
        </div>
      </DialogContent>
    </Dialog>
  );
}
