import { cn } from '@/lib/utils';

export interface TypeBadgeProps {
  /** Short label — typically a release type ("single", "ep", "album", …). */
  readonly label: string;
  readonly className?: string;
}

/**
 * TypeBadge — neutral 16px-tall pill for entity-type labels (release type,
 * track type, contact role). Renders the label uppercased with caption
 * tracking. The chip is decoration only; wrap it in a button or link if
 * the type is interactive.
 *
 * @example
 * ```tsx
 * <TypeBadge label={release.releaseType} />
 * ```
 */
export function TypeBadge({ label, className }: TypeBadgeProps) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center h-[16px] px-1.5 rounded text-[9.5px] font-medium uppercase tracking-[0.06em] border border-(--linear-app-shell-border) text-tertiary-token bg-surface-1/40',
        className
      )}
    >
      {label}
    </span>
  );
}
