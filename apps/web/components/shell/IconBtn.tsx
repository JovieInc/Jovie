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
}: IconBtnProps) {
  const isGhost = tone === 'ghost';
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type='button'
        onClick={onClick}
        className={cn(
          'h-7 w-7 rounded-md grid place-items-center transition-colors duration-150 ease-out',
          isGhost
            ? active
              ? 'text-primary-token'
              : 'text-quaternary-token hover:text-primary-token'
            : active
              ? 'text-primary-token bg-surface-1/60'
              : 'text-quaternary-token hover:text-primary-token hover:bg-surface-1/60',
          className
        )}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}
