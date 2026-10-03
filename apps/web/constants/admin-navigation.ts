import { APP_ROUTES } from '@/constants/routes';

type SearchParamRecord = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

export const adminPeopleViews = [
  'contacts',
  'waitlist',
  'creators',
  'users',
  'releases',
  'assets',
  'feedback',
] as const;

export type AdminPeopleView = (typeof adminPeopleViews)[number];

export const adminGrowthViews = [
  'leads',
  'outreach',
  'campaigns',
  'ingest',
] as const;

export type AdminGrowthView = (typeof adminGrowthViews)[number];

export const adminOutreachQueues = ['all', 'email', 'dm', 'review'] as const;

export type AdminOutreachQueue = (typeof adminOutreachQueues)[number];

export type AdminWorkspaceId =
  | 'overview'
  | 'chat'
  | 'certifications'
  | 'product'
  | 'operations'
  | 'needs_you'
  | 'ops'
  | 'shipping'
  | 'people'
  | 'interviews'
  | 'growth'
  | 'platform_connections'
  | 'playlists'
  | 'presence'
  | 'activity'
  | 'investors'
  | 'feature_registry'
  | 'screenshots'
  | 'costs'
  | 'revenue_lift'
  | 'share_studio'
  | 'system_map'
  | 'features';

export type AdminNavigationSection = 'workspaces' | 'utilities';

export interface AdminNavRegistryItem {
  readonly id: AdminWorkspaceId;
  readonly label: string;
  readonly href: string;
  readonly description: string;
  readonly section: AdminNavigationSection;
}

export const ADMIN_PRIMARY_WORKSPACE_IDS = [
  'overview',
  'growth',
  'product',
  'operations',
  'needs_you',
] as const satisfies readonly AdminWorkspaceId[];

export const ADMIN_SETTINGS_TOOL_IDS = [
  'chat',
  'certifications',
  'shipping',
  'people',
  'interviews',
  'platform_connections',
  'playlists',
  'presence',
  'activity',
  'investors',
  'feature_registry',
  'share_studio',
  'costs',
  'revenue_lift',
  'features',
] as const satisfies readonly AdminWorkspaceId[];

