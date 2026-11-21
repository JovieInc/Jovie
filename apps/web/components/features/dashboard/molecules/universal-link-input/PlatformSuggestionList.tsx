'use client';

import { FloatingPortal } from '@floating-ui/react';
import { HostDrawnSelect, PlainButton } from '@jovie/ui';

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { NEUTRAL_BRAND_FALLBACK_HEX } from '@/constants/platforms/brand-colors';
import { cn } from '@/lib/utils';
import { getContrastTextOnBrand } from '@/lib/utils/color';

import type { groupByCategory, RankedPlatformOption } from './utils';

/**
 * Renders a platform name with matched characters highlighted.
 */
export function HighlightedName({
  name,
  matchIndices,
}: {
  readonly name: string;
  readonly matchIndices: number[];
}) {
  if (matchIndices.length === 0) {
    return <span className='font-caption'>{name}</span>;
  }

  const matchSet = new Set(matchIndices);
  const characters = Array.from(name).map((char, index) => ({
    id: `${name}-${index}-${char}`,
    char,
    index,
  }));

  return (
    <span className='font-caption'>
      {characters.map(character => (
        <span
          key={character.id}
          className={matchSet.has(character.index) ? 'text-accent' : undefined}
        >
          {character.char}
        </span>
      ))}
    </span>
  );
}

/**
 * A single platform suggestion item with icon, highlighted name, and hint.
 */
export function PlatformSuggestionItem({
  option,
  active,
  optionId,
  onMouseEnter,
  onClick,
}: {
  readonly option: RankedPlatformOption;
  readonly active: boolean;
  readonly optionId: string;
  readonly onMouseEnter: () => void;
  readonly onClick: () => void;
}) {
  const iconMeta = getPlatformIconMetadata(option.icon);
  const iconHex = `#${iconMeta?.hex || NEUTRAL_BRAND_FALLBACK_HEX}`;

  return (
    <PlainButton
      data-option-id={optionId}
      type='button'
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left text-app text-primary-token transition-[background-color,color] duration-subtle ease-subtle active:bg-surface-2',
        active ? 'bg-surface-2' : 'hover:bg-surface-2'
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className='flex items-center gap-2.5'>
        {/* Platform icon - larger on mobile */}
        <span
          className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-6 sm:w-6 sm:rounded-md'
          style={{
            backgroundColor: iconHex,
            color: getContrastTextOnBrand(iconHex),
          }}
        >
          <SocialIcon
            platform={option.icon}
            className='h-4 w-4 sm:h-3.5 sm:w-3.5'
          />
        </span>
        {/* Platform name with match highlighting */}
        <HighlightedName
          name={option.name}
          matchIndices={option.matchIndices}
        />
        {/* Simplified hint */}
        <span className='text-app text-tertiary-token'>{option.hint}</span>
      </span>
      {/* Only show Enter hint on active item */}
      {active && (
        <span className='max-sm:hidden text-app text-tertiary-token sm:inline'>
          Enter
        </span>
      )}
    </PlainButton>
  );
}

export interface PlatformSuggestionDropdownProps {
  readonly listId: string;
  readonly floatingRef: (node: HTMLElement | null) => void;
  readonly floatingStyles: React.CSSProperties;
  readonly platformSuggestions: RankedPlatformOption[];
  readonly groupedSuggestions: ReturnType<typeof groupByCategory> | null;
  readonly flatSuggestions: RankedPlatformOption[];
  readonly suggestionIndexById: Map<string, number>;
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (option: RankedPlatformOption) => void;
}

/** Autosuggest listbox (hidden native select) plus its floating visual list. */
export function PlatformSuggestionDropdown({
  listId,
  floatingRef,
  floatingStyles,
  platformSuggestions,
  groupedSuggestions,
  flatSuggestions,
  suggestionIndexById,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: PlatformSuggestionDropdownProps) {
  return (
    <>
      <HostDrawnSelect
        visuallyHidden
        id={listId}
        size={Math.max(Math.min(flatSuggestions.length, 8), 1)}
        aria-label='Platform Suggestions'
        value={
          activeIndex >= 0 && flatSuggestions[activeIndex]
            ? flatSuggestions[activeIndex].id
            : ''
        }
        onChange={event => {
          const selectedOption = flatSuggestions.find(
            option => option.id === event.target.value
          );
          if (selectedOption) {
            onSelect(selectedOption);
          }
        }}
      >
        <option value='' disabled>
          Select a platform
        </option>
        {groupedSuggestions
          ? groupedSuggestions.map(group => (
              <optgroup key={group.category} label={group.label}>
                {group.options.map(option => {
                  const optionIndex = suggestionIndexById.get(option.id) ?? 0;
                  return (
                    <option
                      key={option.id}
                      id={`${listId}-option-${optionIndex}`}
                      value={option.id}
                    >
                      {option.name} — {option.hint}
                    </option>
                  );
                })}
              </optgroup>
            ))
          : platformSuggestions.map((option, index) => (
              <option
                key={option.id}
                id={`${listId}-option-${index}`}
                value={option.id}
              >
                {option.name} — {option.hint}
              </option>
            ))}
      </HostDrawnSelect>
      <FloatingPortal>
        <div
          ref={floatingRef}
          style={floatingStyles}
          className='z-100 overflow-hidden rounded-b-3xl border-2 border-t-0 border-accent bg-surface-1 py-1 shadow-popover'
          onMouseDown={event => {
            event.preventDefault();
          }}
          aria-hidden='true'
        >
          {groupedSuggestions
            ? // Grouped view for short queries (popular platforms by category)
              groupedSuggestions.map((group, groupIndex) => {
                const groupStartIndex = flatSuggestions.findIndex(
                  opt => opt.id === group.options[0]?.id
                );
                return (
                  <div key={group.category}>
                    {/* Divider between categories (not before first) */}
                    {groupIndex > 0 && (
                      <div className='mx-3 my-1 border-t border-default' />
                    )}
                    <div className='px-3 pb-1 pt-2 text-app font-caption tracking-normal text-secondary-token'>
                      {group.label}
                    </div>
                    {group.options.map((option, indexInGroup) => {
                      const globalIndex = groupStartIndex + indexInGroup;
                      const active = globalIndex === activeIndex;
                      return (
                        <PlatformSuggestionItem
                          key={option.id}
                          option={option}
                          active={active}
                          optionId={`${listId}-option-${globalIndex}`}
                          onMouseEnter={() => onActiveIndexChange(globalIndex)}
                          onClick={() => onSelect(option)}
                        />
                      );
                    })}
                  </div>
                );
              })
            : // Flat view for longer queries (fuzzy matched results)
              platformSuggestions.map((option, index) => {
                const active = index === activeIndex;
                return (
                  <PlatformSuggestionItem
                    key={option.id}
                    option={option}
                    active={active}
                    optionId={`${listId}-option-${index}`}
                    onMouseEnter={() => onActiveIndexChange(index)}
                    onClick={() => onSelect(option)}
                  />
                );
              })}
        </div>
      </FloatingPortal>
    </>
  );
}
