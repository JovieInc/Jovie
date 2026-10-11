import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { IconName } from '@/components/atoms/Icon';
import type { AppFlagName } from '@/lib/flags/contracts';

/**
 * Core destinations are founder-approved and always take primary-rail slots
 * first. Experimental destinations may fill remaining capacity and overflow
 * into the single shared More menu (JOV-4515).
 */
export type CustomerNavTier = 'core' | 'experimental';

export interface NavItem {
  name: string;
  href: string;
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Shared Icon registry key for authenticated shell rendering. */
  iconName?: IconName;
  /** Applies a shared sidebar hierarchy treatment without bespoke row chrome. */
  tone?: 'default' | 'secondary' | 'primary';
  /**
   * Capacity tier. Defaults to `core` when omitted so existing entries stay
   * on the approved rail until explicitly marked experimental.
   */
  tier?: CustomerNavTier;
  description?: string;
  badge?: ReactNode;
  children?: NavItem[];
  /**
   * Hide this destination unless the flag is on. Fail closed: a missing
   * snapshot value does not render the row.
   */
  requiredFlag?: AppFlagName;
}

export interface DashboardNavProps {
  /** The brand-row bell owns Inbox discovery in the main customer shell. */
  readonly headerOwnsInbox?: boolean;
  readonly collapsed?: boolean;
  /** Shell-owned surface placed after the New Chat primary action. */
  readonly children?: ReactNode;
}
