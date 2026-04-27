import { DropdownMenuItem } from '@jovie/ui';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { cn } from '@/lib/utils';

export const TOOLBAR_MENU_CONTENT_CLASS = cn(
  LINEAR_SURFACE.popover,
  'min-w-[13rem] overflow-hidden rounded-[11px] border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_16%,var(--linear-bg-surface-0))] p-1 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.24),0_10px_18px_-16px_rgba(15,23,42,0.18)] backdrop-blur-[8px]'
);

export const TOOLBAR_MENU_SEPARATOR_CLASS =
  'mx-1 my-1 h-px bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)]';

export const TOOLBAR_MENU_HEADER_CLASS =
  'flex items-center justify-between gap-2 border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)] px-2.5 py-[7px]';

export const TOOLBAR_MENU_HEADER_BADGE_CLASS =
  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_52%,transparent)] bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_36%,transparent)] px-[5px] text-[10px] font-[600] tabular-nums text-tertiary-token';

export const TOOLBAR_MENU_ROW_SELECTED_CLASS =
  'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_72%,transparent)] text-primary-token';

export const TOOLBAR_MENU_ITEM_CLASS =
  'flex min-h-8 min-w-[13rem] items-center rounded-lg px-2.5 py-1.25 text-[12.5px] font-[500] leading-4 text-secondary-token outline-none transition-[background-color,color] duration-150 hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)] hover:text-primary-token focus:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)] focus:text-primary-token data-[highlighted]:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)] data-[highlighted]:text-primary-token data-[disabled]:pointer-events-none data-[disabled]:opacity-45';

export const TOOLBAR_MENU_SUB_TRIGGER_CLASS =
  'justify-between gap-2 rounded-lg px-2.5 py-1.25 text-[12.5px] font-[500] leading-4 text-secondary-token hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)] hover:text-primary-token focus:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)] focus:text-primary-token data-[state=open]:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_64%,transparent)] data-[state=open]:text-primary-token';

export const TOOLBAR_MENU_LEADING_VISUAL_CLASS =
  'flex h-4 w-[18px] shrink-0 items-center justify-center text-tertiary-token';

export const TOOLBAR_MENU_TRAILING_VISUAL_CLASS =
  'inline-flex min-w-4 shrink-0 items-center justify-end gap-1 text-tertiary-token';

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
        {active ? <Check className='h-4 w-4 text-primary-token' /> : null}
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
