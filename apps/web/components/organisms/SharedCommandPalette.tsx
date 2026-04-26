'use client';

/**
 * SharedCommandPalette — primitives shared by the chat slash picker and the
 * global cmd+k palette.
 *
 * Surfaces:
 *   - `chat-slash` (presentation: 'inline'): rendered inside the composer
 *     surface; reads picker state from the parent (the composer owns the
 *     textarea + caret). Use {@link InlinePalette}.
 *   - `cmdk` (presentation: 'modal'): rendered as a Radix Dialog in
 *     `CmdKPalette` (sibling file). Owns its own input + selection state.
 *
 * Both surfaces render the same rich rows (`picker-rows.tsx`) and share the
 * same arrow/Enter/Escape keyboard model. This file owns the section data
 * shape, the section list renderer, and the inline body. The modal surface
 * lives in `CmdKPalette.tsx` so each file stays under the LOC budget.
 */

import { type ReactNode, useCallback, useMemo } from 'react';
import { type EntityRef } from '@/lib/commands/entities';
import { type NavCommand, type SkillCommand } from '@/lib/commands/registry';
import { cn } from '@/lib/utils';
import {
  type PickerItem,
  PickerRow,
  pickerItemKey,
} from '../jovie/components/picker-rows';

export interface PaletteSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly PickerItem[];
}

export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function flattenSections(
  sections: readonly PaletteSection[]
): PickerItem[] {
  const out: PickerItem[] = [];
  for (const section of sections) out.push(...section.items);
  return out;
}

export function buildRegistrySections(
  query: string,
  skills: readonly SkillCommand[],
  navs: readonly NavCommand[],
  releases: readonly EntityRef[],
  artists: readonly EntityRef[]
): PaletteSection[] {
  const lower = query.toLowerCase();
  const sections: PaletteSection[] = [];
  const matchedNavs = navs.filter(n =>
    fuzzyMatch(`${n.label} ${n.description}`, query)
  );
  if (matchedNavs.length > 0) {
    sections.push({
      id: 'nav',
      label: 'Go to',
      items: matchedNavs.map(nav => ({ kind: 'nav' as const, nav })),
    });
  }
  const matchedSkills = skills.filter(s =>
    fuzzyMatch(`${s.label} ${s.description}`, query)
  );
  if (matchedSkills.length > 0) {
    sections.push({
      id: 'skills',
      label: 'Skills',
      items: matchedSkills.map(skill => ({ kind: 'skill' as const, skill })),
    });
  }
  const matchedReleases = releases.filter(r =>
    !lower ? true : r.label.toLowerCase().includes(lower)
  );
  if (matchedReleases.length > 0) {
    sections.push({
      id: 'releases',
      label: 'Releases',
      items: matchedReleases
        .slice(0, 6)
        .map(entity => ({ kind: 'entity' as const, entity })),
    });
  }
  if (artists.length > 0) {
    sections.push({
      id: 'artists',
      label: 'Artists',
      items: artists
        .slice(0, 6)
        .map(entity => ({ kind: 'entity' as const, entity })),
    });
  }
  return sections;
}

/**
 * Filter caller-provided "additional" sections by the active query so the
 * search input still narrows them. Empty query passes all items through.
 */
export function filterAdditionalSections(
  query: string,
  additional: readonly PaletteSection[] | undefined
): PaletteSection[] {
  if (!additional || additional.length === 0) return [];
  const lower = query.toLowerCase();
  if (!lower) return [...additional];
  return additional
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.kind === 'skill') return fuzzyMatch(item.skill.label, lower);
        if (item.kind === 'nav') return fuzzyMatch(item.nav.label, lower);
        return fuzzyMatch(item.entity.label, lower);
      }),
    }))
    .filter(section => section.items.length > 0);
}

interface PaletteListProps {
  readonly sections: readonly PaletteSection[];
  readonly selectedIndex: number;
  readonly setSelectedIndex: (idx: number) => void;
  readonly commitIndex: (idx: number) => void;
  readonly emptyHint: ReactNode;
}

export function PaletteList({
  sections,
  selectedIndex,
  setSelectedIndex,
  commitIndex,
  emptyHint,
}: PaletteListProps) {
  if (sections.length === 0) {
    return (
      <div className='px-3 py-6 text-center text-xs text-tertiary-token'>
        {emptyHint}
      </div>
    );
  }
  // Compute the running flat-index offset for each section ahead of render
  // (no in-render mutation — keeps react-hooks/immutability happy and lets
  // the section map stay a pure projection).
  const sectionStarts: number[] = [];
  let runningStart = 0;
  for (const section of sections) {
    sectionStarts.push(runningStart);
    runningStart += section.items.length;
  }
  return (
    <>
      {sections.map((section, sectionIdx) => {
        const start = sectionStarts[sectionIdx] ?? 0;
        return (
          <div key={section.id}>
            <div className='px-[10px] pb-[5px] pt-[11px] text-[9.5px] font-semibold uppercase tracking-[0.1em] text-quaternary-token'>
              {section.label}
            </div>
            {section.items.map((item, localIdx) => {
              const flatIdx = start + localIdx;
              return (
                <PickerRow
                  key={pickerItemKey(item)}
                  item={item}
                  index={flatIdx}
                  isActive={flatIdx === selectedIndex}
                  onMouseEnter={setSelectedIndex}
                  onCommit={commitIndex}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

interface InlinePaletteProps {
  readonly sections: readonly PaletteSection[];
  readonly selectedIndex: number;
  readonly setSelectedIndex: (idx: number) => void;
  readonly onCommit: (item: PickerItem) => void;
  readonly variant: 'inline' | 'rail';
  readonly header?: ReactNode;
  readonly emptyHint?: ReactNode;
}

/**
 * Inline (chat-slash) palette body. The composer owns picker state — this
 * just renders sections + delegates commit. Used by SlashCommandMenu's thin
 * adapter shell.
 */
export function InlinePalette({
  sections,
  selectedIndex,
  setSelectedIndex,
  onCommit,
  variant,
  header,
  emptyHint = 'No matches',
}: InlinePaletteProps) {
  const flat = useMemo(() => flattenSections(sections), [sections]);
  const commitIndex = useCallback(
    (idx: number) => {
      const item = flat[idx];
      if (item) onCommit(item);
    },
    [flat, onCommit]
  );

  return (
    <div
      className={cn('flex flex-col', variant === 'rail' && 'h-full min-h-0')}
      data-testid='shared-command-palette'
      data-surface='chat-slash'
    >
      {header}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-[5px]',
          variant === 'inline' && 'max-h-[260px]'
        )}
        role='menu'
      >
        <PaletteList
          sections={sections}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          commitIndex={commitIndex}
          emptyHint={emptyHint}
        />
      </div>
    </div>
  );
}
