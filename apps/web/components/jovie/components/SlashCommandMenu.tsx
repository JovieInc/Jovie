'use client';

import { Popover, PopoverAnchor, PopoverContent } from '@jovie/ui';
import Image from 'next/image';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import { getEntityProvider } from '@/lib/commands/entities';
import { commandsForSurface, type SkillCommand } from '@/lib/commands/registry';
import { cn } from '@/lib/utils';

export type SlashMenuMode = 'all' | EntityKind;

export interface SlashMenuItem {
  readonly kind: 'skill' | 'entity';
  readonly skill?: SkillCommand;
  readonly entity?: EntityRef;
}

interface SlashCommandMenuProps {
  readonly open: boolean;
  /** Ref to the element the popover anchors to (typically the textarea). */
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly query: string;
  /** 'all' shows skills + entities; an entity kind scopes to that picker. */
  readonly mode: SlashMenuMode;
  readonly onSelectSkill: (skill: SkillCommand) => void;
  readonly onSelectEntity: (entity: EntityRef) => void;
  readonly onClose: () => void;
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function headerForMode(mode: SlashMenuMode): string {
  if (mode === 'all') return 'Skills & references';
  if (mode === 'release') return 'Pick a release';
  if (mode === 'artist') return 'Pick an artist';
  return 'Pick a track';
}

function itemKey(item: SlashMenuItem): string {
  if (item.kind === 'skill' && item.skill) return `skill:${item.skill.id}`;
  return `entity:${item.entity?.kind}:${item.entity?.id}`;
}

/**
 * Slash command popover for the chat input.
 *
 * Renders a filtered list of Skills + Entities anchored to the caret.
 * Keyboard: ↑/↓ navigate, Enter select, Esc close.
 *
 * Two-step picker is orchestrated by the caller: when the user picks a
 * Skill with a required `entitySlot`, the caller re-opens this menu with
 * `mode` set to that entity kind so the next pick is scoped.
 */
export function SlashCommandMenu({
  open,
  anchorRef,
  query,
  mode,
  onSelectSkill,
  onSelectEntity,
  onClose,
}: SlashCommandMenuProps) {
  const skills = useMemo(() => {
    if (mode !== 'all') return [] as SkillCommand[];
    return commandsForSurface('chat-slash')
      .filter((c): c is SkillCommand => c.kind === 'skill')
      .filter(s => fuzzyMatch(`${s.label} ${s.description}`, query));
  }, [mode, query]);

  const entityKind: EntityKind | null = mode === 'all' ? null : mode;
  const entityProvider = entityKind ? getEntityProvider(entityKind) : undefined;
  const entitySearch = entityProvider
    ? entityProvider.useSearch(query)
    : { items: [], isLoading: false };

  const items: SlashMenuItem[] = useMemo(() => {
    const out: SlashMenuItem[] = skills.map(skill => ({
      kind: 'skill',
      skill,
    }));
    for (const e of entitySearch.items) {
      out.push({ kind: 'entity', entity: e });
    }
    return out;
  }, [skills, entitySearch.items]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  const commit = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      if (item.kind === 'skill' && item.skill) onSelectSkill(item.skill);
      else if (item.kind === 'entity' && item.entity)
        onSelectEntity(item.entity);
    },
    [items, onSelectSkill, onSelectEntity]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault();
        commit(selectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [open, items, selectedIndex, commit, onClose]);

  if (!open) return null;

  const headerLabel = headerForMode(mode);

  // Radix's virtualRef type requires a non-null current; this is safe because
  // the menu only renders when the caller has a live textarea ref.
  const virtualRef = anchorRef as RefObject<HTMLElement>;

  return (
    <Popover open={open} onOpenChange={o => !o && onClose()}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side='top'
        align='start'
        sideOffset={8}
        className='w-[320px] p-0'
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className='border-b border-(--linear-app-frame-seam) px-3 py-2 text-[11px] font-medium text-tertiary-token'>
          {headerLabel}
        </div>
        <div className='max-h-[280px] overflow-y-auto py-1' role='menu'>
          {items.length === 0 ? (
            <div className='px-3 py-6 text-center text-[12px] text-tertiary-token'>
              {entitySearch.isLoading ? 'Searching…' : 'No matches'}
            </div>
          ) : (
            items.map((item, i) => {
              const isSelected = i === selectedIndex;
              const key = itemKey(item);
              return (
                <button
                  key={key}
                  type='button'
                  role='menuitem'
                  aria-current={isSelected ? 'true' : undefined}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onMouseDown={e => {
                    e.preventDefault();
                    commit(i);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]',
                    isSelected
                      ? 'bg-surface-1 text-primary-token'
                      : 'text-secondary-token hover:bg-surface-1'
                  )}
                >
                  {item.kind === 'skill' && item.skill ? (
                    <>
                      <span className='font-medium'>{item.skill.label}</span>
                      <span className='ml-auto truncate text-[11px] text-tertiary-token'>
                        {item.skill.description}
                      </span>
                    </>
                  ) : item.entity ? (
                    <>
                      {item.entity.thumbnail ? (
                        <Image
                          src={item.entity.thumbnail}
                          alt=''
                          width={24}
                          height={24}
                          className='h-6 w-6 rounded-sm object-cover'
                          unoptimized
                        />
                      ) : (
                        <span className='h-6 w-6 rounded-sm bg-surface-2' />
                      )}
                      <span className='truncate'>{item.entity.label}</span>
                      <span className='ml-auto text-[11px] text-tertiary-token capitalize'>
                        {item.entity.kind}
                      </span>
                    </>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
