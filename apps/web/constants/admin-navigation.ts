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
  'recovery',
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
  | 'outbound'
  | 'product'
  | 'operations'
  | 'inbox'
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
  | 'capacity'
  | 'revenue_lift'
  | 'share_studio'
  | 'system_map'
  | 'features';

export type AdminNavigationSection = 'workspaces' | 'business' | 'utilities';

export interface AdminNavRegistryItem {
  readonly id: AdminWorkspaceId;
  readonly label: string;
  readonly href: string;
  readonly description: string;
  readonly section: AdminNavigationSection;
}

/**
 * Five daily destinations (Tim's jobs: what matters, what is blocked on me,
 * what is shipping, is the fleet healthy, what does capacity cost). Company
 * and Tools hold everything else. See fleet/ovie-ia.md.
 */
export const ADMIN_PRIMARY_WORKSPACE_IDS = [
  'overview',
  'inbox',
  'shipping',
  'operations',
  'costs',
] as const satisfies readonly AdminWorkspaceId[];

/** Company-facing workspaces: growth, customers, money in, investors. */
export const ADMIN_BUSINESS_IDS = [
  'growth',
  'people',
  'outbound',
  'interviews',
  'investors',
  'revenue_lift',
] as const satisfies readonly AdminWorkspaceId[];

export const ADMIN_SETTINGS_TOOL_IDS = [
  'ops',
  'certifications',
  'platform_connections',
  'playlists',
  'presence',
  'share_studio',
  'capacity',
] as const satisfies readonly AdminWorkspaceId[];

const ADMIN_NAV_ITEMS: readonly Omit<AdminNavRegistryItem, 'section'>[] = [
  {
    id: 'overview',
    label: 'Home',
    href: APP_ROUTES.ADMIN_NOW,
    description: 'What matters now, shipping, and the composer',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    href: APP_ROUTES.ADMIN_INBOX,
    description: 'Decision requests that need your attention',
  },
  {
    id: 'growth',
    label: 'Growth',
    href: APP_ROUTES.ADMIN_GROWTH,
    description: 'Visited through expanded, with people behind every stage',
  },
  {
    id: 'product',
    label: 'Product',
    href: APP_ROUTES.ADMIN_PRODUCT,
    description: 'Certified, deployed, exposed, and observed customer reality',
  },
  {
    id: 'operations',
    label: 'Fleet',
    href: APP_ROUTES.ADMIN_OPERATIONS,
    description: 'Agents, lanes, health, exceptions, and queues',
  },
  {
    id: 'ops',
    label: 'Ops',
    href: APP_ROUTES.ADMIN_OPS,
    description: 'Full operations dashboard: cash, funnel, health, deployments',
  },
  {
    id: 'certifications',
    label: 'Certifications',
    href: APP_ROUTES.ADMIN_CERTIFICATIONS,
    description:
      'Founder review of certification evidence, with certify and reject',
  },
  {
    id: 'outbound',
    label: 'Outbound',
    href: APP_ROUTES.ADMIN_OUTBOUND,
    description:
      'Certify potential outbound artists and approve every target and message',
  },
  {
    id: 'shipping',
    label: 'Shipping',
    href: APP_ROUTES.ADMIN_SHIPPING,
    description:
      'Read-only shipping pipeline, merge velocity, deployment, and runtime receipts',
  },
  {
    id: 'people',
    label: 'People',
    href: APP_ROUTES.ADMIN_PEOPLE,
    description:
      'User table, roles, waitlist, creators, and individual actions',
  },
  {
    id: 'interviews',
    label: 'Interviews',
    href: APP_ROUTES.ADMIN_INTERVIEWS,
    description: 'Review post-onboarding interview transcripts and summaries',
  },
  {
    id: 'platform_connections',
    label: 'Platform Connections',
    href: APP_ROUTES.ADMIN_PLATFORM_CONNECTIONS,
    description: 'Spotify publisher and playlist generation controls',
  },
  {
    id: 'playlists',
    label: 'Playlists',
    href: APP_ROUTES.ADMIN_PLAYLISTS,
    description: 'Review and publish generated playlists',
  },
  {
    id: 'presence',
    label: 'Presence',
    href: APP_ROUTES.ADMIN_PRESENCE,
    description: 'Inspect indexing, SEO, copy, and Lighthouse health',
  },
  {
    id: 'activity',
    label: 'Timeline',
    href: APP_ROUTES.ADMIN_ACTIVITY,
    description: 'Semantic company changes, evidence, and measured outcomes',
  },
  {
    id: 'investors',
    label: 'Investors',
    href: APP_ROUTES.ADMIN_INVESTORS,
    description: 'Fundraising links and investor pipeline utility',
  },
  {
    id: 'costs',
    label: 'Capacity',
    href: APP_ROUTES.ADMIN_COSTS,
    description: 'Provider capacity and vendor spend (30-day view)',
  },
  {
    id: 'capacity',
    label: 'Agent Plans',
    href: APP_ROUTES.ADMIN_CAPACITY,
    description:
      'Agent plans, cost, remaining quota and credits, and pace per provider',
  },
  {
    id: 'revenue_lift',
    label: 'Revenue Lift',
    href: APP_ROUTES.ADMIN_REVENUE_LIFT,
    description:
      'IRPAA North Star, KPI tree, cohort lift, multi-agent contribution',
  },
  {
    id: 'share_studio',
    label: 'Share Studio',
    href: APP_ROUTES.ADMIN_SHARE_STUDIO,
    description: 'Preview story assets, payloads, and tracked share outputs',
  },
];

