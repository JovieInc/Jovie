import {
  Activity,
  Banknote,
  Briefcase,
  Cable,
  Flag,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  type LucideIcon,
  Map,
  Share2,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  ADMIN_NAV_REGISTRY,
  type AdminNavigationSection,
  type AdminWorkspaceId,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';

const OPERATOR_ICON_BY_ID = {
  overview: LayoutDashboard,
  ops: Gauge,
  people: Users,
  growth: FolderKanban,
  platform_connections: Cable,
  activity: Activity,
  investors: Briefcase,
  screenshots: ImageIcon,
  costs: Banknote,
  revenue_lift: TrendingUp,
  share_studio: Share2,
  system_map: Map,
  features: Flag,
} as const satisfies Record<AdminWorkspaceId, LucideIcon>;

export interface OperatorNavItem extends Omit<NavItem, 'badge'> {
  readonly label: string;
  readonly registryId: AdminWorkspaceId;
  readonly section: AdminNavigationSection;
}

/**
 * UI adapter for the canonical operator registry. Desktop and mobile renderers
 * consume this exact array so labels, destinations, order, and icons cannot
 * drift between viewports.
 */
export const OPERATOR_NAV_ITEMS: readonly OperatorNavItem[] =
  ADMIN_NAV_REGISTRY.map(item => ({
    id: `ov_${item.id}`,
    registryId: item.id,
    name: item.label,
    label: item.label,
    href: item.href,
    description: item.description,
    section: item.section,
    icon: OPERATOR_ICON_BY_ID[item.id],
  }));

export const OPERATOR_NAV_SECTIONS = [
  {
    label: 'Workspaces',
    items: OPERATOR_NAV_ITEMS.filter(item => item.section === 'workspaces'),
  },
  {
    label: 'Utilities',
    items: OPERATOR_NAV_ITEMS.filter(item => item.section === 'utilities'),
  },
] as const;

/**
 * The operator overview is the `/app/ov` index, so it must match exactly.
 * Every other operator destination owns its nested routes.
 */
export function isOperatorNavigationHrefActive(
  pathname: string,
  href: string
): boolean {
  if (href === APP_ROUTES.OV) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
