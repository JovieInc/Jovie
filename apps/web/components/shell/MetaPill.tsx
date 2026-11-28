import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MetaPillTone = 'neutral' | 'amber' | 'cyan';

export interface MetaPillProps {
  readonly children: ReactNode;
  readonly tone?: MetaPillTone;
  readonly className?: string;
}

/**
 * MetaPill — flat-at-rest pill used for task / row metadata. The
 * surface stays clean by default; hovering surfaces a border + subtle
 * background. Tone modifiers tint the text only — the rest pose stays
 * uniform across pill rows so they read as a calm row of meta.
 *
 * @example
 * ```tsx
 * <MetaPill>3 subtasks</MetaPill>
 * <MetaPill tone='amber'>2 due soon</MetaPill>
 * <MetaPill tone='cyan'>Auto-pitching</MetaPill>
 * ```
 */
export function MetaPill({
  children,
  tone = 'neutral',
  className,
}: MetaPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-5 px-2 rounded text-2xs border whitespace-nowrap',
        'border-transparent bg-transparent transition-[background-color,border-color] duration-subtle ease-subtle cursor-default',
        tone === 'amber'
          ? 'text-warning-text/85 hover:border-warning/30 hover:bg-warning/10'
          : tone === 'cyan'
            ? 'text-accent-text/85 hover:border-accent/30 hover:bg-accent/10'
            : 'text-secondary-token hover:border-(--app-shell-border) hover:bg-surface-1/40',
        className
      )}
    >
      {children}
    </span>
  );
}
