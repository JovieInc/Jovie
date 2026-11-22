import { PlainButton } from '@jovie/ui';
import type { ShortcutHint } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

// IconBtn — h-7 w-7 grid place-items-center icon button with optional
// Tooltip. Two tones:
//   'default' — subtle bg on hover/active (sidebar, header, drawer)
//   'ghost'   — no bg; icon brightens to white on hover / when active
//               (audio bar dock row)
export interface IconBtnProps {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly onClick?: () => void;
  readonly onPointerEnter?: () => void;
  readonly onFocus?: () => void;
  readonly active?: boolean;
  readonly shortcut?: ShortcutHint;
  readonly tooltipSide?: 'top' | 'bottom' | 'right' | 'left';
  readonly tone?: 'default' | 'ghost';
  readonly className?: string;
  readonly testId?: string;
}

export function IconBtn({
  children,
  label,
  onClick,
  onPointerEnter,
  onFocus,
  active,
  shortcut,
  tooltipSide = 'bottom',
  tone = 'default',
  className,
  testId,
}: IconBtnProps) {
  const isGhost = tone === 'ghost';
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <PlainButton
        type='button'
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onFocus={onFocus}
        data-testid={testId}
        className={cn(
          // Circle at every state; fill and border appear on hover (icon-button rule).
          'h-7 w-7 grid place-items-center rounded-full border border-transparent transition-[background-color,color,border-color] duration-subtle ease-subtle focus-ring-themed hover:border-subtle',
          isGhost
            ? active
              ? 'border-subtle text-primary-token bg-surface-1/40'
              : 'text-quaternary-token hover:bg-surface-1/50 hover:text-primary-token'
            : active
              ? 'border-subtle text-primary-token bg-surface-1/60'
              : 'text-quaternary-token hover:bg-surface-1/60 hover:text-primary-token',
          className
        )}
        aria-label={label}
      >
        {children}
      </PlainButton>
    </Tooltip>
  );
}
