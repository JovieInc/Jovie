import type { CSSProperties } from 'react';
import type {
  CommonDropdownFilterItemPredicate,
  CommonDropdownItem,
  CommonDropdownRadioItem,
} from './common-dropdown-types';
import {
  isActionItem,
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
    return [...items];
  }

  const filtered = items.flatMap((item): CommonDropdownItem[] => {
    if (isSeparator(item) || isLabel(item) || isCustomItem(item)) {
      return [item];
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
  maxHeight?: number | string
): CSSProperties | undefined {
  if (minWidth === undefined && maxHeight === undefined) {
    return undefined;
  }

  return { maxHeight, minWidth };
}
