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
      <button
        type='button'
        onClick={onClick}
        data-testid={testId}
        className={cn(
          // Square at rest (no border); full circle + soft fill on hover only (JOV-3511).
          'h-7 w-7 grid place-items-center rounded-md border border-transparent transition-[background-color,color,border-color,border-radius] duration-subtle ease-subtle focus-ring-themed hover:rounded-full hover:border-subtle',
          isGhost
            ? active
              ? 'rounded-full border-subtle text-primary-token bg-surface-1/40'
              : 'text-quaternary-token hover:bg-surface-1/50 hover:text-primary-token'
            : active
              ? 'rounded-full border-subtle text-primary-token bg-surface-1/60'
              : 'text-quaternary-token hover:bg-surface-1/60 hover:text-primary-token',
          className
        )}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}
