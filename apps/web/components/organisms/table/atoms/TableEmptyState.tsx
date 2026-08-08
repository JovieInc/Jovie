'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import {
  EmptyState,
  type EmptyStateProps,
} from '@/components/molecules/EmptyState';
import { cn } from '@/lib/utils';

/**
 * Stable min-height (px) reserved for table empty states so loading → empty →
 * populated transitions do not shift layout (JOV-4869). Matches `min-h-55`.
 */
export const TABLE_EMPTY_STATE_MIN_HEIGHT_PX = 220;

type TableEmptyStateActionProps =
  | {
      readonly action?: NonNullable<EmptyStateProps['action']>;
      readonly actionSlot?: never;
    }
  | {
      readonly action?: never;
      /**
       * A domain-owned CTA that cannot be represented by the structured action
       * contract. Escape hatch only — prefer `action`.
       */
      readonly actionSlot?: React.ReactNode;
    };

export type TableEmptyStateProps = TableEmptyStateActionProps & {
  /** Main heading text */
  readonly heading: string;
  /** Optional description text */
  readonly description?: string;
  /** Optional icon to display */
  readonly icon?: React.ReactNode;
  /** Optional structured secondary action (rendered as a link-style Button) */
  readonly secondaryAction?: NonNullable<EmptyStateProps['secondaryAction']>;
  /** Additional CSS classes */
  readonly className?: string;
  readonly testId?: string;
};

/**
 * Table-placement adapter for the canonical EmptyState molecule (JOV-4869).
 * All actions flow through EmptyState's structured action contract;
 * `actionSlot` is only for CTAs that cannot be represented structurally.
 * The default `min-h-55` keeps loading → empty → populated transitions stable.
 */
export function TableEmptyState({
  heading,
  description,
  icon,
  action,
  actionSlot,
  secondaryAction,
  className,
  testId,
}: TableEmptyStateProps) {
  // Preserve the canonical XOR: pass either a structured action or the slot.
  const actionProps = action ? { action } : { actionSlot };

  return (
    <DrawerSurfaceCard
      variant='card'
      className={cn(
        'flex min-h-55 flex-1 flex-col items-center justify-center rounded-lg bg-surface-0 px-4 py-6 text-center',
        className
      )}
    >
      <EmptyState
        icon={icon}
        heading={heading}
        description={description}
        secondaryAction={secondaryAction}
        testId={testId}
        className='py-4'
        {...actionProps}
      />
    </DrawerSurfaceCard>
  );
}
