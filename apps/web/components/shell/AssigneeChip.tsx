import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { cn } from '@/lib/utils';

export type AssigneeKind = 'jovie' | 'human';

export interface AssigneeChipProps {
  readonly kind: AssigneeKind;
  /**
   * For humans: the display name. For jovie: ignored when collapsed,
   * defaults to "Jovie" when expanded.
   */
  readonly name?: string;
  /**
   * For humans: optional avatar slot. Not used for the jovie assignee
   * (which renders the BrandLogo).
   */
  readonly avatar?: ReactNode;
  /**
   * Compact (collapsed) vs expanded layout. Compact is for table /
   * row contexts; expanded for detail panels.
   */
  readonly expanded?: boolean;
  readonly className?: string;
}

/**
 * AssigneeChip — task assignee indicator. Renders the Jovie brand
 * mark (BrandLogo) for the AI assignee, or a name + avatar for human
 * assignees. Compact in row contexts (icon only at small size); the
 * full name appears in `expanded` mode for detail panels.
 *
 * @example
 * ```tsx
 * <AssigneeChip kind='jovie' />
 * <AssigneeChip kind='human' name='Tim' avatar={<Avatar src={...} />} />
 * <AssigneeChip kind='jovie' expanded />
 * ```
 */
export function AssigneeChip({
  kind,
  name,
  avatar,
  expanded,
  className,
}: AssigneeChipProps) {
  if (kind === 'jovie') {
    const label = name ?? 'Jovie';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 shrink-0',
          expanded
            ? 'text-[12.5px] text-secondary-token'
            : 'text-[10.5px] text-tertiary-token',
          className
        )}
        title={`Assigned to ${label}`}
      >
        <BrandLogo
          size={expanded ? 14 : 12}
          tone='auto'
          rounded={false}
          className='text-cyan-400'
          aria-hidden
        />
        {expanded && label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 shrink-0',
        expanded
          ? 'text-[12.5px] text-secondary-token'
          : 'text-[10.5px] text-tertiary-token',
        className
      )}
      title={name ? `Assigned to ${name}` : 'Assigned'}
    >
      {avatar}
      {expanded && name}
    </span>
  );
}