function sectionFor(id: AdminWorkspaceId): AdminNavigationSection {
  if ((ADMIN_PRIMARY_WORKSPACE_IDS as readonly AdminWorkspaceId[]).includes(id))
    return 'workspaces';
  if ((ADMIN_BUSINESS_IDS as readonly AdminWorkspaceId[]).includes(id))
    return 'business';
  return 'utilities';
}

const SECTION_ORDER: readonly AdminNavigationSection[] = [
  'workspaces',
  'business',
  'utilities',
];

function orderedIds(): readonly AdminWorkspaceId[] {
  return [
    ...ADMIN_PRIMARY_WORKSPACE_IDS,
    ...ADMIN_BUSINESS_IDS,
    ...ADMIN_SETTINGS_TOOL_IDS,
  ];
}

/** Registry order is the sidebar order: primary, Company, Tools. */
export const ADMIN_NAV_REGISTRY: readonly AdminNavRegistryItem[] = orderedIds()
  .map(id => {
    const item = ADMIN_NAV_ITEMS.find(entry => entry.id === id);
    if (!item) throw new Error(`Missing admin nav item: ${id}`);
    return { ...item, section: sectionFor(id) };
  })
  .sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
  );

export interface AdminWorkspaceTab {
  readonly label: string;
  readonly href: string;
}

/**
 * Views behind one sidebar row. Product and Timeline are Shipping views, and
 * Agents (the skill and system map) is a Fleet view; they keep their routes so
 * deep links and drilldowns stay valid, but have no sidebar row of their own.
 */
export const ADMIN_WORKSPACE_TABS = {
  shipping: [
    { label: 'Pipeline', href: APP_ROUTES.ADMIN_SHIPPING },
    { label: 'Product', href: APP_ROUTES.ADMIN_PRODUCT },
    { label: 'Timeline', href: APP_ROUTES.ADMIN_ACTIVITY },
  ],
  operations: [
    { label: 'Health', href: APP_ROUTES.ADMIN_OPERATIONS },
    { label: 'Agents', href: APP_ROUTES.ADMIN_SYSTEM },
  ],
} as const satisfies Record<string, readonly AdminWorkspaceTab[]>;

export type AdminViewGroupId = keyof typeof ADMIN_WORKSPACE_TABS;

/**
 * Accessible names for each view group's sub-navigation. `AdminPage views=`
 * renders the group through the canonical RouteSegmentControl; see
 * docs/design-system/ovie-ia.md.
 */
export const ADMIN_VIEW_GROUPS = {
  shipping: { label: 'Shipping Views', views: ADMIN_WORKSPACE_TABS.shipping },
  operations: { label: 'Fleet Views', views: ADMIN_WORKSPACE_TABS.operations },
} as const satisfies Record<
  AdminViewGroupId,
  { readonly label: string; readonly views: readonly AdminWorkspaceTab[] }
>;

/** The view whose route owns `pathname`; the group's first view otherwise. */
export function activeAdminView(
  group: AdminViewGroupId,
  pathname: string
): string {
  const views: readonly AdminWorkspaceTab[] = ADMIN_WORKSPACE_TABS[group];
  const match = views.find(
    view => pathname === view.href || pathname.startsWith(`${view.href}/`)
  );
  return (match ?? views[0]).href;
}

export const ADMIN_PEOPLE_VIEW_LABELS: Record<AdminPeopleView, string> = {
  contacts: 'Customers',
  waitlist: 'Waitlist',
  creators: 'Creators',
  users: 'Users',
  releases: 'Releases',
  assets: 'Assets',
  feedback: 'Feedback',
  recovery: 'Recovery',
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
    href: APP_ROUTES.ADMIN_OPS,
  },
  // Legacy Needs You links open the canonical Inbox.
  [APP_ROUTES.ADMIN_NEEDS_YOU]: {
    workspace: 'inbox',
    href: APP_ROUTES.ADMIN_INBOX,
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
