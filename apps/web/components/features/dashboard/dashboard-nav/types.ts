import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { IconName } from '@/components/atoms/Icon';

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
}

export interface DashboardNavProps {
  readonly collapsed?: boolean;
  /** Shell-owned surface placed after the secondary New Chat action. */
  readonly children?: ReactNode;
}
