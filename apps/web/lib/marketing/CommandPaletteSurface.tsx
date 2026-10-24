'use client';

import { useId, useState } from 'react';
import type { PickerItem } from '@/components/jovie/components/picker-rows';
import { CmdKMainPlaneSearchInput } from '@/components/organisms/CmdKMainPlaneSearchInput';
import {
  applyPaletteDefaultLimits,
  buildRegistrySections,
  flattenSections,
  hasHiddenPaletteDefaults,
  PaletteList,
} from '@/components/organisms/SharedCommandPalette';
import {
  commandsForSurface,
  isCommandVisible,
  type NavCommand,
  type SkillCommand,
} from '@/lib/commands/registry';

function committedCommandId(item: PickerItem | undefined): string | null {
  if (!item) return null;
  if (item.kind === 'nav') return item.nav.id;
  if (item.kind === 'skill') return item.skill.id;
  return null;
}

/**
 * Live cmdk surface: the shipped search field and palette list, fed by the
 * workspace command registry. Flag-gated rows stay hidden. Enter records the
 * selected command instead of leaving the page.
 */
export function CommandPaletteSurface() {
  const listId = useId();
  const descriptionId = useId();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [committedId, setCommittedId] = useState<string | null>(null);

  const commands = commandsForSurface('cmdk', {
    youtubeWorkspaceNav: false,
    jovieWorkNav: false,
  }).filter(command => isCommandVisible(command, {}));
  const skills = commands.filter(
    (command): command is SkillCommand => command.kind === 'skill'
  );
  const navs = commands.filter(
    (command): command is NavCommand => command.kind === 'nav'
  );
  const registrySections = buildRegistrySections(query, skills, navs, [], []);
  const sections = applyPaletteDefaultLimits(query, registrySections);
  const items = flattenSections(sections);
  const hiddenDefaults = hasHiddenPaletteDefaults(query, registrySections);
  const activeIndex =
    items.length === 0 ? -1 : Math.min(selectedIndex, items.length - 1);
  const activeRowId = activeIndex >= 0 ? `${listId}-row-${activeIndex}` : null;

  function commitAt(index: number) {
    const id = committedCommandId(items[index]);
    if (id) setCommittedId(id);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(previous =>
        items.length === 0 ? 0 : Math.min(previous + 1, items.length - 1)
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(previous => Math.max(previous - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0) commitAt(activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      setSelectedIndex(0);
    }
  }

  return (
    <div
      className='flex max-h-96 flex-col'
      data-committed-command={committedId ?? ''}
      data-surface='cmdk'
      data-testid='shared-command-palette'
    >
      <div className='flex h-11 shrink-0 items-center border-b border-subtle px-3'>
        <CmdKMainPlaneSearchInput
          activeRowId={activeRowId}
          descriptionId={descriptionId}
          listId={listId}
          onKeyDown={onKeyDown}
          onQueryChange={next => {
            setQuery(next);
            setSelectedIndex(0);
          }}
          open
          value={query}
        />
      </div>
      <p className='sr-only' id={descriptionId}>
        When the search is empty, each prioritized group shows up to five items.
        Type to search all matching items.
      </p>
      <div
        aria-label='Command Palette Results'
        className='min-h-0 flex-1 overflow-y-auto pb-2 pt-1'
        id={listId}
        role='listbox'
      >
        <PaletteList
          commitIndex={commitAt}
          emptyHint='No matches.'
          listId={listId}
          sections={sections}
          selectedIndex={activeIndex}
          setSelectedIndex={setSelectedIndex}
          showIndexedShortcuts
          variant='cmdk'
        />
      </div>
      {hiddenDefaults ? (
        <p className='shrink-0 border-t border-subtle px-3 py-2 text-2xs text-tertiary-token'>
          Showing top five per group. Type to search all results.
        </p>
      ) : null}
    </div>
  );
}
