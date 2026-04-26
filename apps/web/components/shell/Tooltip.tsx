import { cn } from '@/lib/utils';

// Tooltip — small, dark, glassy popover with the action label + an
// optional kbd chip on the right. Pass a `shortcut` object to surface the
// key combo. CSS-only (no portal); uses group/tip + delay for a Linear-
// feeling late reveal that snaps in over 150ms once it commits.
export interface ShortcutHint {
  readonly keys: string;
  readonly description: string;
}

export interface TooltipProps {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly shortcut?: ShortcutHint;
  readonly side?: 'top' | 'bottom' | 'right' | 'left';
  readonly className?: string;
  // `block` for full-width triggers (sidebar nav rows). Default is
  // inline-flex which sizes to children — right for icon buttons.
  readonly block?: boolean;
}

export function Tooltip({
  children,
  label,
  shortcut,
  side = 'bottom',
  className,
  block,
}: TooltipProps) {
  const sideClasses =
    side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-1.5 translate-y-0.5 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
      : side === 'top'
        ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5 -translate-y-0.5 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
        : side === 'right'
          ? 'left-full top-1/2 -translate-y-1/2 ml-1.5 -translate-x-0.5 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0'
          : 'right-full top-1/2 -translate-y-1/2 mr-1.5 translate-x-0.5 group-hover/tip:translate-x-0 group-focus-within/tip:translate-x-0';

  return (
    <span
      className={cn(
        'relative group/tip isolate',
        block ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {children}
      <span
        role='tooltip'
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap',
          'opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          'transition-[opacity,transform] duration-150 ease-out delay-[400ms] group-hover/tip:delay-[400ms] group-focus-within/tip:delay-[80ms]',
          sideClasses
        )}
      >
        <span className='inline-flex items-center gap-2 h-6 px-2 rounded-md text-[11px] font-caption text-primary-token bg-(--linear-app-content-surface)/95 border border-(--linear-app-shell-border) backdrop-blur-xl shadow-[0_6px_20px_rgba(0,0,0,0.28)]'>
          <span className='leading-none'>{label}</span>
          {shortcut && (
            <kbd className='inline-flex items-center h-4 min-w-4 px-1 rounded-[3px] text-[9.5px] font-caption uppercase tracking-[0.04em] text-tertiary-token bg-surface-0/80 border border-(--linear-app-shell-border) leading-none'>
              {shortcut.keys}
            </kbd>
          )}
        </span>
      </span>
    </span>
  );
}
