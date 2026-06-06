import { DropdownMenuItem } from '@jovie/ui';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const TOOLBAR_MENU_CONTENT_CLASS = 'system-b-toolbar-menu-content';

export const TOOLBAR_MENU_SEPARATOR_CLASS = 'system-b-toolbar-menu-separator';

export const TOOLBAR_MENU_HEADER_CLASS = 'system-b-toolbar-menu-header';

export const TOOLBAR_MENU_HEADER_BADGE_CLASS =
  'system-b-toolbar-menu-header-badge';

export const TOOLBAR_MENU_ROW_SELECTED_CLASS =
  'system-b-toolbar-menu-row-selected';

export const TOOLBAR_MENU_ITEM_CLASS = 'system-b-toolbar-menu-item';

export const TOOLBAR_MENU_SUB_TRIGGER_CLASS =
  'system-b-toolbar-menu-sub-trigger';

export const TOOLBAR_MENU_LEADING_VISUAL_CLASS =
  'system-b-toolbar-menu-leading-visual';

export const TOOLBAR_MENU_TRAILING_VISUAL_CLASS =
  'system-b-toolbar-menu-trailing-visual';

export const TOOLBAR_MENU_CHECK_ICON_CLASS = 'system-b-toolbar-menu-check-icon';

export function ToolbarMenuRow({
  leadingVisual,
  label,
  trailingVisual,
  trailingVisualClassName,
}: Readonly<{
  leadingVisual?: ReactNode;
  label: ReactNode;
  trailingVisual?: ReactNode;
  trailingVisualClassName?: string;
}>) {
  return (
    <>
      <span data-menu-leading className={TOOLBAR_MENU_LEADING_VISUAL_CLASS}>
        {leadingVisual ?? null}
      </span>
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
      <span
        data-menu-trailing
        className={cn(
          TOOLBAR_MENU_TRAILING_VISUAL_CLASS,
          trailingVisualClassName
        )}
      >
        {trailingVisual ?? null}
      </span>
    </>
  );
}

export function ToolbarMenuChoiceItem({
  active,
  leadingVisual,
  label,
  onSelect,
  disabled = false,
  trailingVisual,
  selectedClassName,
}: Readonly<{
  active: boolean;
  leadingVisual?: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  trailingVisual?: ReactNode;
  selectedClassName?: string;
}>) {
  const resolvedTrailingVisual =
    active || trailingVisual ? (
      <>
        {trailingVisual ?? null}
        {active ? <Check className={TOOLBAR_MENU_CHECK_ICON_CLASS} /> : null}
      </>
    ) : null;

  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={disabled}
      data-menu-row
      data-selected={active ? 'true' : undefined}
      className={cn(
        TOOLBAR_MENU_ITEM_CLASS,
        active && TOOLBAR_MENU_ROW_SELECTED_CLASS,
        active && selectedClassName
      )}
    >
      <ToolbarMenuRow
        leadingVisual={leadingVisual}
        label={label}
        trailingVisual={resolvedTrailingVisual}
      />
    </DropdownMenuItem>
  );
}