export const ADMIN_NAV_REGISTRY: readonly AdminNavRegistryItem[] = [
  {
    id: 'overview',
    label: 'Now',
    href: APP_ROUTES.ADMIN_NOW,
    description: 'Company pulse, ranked signals, health, and freshness',
    section: 'workspaces',
  },
  {
    id: 'growth',
    label: 'Growth',
    href: APP_ROUTES.ADMIN_GROWTH,
    description: 'Visited through expanded, with people behind every stage',
    section: 'workspaces',
  },
  {
    id: 'product',
    label: 'Product',
    href: APP_ROUTES.ADMIN_PRODUCT,
    description: 'Certified, deployed, exposed, and observed customer reality',
    section: 'workspaces',
  },
  {
    id: 'operations',
    label: 'Operations',
    href: APP_ROUTES.ADMIN_OPERATIONS,
    description: 'Autonomous execution outcomes, exceptions, costs, and queues',
    section: 'workspaces',
  },
  {
    id: 'needs_you',
    label: 'Needs You',
    href: APP_ROUTES.ADMIN_NEEDS_YOU,
    description: 'Founder judgments that automation cannot safely make',
    section: 'workspaces',
  },
  {
    id: 'chat',
    label: 'Chat',
    href: APP_ROUTES.ADMIN_CHAT,
    description: 'Operator chat surface on the signed-in artist profile',
    section: 'utilities',
  },
  {
    id: 'certifications',
    label: 'Certifications',
    href: APP_ROUTES.ADMIN_CERTIFICATIONS,
    description:
      'Founder review of certification evidence, with certify and reject',
    section: 'utilities',
  },
  {
    id: 'shipping',
    label: 'Shipping',
    href: APP_ROUTES.ADMIN_SHIPPING,
    description:
      'Read-only shipping pipeline, merge velocity, deployment, and runtime receipts',
    section: 'utilities',
  },
  {
    id: 'people',
    label: 'People',
    href: APP_ROUTES.ADMIN_PEOPLE,
    description:
      'User table, roles, waitlist, creators, and individual actions',
    section: 'utilities',
  },
  {
    id: 'interviews',
    label: 'Interviews',
    href: APP_ROUTES.ADMIN_INTERVIEWS,
    description: 'Review post-onboarding interview transcripts and summaries',
    section: 'utilities',
  },
  {
    id: 'platform_connections',
    label: 'Platform Connections',
    href: APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS,
    description: 'Spotify publisher and playlist generation controls',
    section: 'utilities',
  },
  {
    id: 'playlists',
    label: 'Playlists',
    href: APP_ROUTES.ADMIN_PLAYLISTS,
    description: 'Review and publish generated playlists',
    section: 'utilities',
  },
  {
    id: 'presence',
    label: 'Presence',
    href: APP_ROUTES.ADMIN_PRESENCE,
    description: 'Inspect indexing, SEO, copy, and Lighthouse health',
    section: 'utilities',
  },
  {
    id: 'activity',
    label: 'Timeline',
    href: APP_ROUTES.ADMIN_ACTIVITY,
    description: 'Semantic company changes, evidence, and measured outcomes',
    section: 'utilities',
  },
  {
    id: 'investors',
    label: 'Investors',
    href: APP_ROUTES.ADMIN_INVESTORS,
    description: 'Fundraising links and investor pipeline utility',
    section: 'utilities',
  },
  {
    id: 'feature_registry',
    label: 'Feature Registry',
    href: APP_ROUTES.ADMIN_FEATURE_REGISTRY,
    description: 'Founder review packets for canonical product capabilities',
    section: 'utilities',
  },
  {
    id: 'costs',
    label: 'Costs',
    href: APP_ROUTES.ADMIN_COSTS,
    description:
      'Company infra, AI gateway, Neon, and vendor spend (30-day view)',
    section: 'utilities',
  },
  {
    id: 'revenue_lift',
    label: 'Revenue Lift',
    href: APP_ROUTES.ADMIN_REVENUE_LIFT,
    description:
      'IRPAA North Star, KPI tree, cohort lift, multi-agent contribution',
    section: 'utilities',
  },
  {
    id: 'share_studio',
    label: 'Share Studio',
    href: APP_ROUTES.ADMIN_SHARE_STUDIO,
    description: 'Preview story assets, payloads, and tracked share outputs',
    section: 'utilities',
  },
  {
    id: 'features',
    label: 'Features',
    href: APP_ROUTES.ADMIN_FEATURES,
    description: 'Runtime feature flags with per-environment toggles',
    section: 'utilities',
  },
] as const;

export const ADMIN_PEOPLE_VIEW_LABELS: Record<AdminPeopleView, string> = {
  contacts: 'Customers',
  waitlist: 'Waitlist',
  creators: 'Creators',
  users: 'Users',
  releases: 'Releases',
  assets: 'Assets',
  feedback: 'Feedback',
};

export const ADMIN_GROWTH_VIEW_LABELS: Record<AdminGrowthView, string> = {
  leads: 'Leads',
  outreach: 'Outreach',
  campaigns: 'Campaigns',
  ingest: 'Ingest',
};

export const ADMIN_OUTREACH_QUEUE_LABELS: Record<AdminOutreachQueue, string> = {
  all: 'All queues',
  email: 'Email queue',
  dm: 'DM queue',
  review: 'Manual review',
};

export function isAdminPeopleView(
  value: string | null | undefined
): value is AdminPeopleView {
  return adminPeopleViews.includes(value as AdminPeopleView);
}

export function isAdminGrowthView(
  value: string | null | undefined
): value is AdminGrowthView {
  return adminGrowthViews.includes(value as AdminGrowthView);
}

export function isAdminOutreachQueue(
  value: string | null | undefined
): value is AdminOutreachQueue {
  return adminOutreachQueues.includes(value as AdminOutreachQueue);
}

