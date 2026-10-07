import { type CSSProperties, createElement } from 'react';
import type {
  CommonDropdownFilterItemPredicate,
  CommonDropdownItem,
  CommonDropdownRadioItem,
} from './common-dropdown-types';
import {
  isActionItem,
  isActionRow,
  isCheckboxItem,
  isCustomItem,
  isLabel,
  isRadioGroup,
  isSeparator,
  isSubmenu,
} from './common-dropdown-types';

function getItemLabelText(item: CommonDropdownItem): string {
  if (isActionItem(item) || isCheckboxItem(item)) {
    return [item.label, item.description].filter(Boolean).join(' ');
  }

  if (isActionRow(item)) {
    return item.items
      .map(action =>
        [action.label, action.description].filter(Boolean).join(' ')
      )
      .join(' ');
  }

  if (isSubmenu(item)) {
    return item.label;
  }

  if (isRadioGroup(item)) {
    return item.items
      .map(radioItem =>
        [radioItem.label, radioItem.description].filter(Boolean).join(' ')
      )
      .join(' ');
  }

  if (isLabel(item)) {
    return item.label;
  }

  return '';
}

function defaultFilterItem(item: CommonDropdownItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return getItemLabelText(item).toLowerCase().includes(normalizedQuery);
}

function itemMatches(
  item: CommonDropdownItem,
  query: string,
  filterItem?: CommonDropdownFilterItemPredicate
): boolean {
  return (filterItem ?? defaultFilterItem)(item, query);
}

