import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SettingsRowTone = 'default' | 'danger';

export interface SettingsRowProps {
  /** Primary row label. */
  readonly label: string;
  /** Optional helper copy below the label. */
  readonly description?: string;
  /** Right-aligned slot for the row's affordance (toggle, button, value, etc.). */
  readonly control: ReactNode;
  /**
   * Row tone. `'danger'` warms the label to rose so destructive actions
   * (e.g. "Delete account", "Sign out everywhere") read with the right
   * weight. Defaults to `'default'`.
   */
  readonly tone?: SettingsRowTone;
  /**
   * When true, draws a hairline divider above the row. Use on every row
   * after the first inside a multi-row settings card so the rows stack
   * with shared chrome instead of carrying their own.
   */
  readonly divider?: boolean;
  readonly className?: string;
}

/**
 * SettingsRow — single row inside a settings-section card. Stack many of
 * these inside one card surface so the section reads as one cohesive
 * unit rather than many individually-carded rows.
 *
 * The `control` slot is rendered as-is; callers compose their own
 * controls (toggles, segmented controls, input values, edit buttons).
 *
 * @example
 * ```tsx
 * <div className='rounded-xl border bg-(--surface-0)/40'>
 *   <SettingsRow
 *     label='Email'
 *     description='For sign-in and account notifications'
 *     control={<span className='text-tertiary-token'>tim@timwhite.co</span>}
 *   />
 *   <SettingsRow
 *     divider
 *     label='Two-factor authentication'
 *     control={<Toggle on={twoFactor} onClick={toggle} />}
 *   />
 *   <SettingsRow
 *     divider
 *     tone='danger'
 *     label='Delete account'
 *     description='This cannot be undone.'
 *     control={<Button variant='destructive'>Delete</Button>}
 *   />
 * </div>
 * ```
 */
export function SettingsRow({
  label,
  description,
  control,
  tone = 'default',
  divider,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3.5',
        divider && 'border-t border-(--linear-app-shell-border)/50',
        className
      )}
    >
      <div className='flex-1 min-w-0'>
        <p
          className={cn(
            'text-[13px] font-medium',
            tone === 'danger' ? 'text-rose-300/90' : 'text-primary-token'
          )}
        >
          {label}
        </p>
        {description && (
          <p className='text-[11.5px] text-tertiary-token mt-0.5'>
            {description}
          </p>
        )}
      </div>
      <div className='shrink-0'>{control}</div>
    </div>
  );
}
