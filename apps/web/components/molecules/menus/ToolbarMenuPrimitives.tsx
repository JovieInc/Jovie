import { DropdownMenuItem } from '@jovie/ui';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { cn } from '@/lib/utils';

export const TOOLBAR_MENU_CONTENT_CLASS = cn(
  LINEAR_SURFACE.popover,
  'min-w-[13rem] overflow-hidden rounded-[12px] p-1.5'
);

export const TOOLBAR_MENU_SEPARATOR_CLASS =
  'my-1 bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)]';

export const TOOLBAR_MENU_ITEM_CLASS =
  'flex min-h-8 min-w-[13rem] items-center rounded-[10px] px-2.5 py-2 text-[13px] text-secondary-token outline-none transition-colors hover:bg-surface-1 hover:text-primary-token focus:bg-surface-1 focus:text-primary-token data-[disabled]:pointer-events-none data-[disabled]:opacity-45';

export const TOOLBAR_MENU_SUB_TRIGGER_CLASS =
  'justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[13px] text-secondary-token hover:bg-surface-1 hover:text-primary-token focus:bg-surface-1 focus:text-primary-token data-[state=open]:bg-surface-1 data-[state=open]:text-primary-token';

export const TOOLBAR_MENU_LEADING_VISUAL_CLASS =
  'flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token';

export const TOOLBAR_MENU_TRAILING_VISUAL_CLASS =
  'inline-flex min-w-4 shrink-0 items-center justify-end text-tertiary-token';

export function ToolbarMenuRow({
  leadingVisual,
  label,
  trailingVisual,
}: Readonly<{
  leadingVisual?: ReactNode;
  label: ReactNode;
  trailingVisual?: ReactNode;
}>) {
  return (
    <>
      <span className={TOOLBAR_MENU_LEADING_VISUAL_CLASS}>
        {leadingVisual ?? null}
      </span>
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
      <span className={TOOLBAR_MENU_TRAILING_VISUAL_CLASS}>
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
}: Readonly<{
  active: boolean;
  leadingVisual?: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}>) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={disabled}
      className={TOOLBAR_MENU_ITEM_CLASS}
    >
      <ToolbarMenuRow
        leadingVisual={leadingVisual}
        label={label}
        trailingVisual={active ? <Check className='h-4 w-4' /> : null}
      />
    </DropdownMenuItem>
  );
}