function radioItemMatches(
  item: Omit<CommonDropdownRadioItem, 'type'>,
  query: string,
  filterItem?: CommonDropdownFilterItemPredicate
): boolean {
  if (filterItem) {
    return filterItem({ ...item, type: 'radio' }, query);
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [item.label, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

function normalizeMenuSeparators(
  items: readonly CommonDropdownItem[]
): CommonDropdownItem[] {
  const normalized: CommonDropdownItem[] = [];

  for (const item of items) {
    if (isSeparator(item)) {
      if (normalized.length === 0 || isSeparator(normalized.at(-1)!)) {
        continue;
      }

      normalized.push(item);
      continue;
    }

    normalized.push(
      isSubmenu(item)
        ? { ...item, items: normalizeMenuSeparators(item.items) }
        : item
    );
  }

  while (normalized.length > 0 && isSeparator(normalized.at(-1)!)) {
    normalized.pop();
  }

  return normalized;
}

function normalizeVisibleItems(
  items: readonly CommonDropdownItem[]
): CommonDropdownItem[] {
  const withoutOrphanLabels = items.filter((item, index) => {
    if (!isLabel(item)) return true;

    const remainingItems = items.slice(index + 1);
    const nextSectionBoundary = remainingItems.findIndex(
      nextItem => isSeparator(nextItem) || isLabel(nextItem)
    );
    const sectionItems =
      nextSectionBoundary === -1
        ? remainingItems
        : remainingItems.slice(0, nextSectionBoundary);

    return sectionItems.some(
      nextItem => !(isSeparator(nextItem) || isLabel(nextItem))
    );
  });

  const normalized: CommonDropdownItem[] = [];

  for (const item of withoutOrphanLabels) {
    if (isSeparator(item)) {
      if (normalized.length === 0 || isSeparator(normalized.at(-1)!)) {
        continue;
      }
    }

    normalized.push(item);
  }

  while (normalized.length > 0 && isSeparator(normalized.at(-1)!)) {
    normalized.pop();
  }

  return normalized;
}

export function filterItems(
  items: readonly CommonDropdownItem[],
  query: string,
  searchMode: 'root' | 'recursive',
  filterItem?: CommonDropdownFilterItemPredicate
): CommonDropdownItem[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return normalizeMenuSeparators(items);
  }

  const filtered = items.flatMap((item): CommonDropdownItem[] => {
    if (isSeparator(item) || isLabel(item) || isCustomItem(item)) {
      return [item];
    }

    if (isActionRow(item)) {
      const matchingItems = item.items.filter(action =>
        itemMatches(action, trimmedQuery, filterItem)
      );

      return matchingItems.length > 0
        ? [{ ...item, items: matchingItems }]
        : [];
    }

    if (isRadioGroup(item)) {
      const matchingItems = item.items.filter(radioItem =>
        radioItemMatches(radioItem, trimmedQuery, filterItem)
      );

      return matchingItems.length > 0
        ? [{ ...item, items: matchingItems }]
        : [];
    }

    if (isSubmenu(item)) {
      const submenuFilterItem = item.filterItem ?? filterItem;
      const submenuMatches = itemMatches(item, trimmedQuery, submenuFilterItem);

      if (searchMode === 'root') {
        return submenuMatches ? [item] : [];
      }

      if (submenuMatches) {
        return [{ ...item, items: [...item.items] }];
      }

      const filteredChildren = filterItems(
        item.items,
        trimmedQuery,
        'recursive',
        submenuFilterItem
      );

      return filteredChildren.length > 0
        ? [{ ...item, items: filteredChildren }]
        : [];
    }

    return itemMatches(item, trimmedQuery, filterItem) ? [item] : [];
  });

  return normalizeVisibleItems(filtered);
}

export function getContentStyle(
  minWidth?: number | string,
  maxHeight?: number | string,
  kind: 'dropdown' | 'context' = 'dropdown'
): CSSProperties | undefined {
  const available = `var(--radix-${kind}-menu-content-available-height)`;
  const requested =
    typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
  return {
    maxHeight:
      requested && requested !== available
        ? `min(${requested}, ${available})`
        : available,
    minWidth,
    overflowY: 'auto',
  };
}

/** Count real controls, including action rows and radio groups. Never truncate. */
export const MENU_MAX_GROUP_ACTIONS = 8;
export const MENU_MAX_ROOT_ACTIONS = 12;
export const MENU_MAX_SUBMENU_DEPTH = 1;

export function menuNeedsSearch(items: readonly CommonDropdownItem[]): boolean {
  let total = 0;
  let group = 0;
  for (const item of items) {
    if (isSeparator(item) || isLabel(item)) {
      group = 0;
      continue;
    }
    const count =
      isActionRow(item) || isRadioGroup(item) ? item.items.length : 1;
    total += count;
    group += count;
    if (group > MENU_MAX_GROUP_ACTIONS || total > MENU_MAX_ROOT_ACTIONS)
      return true;
  }
  return false;
}

export function menuSubmenuDepth(items: readonly CommonDropdownItem[]): number {
  return items.reduce(
    (depth, item) =>
      isSubmenu(item)
        ? Math.max(depth, 1 + menuSubmenuDepth(item.items))
        : depth,
    0
  );
}

/** Deep hierarchies become a searchable chooser, retaining every supplied action. */
export function flattenMenuItems(
  items: readonly CommonDropdownItem[],
  labels: readonly string[] = [],
  ids: readonly string[] = [],
  parentDisabled = false
): CommonDropdownItem[] {
  return items.flatMap((item): CommonDropdownItem[] => {
    const disabled = parentDisabled || item.disabled;
    const id = [...ids, item.id].join('/');
    const label = (value: string) => [...labels, value].join(' › ');
    if (isSubmenu(item))
      return flattenMenuItems(
        item.items,
        [...labels, item.label],
        [...ids, item.id],
        disabled
      );
    if (isCustomItem(item))
      return [
        {
          ...item,
          id,
          render: () =>
            createElement(
              'div',
              { inert: disabled || undefined },
              item.render()
            ),
        },
      ];
    if (isActionRow(item)) {
      return [
        {
          ...item,
          id,
          disabled,
          items: item.items.map(child => ({
            ...child,
            id: `${id}/${child.id}`,
            disabled: disabled || child.disabled,
            label: label(child.label),
          })),
        },
      ];
    }
    if (isRadioGroup(item))
      return [
        {
          ...item,
          id,
          disabled,
          items: item.items.map(child => ({
            ...child,
            id: `${id}/${child.id}`,
            disabled: disabled || child.disabled,
            label: label(child.label),
          })),
        },
      ];
    return [
      {
        ...item,
        id,
        disabled,
        ...('label' in item ? { label: label(item.label) } : {}),
      },
    ];
  });
}
