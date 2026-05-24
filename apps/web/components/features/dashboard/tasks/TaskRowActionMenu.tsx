'use client';

import { MoreHorizontal } from 'lucide-react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';

type TaskRowActionMenuVisibility = 'always' | 'hover';

export function getTaskRowActionTriggerClassName({
  visibility,
  selected = false,
}: Readonly<{
  visibility: TaskRowActionMenuVisibility;
  selected?: boolean;
}>): string {
  return cn(
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-[background-color,color,opacity] duration-subtle',
    'hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_68%,transparent)] hover:text-primary-token',
    'focus-visible:outline-none focus-visible:bg-[color-mix(in_oklab,var(--linear-row-hover)_70%,transparent)] focus-visible:text-primary-token',
    visibility === 'hover' && [
      'opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 group-hover/task-board-card-shell:opacity-100 group-focus-visible/task-board-card-shell:opacity-100 group-hover/task-row:opacity-100 group-focus-visible/task-row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
      selected && 'opacity-100',
    ]
  );
}

export function TaskRowActionMenu({
  items,
  selected = false,
  visibility = 'always',
}: Readonly<{
  items: ContextMenuItemType[];
  selected?: boolean;
  visibility?: TaskRowActionMenuVisibility;
}>) {
  return (
    <TableActionMenu
      items={convertContextMenuItems(items)}
      trigger='custom'
      align='end'
    >
      <button
        type='button'
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        aria-label='Open task actions'
        className={getTaskRowActionTriggerClassName({
          visibility,
          selected,
        })}
      >
        <MoreHorizontal className='h-3.5 w-3.5' />
      </button>
    </TableActionMenu>
  );
}
