'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { ClipboardCopy, type LucideIcon, XCircle } from 'lucide-react';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import type { ContextMenuItemType } from '@/components/organisms/table';

export interface FeedbackActionTarget {
  readonly id: string;
  readonly status: 'pending' | 'dismissed';
}

export interface FeedbackActionHandlers<T extends FeedbackActionTarget> {
  readonly onCopyAsMarkdown: (item: T) => void;
  readonly onDismiss: (item: T) => void;
  readonly isDismissPending: (id: string) => boolean;
}

interface FeedbackActionDefinition extends DrawerHeaderAction {
  readonly destructive?: boolean;
}

/**
 * Canonical action source for feedback entities.
 *
 * Table overflow, row context menus, and the detail rail all derive from this
 * registry so an action cannot appear in one surface but disappear from another.
 */
export function buildFeedbackActions<T extends FeedbackActionTarget>(
  item: T,
  handlers: FeedbackActionHandlers<T>
): readonly FeedbackActionDefinition[] {
  return [
    {
      id: 'copy-feedback-markdown',
      label: 'Copy As Markdown',
      icon: ClipboardCopy,
      onClick: () => handlers.onCopyAsMarkdown(item),
    },
    {
      id: 'dismiss-feedback',
      label: 'Dismiss',
      icon: XCircle,
      onClick: () => handlers.onDismiss(item),
      disabled:
        item.status === 'dismissed' || handlers.isDismissPending(item.id),
      destructive: true,
    },
  ];
}

function toContextIcon(Icon: LucideIcon) {
  return <Icon className='h-4 w-4' aria-hidden='true' />;
}

export function feedbackActionsToContextMenuItems(
  actions: readonly FeedbackActionDefinition[]
): ContextMenuItemType[] {
  return actions.flatMap((action, index): ContextMenuItemType[] => [
    ...(index > 0 ? [{ type: 'separator' } as const] : []),
    {
      id: action.id,
      label: action.label,
      icon: toContextIcon(action.icon),
      onClick: action.onClick ?? (() => {}),
      disabled: action.disabled,
      destructive: action.destructive,
    },
  ]);
}

export function feedbackActionsToDropdownItems(
  actions: readonly FeedbackActionDefinition[]
): CommonDropdownItem[] {
  return actions.flatMap((action, index): CommonDropdownItem[] => [
    ...(index > 0
      ? [
          {
            id: `feedback-action-separator-${index}`,
            type: 'separator' as const,
          },
        ]
      : []),
    {
      id: action.id,
      type: 'action',
      label: action.label,
      icon: action.icon,
      onClick: action.onClick ?? (() => {}),
      disabled: action.disabled,
      variant: action.destructive ? 'destructive' : 'default',
    },
  ]);
}