export function getAdminPeopleViewLabel(view: AdminPeopleView): string {
  return ADMIN_PEOPLE_VIEW_LABELS[view];
}

export function getAdminGrowthViewLabel(view: AdminGrowthView): string {
  return ADMIN_GROWTH_VIEW_LABELS[view];
}

export function getAdminOutreachQueueLabel(queue: AdminOutreachQueue): string {
  return ADMIN_OUTREACH_QUEUE_LABELS[queue];
}

export function buildAdminPeopleHref(
  view: AdminPeopleView,
  searchParams?: URLSearchParams
): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('view', view);
  const query = nextParams.toString();
  return query
    ? `${APP_ROUTES.ADMIN_PEOPLE}?${query}`
    : APP_ROUTES.ADMIN_PEOPLE;
}

export function buildAdminGrowthHref(
  view: AdminGrowthView,
  searchParams?: URLSearchParams
): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('view', view);

  if (view !== 'outreach') {
    nextParams.delete('queue');
  }

  const query = nextParams.toString();
  return query
    ? `${APP_ROUTES.ADMIN_GROWTH}?${query}`
    : APP_ROUTES.ADMIN_GROWTH;
}

export const ADMIN_LEGACY_REDIRECT_MAP = {
  [APP_ROUTES.ADMIN_WAITLIST]: {
    workspace: 'people',
    view: 'waitlist',
    href: buildAdminPeopleHref('waitlist'),
  },
  [APP_ROUTES.ADMIN_CREATORS]: {
    workspace: 'people',
    view: 'creators',
    href: buildAdminPeopleHref('creators'),
  },
  [APP_ROUTES.ADMIN_USERS]: {
    workspace: 'people',
    view: 'users',
    href: buildAdminPeopleHref('users'),
  },
  [APP_ROUTES.ADMIN_RELEASES]: {
    workspace: 'people',
    view: 'releases',
    href: buildAdminPeopleHref('releases'),
  },
  [APP_ROUTES.ADMIN_FEEDBACK]: {
    workspace: 'people',
    view: 'feedback',
    href: buildAdminPeopleHref('feedback'),
  },
  [APP_ROUTES.ADMIN_LEADS]: {
    workspace: 'growth',
    view: 'leads',
    href: buildAdminGrowthHref('leads'),
  },
  [APP_ROUTES.ADMIN_OUTREACH]: {
    workspace: 'growth',
    view: 'outreach',
    href: buildAdminGrowthHref('outreach'),
  },
  [APP_ROUTES.ADMIN_OUTREACH_EMAIL]: {
    workspace: 'growth',
    view: 'outreach',
    queue: 'email',
    href: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'email' })
    ),
  },
  [APP_ROUTES.ADMIN_OUTREACH_DM]: {
    workspace: 'growth',
    view: 'outreach',
    queue: 'dm',
    href: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'dm' })
    ),
  },
  [APP_ROUTES.ADMIN_OUTREACH_REVIEW]: {
    workspace: 'growth',
    view: 'outreach',
    queue: 'review',
    href: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'review' })
    ),
  },
  [APP_ROUTES.ADMIN_CAMPAIGNS]: {
    workspace: 'growth',
    view: 'campaigns',
    href: buildAdminGrowthHref('campaigns'),
  },
  [APP_ROUTES.ADMIN_INGEST]: {
    workspace: 'growth',
    view: 'ingest',
    href: buildAdminGrowthHref('ingest'),
  },
  [APP_ROUTES.ADMIN_GROWTH_YC_METRICS]: {
    workspace: 'ops',
    href: APP_ROUTES.HUD,
  },
} as const;

export function searchParamsFromRecord(
  record: SearchParamRecord | undefined
): URLSearchParams {
  const params = new URLSearchParams();

  if (!record) {
    return params;
  }

  for (const [key, value] of Object.entries(record)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      const firstValue = value.find(item => item.length > 0);
      if (firstValue) {
        params.set(key, firstValue);
      }
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}
