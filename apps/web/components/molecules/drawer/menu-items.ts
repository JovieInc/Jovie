import type { CommonDropdownItem } from '@jovie/ui';
import { X } from 'lucide-react';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';

function isSeparatorItem(
  item: TableActionMenuItem | CommonDropdownItem | undefined
): boolean {
  if (!item) return false;
  if ('type' in item) {
    return item.type === 'separator';
  }
  return item.id === 'separator' || item.id.startsWith('separator-');
}

function normalizeTableActionMenuItems(
  items: readonly TableActionMenuItem[]
): TableActionMenuItem[] {
  const normalized: TableActionMenuItem[] = [];

  for (const item of items) {
    if (isSeparatorItem(item)) {
      if (normalized.length === 0 || isSeparatorItem(normalized.at(-1))) {
        continue;
      }

      normalized.push(item);
      continue;
    }

    if (item.children && item.children.length > 0) {
      const children = normalizeTableActionMenuItems(item.children);

      if (children.length === 0) {
        continue;
      }

      normalized.push({
        ...item,
        children,
      });
      continue;
    }

    normalized.push(item);
  }

  while (normalized.length > 0 && isSeparatorItem(normalized.at(-1))) {
    normalized.pop();
  }

  return normalized;
}

export function commonDropdownItemsToTableActionMenuItems(
  items: readonly CommonDropdownItem[],
  path = 'drawer'
): TableActionMenuItem[] {
  return normalizeTableActionMenuItems(
    items.flatMap((item, index): TableActionMenuItem[] => {
      if (item.type === 'separator') {
        return [
          {
            id: `separator-${path}-${index}`,
            label: '',
            onClick: () => {},
          },
        ];
      }

      if (item.type === 'submenu') {
        const children = commonDropdownItemsToTableActionMenuItems(
          item.items,
          `${path}-${item.id}`
        );

        if (children.length === 0) {
          return [];
        }

        return [
          {
            id: item.id,
            label: item.label,
            icon: item.icon,
            disabled: item.disabled,
            children,
          },
        ];
      }

      if (item.type === 'action') {
        return [
          {
            id: item.id,
            label: item.label,
            icon: item.icon,
            onClick: item.onClick,
            disabled: item.disabled,
            variant: item.variant,
            subText: item.subText,
          },
        ];
      }

      return [];
    })
  );
}

export function appendCloseActionMenuItem(
  items: readonly TableActionMenuItem[],
  onClose?: () => void,
  label = 'Close'
): TableActionMenuItem[] {
  if (!onClose) {
    return normalizeTableActionMenuItems(items);
  }

  return normalizeTableActionMenuItems([
    ...items,
    ...(items.length > 0
      ? [
          {
            id: 'separator-close',
            label: '',
            onClick: () => {},
          },
        ]
      : []),
    {
      id: 'close-drawer',
      label,
      icon: X,
      onClick: onClose,
    },
  ]);
}
