/**
 * Server-safe, closed-world registry for authenticated app screens.
 *
 * This module deliberately contains metadata only. Route implementations keep
 * their existing ownership while CI can reject unregistered screens and
 * recipes before they become new design references.
 */

export type AppScreenKind = 'canonical' | 'alias' | 'legacy' | 'operator';

export type AppScreenComponentId =
  | 'component.app-shell-frame'
  | 'component.page-shell'
  | 'component.settings-panel'
  | 'component.unified-table'
  | 'component.entity-sidebar'
  | 'component.empty-state'
  | 'component.error-fallback';

export type AppScreenRecipeId =
  | 'recipe.app-standard'
  | 'recipe.app-settings'
  | 'recipe.app-operator'
  | 'recipe.app-compatibility';

export interface AppScreenComponentRegistryEntry {
  readonly id: AppScreenComponentId;
  readonly source: string;
  readonly storySource: string;
  readonly storybookTitle: string;
}

export interface AppScreenRecipeRegistryEntry {
  readonly id: AppScreenRecipeId;
  readonly componentIds: readonly AppScreenComponentId[];
  readonly errorBoundarySource: string;
  readonly allowedKinds: readonly AppScreenKind[];
}

export interface AppScreenRegistryEntry {
  readonly id: `screen.${string}`;
  readonly route: `/app${string}`;
  readonly source: string;
  readonly kind: AppScreenKind;
  readonly conceptId: string;
  readonly recipeId: AppScreenRecipeId;
  readonly designReference: boolean;
}

export const APP_SCREEN_COMPONENT_REGISTRY = [
  {
    id: 'component.app-shell-frame',
    source: 'apps/web/components/organisms/AppShellFrame.tsx',
    storySource: 'apps/web/components/organisms/AppShellFrame.stories.tsx',
    storybookTitle: 'Organisms/AppShellFrame',
  },
  {
    id: 'component.page-shell',
    source: 'apps/web/components/organisms/PageShell.tsx',
    storySource: 'apps/web/components/organisms/PageShell.stories.tsx',
    storybookTitle: 'Organisms/PageShell',
  },
  {
    id: 'component.settings-panel',
    source: 'apps/web/components/molecules/settings/SettingsPanel.tsx',
    storySource:
      'apps/web/components/molecules/settings/SettingsPanel.stories.tsx',
    storybookTitle: 'Molecules/Settings/SettingsPanel',
  },
  {
    id: 'component.unified-table',
    source: 'apps/web/components/organisms/table/organisms/UnifiedTable.tsx',
    storySource:
      'apps/web/components/organisms/table/organisms/UnifiedTable.stories.tsx',
    storybookTitle: 'Organisms/Table/UnifiedTable',
  },
  {
    id: 'component.entity-sidebar',
    source: 'apps/web/components/molecules/drawer/EntitySidebarShell.tsx',
    storySource:
      'apps/web/components/molecules/drawer/EntitySidebarShell.stories.tsx',
    storybookTitle: 'Molecules/Drawer/EntitySidebarShell',
  },
  {
    id: 'component.empty-state',
    source: 'apps/web/components/organisms/EmptyState.tsx',
    storySource: 'apps/web/components/organisms/EmptyState.stories.tsx',
    storybookTitle: 'UI/EmptyState',
  },
  {
    id: 'component.error-fallback',
    source: 'apps/web/components/organisms/DashboardErrorFallback.tsx',
    storySource:
      'apps/web/components/organisms/DashboardErrorFallback.stories.tsx',
    storybookTitle: 'Organisms/DashboardErrorFallback',
  },
] as const satisfies readonly AppScreenComponentRegistryEntry[];

const ROOT_ERROR_BOUNDARY = 'apps/web/app/app/(shell)/error.tsx';

export const APP_SCREEN_RECIPE_REGISTRY = [
  {
    id: 'recipe.app-standard',
    componentIds: [
      'component.app-shell-frame',
      'component.page-shell',
      'component.empty-state',
      'component.entity-sidebar',
      'component.error-fallback',
    ],
    errorBoundarySource: ROOT_ERROR_BOUNDARY,
    allowedKinds: ['canonical'],
  },
  {
    id: 'recipe.app-settings',
    componentIds: [
      'component.app-shell-frame',
      'component.page-shell',
      'component.settings-panel',
      'component.error-fallback',
    ],
    errorBoundarySource: ROOT_ERROR_BOUNDARY,
    allowedKinds: ['canonical'],
  },
  {
    id: 'recipe.app-operator',
    componentIds: [
      'component.app-shell-frame',
      'component.page-shell',
      'component.unified-table',
      'component.empty-state',
      'component.error-fallback',
    ],
    errorBoundarySource: ROOT_ERROR_BOUNDARY,
    allowedKinds: ['operator'],
  },
  {
    id: 'recipe.app-compatibility',
    componentIds: ['component.app-shell-frame', 'component.error-fallback'],
    errorBoundarySource: ROOT_ERROR_BOUNDARY,
    allowedKinds: ['alias', 'legacy'],
  },
] as const satisfies readonly AppScreenRecipeRegistryEntry[];

/** Explicit closed-world inventory. The coverage test fails when this drifts. */
export const APP_SCREEN_SOURCES = [
  'apps/web/app/app/(shell)/admin/activity/page.tsx',
  'apps/web/app/app/(shell)/admin/agent-runs/[id]/page.tsx',
  'apps/web/app/app/(shell)/admin/algorithm-health/page.tsx',
  'apps/web/app/app/(shell)/admin/campaigns/page.tsx',
  'apps/web/app/app/(shell)/admin/chat/page.tsx',
  'apps/web/app/app/(shell)/admin/costs/page.tsx',
  'apps/web/app/app/(shell)/admin/creators/page.tsx',
  'apps/web/app/app/(shell)/admin/features/page.tsx',
  'apps/web/app/app/(shell)/admin/feedback/page.tsx',
  'apps/web/app/app/(shell)/admin/growth/page.tsx',
  'apps/web/app/app/(shell)/admin/growth/yc-metrics/page.tsx',
  'apps/web/app/app/(shell)/admin/ingest/page.tsx',
  'apps/web/app/app/(shell)/admin/interviews/page.tsx',
  'apps/web/app/app/(shell)/admin/investors/links/page.tsx',
  'apps/web/app/app/(shell)/admin/investors/page.tsx',
  'apps/web/app/app/(shell)/admin/investors/settings/page.tsx',
  'apps/web/app/app/(shell)/admin/leads/page.tsx',
  'apps/web/app/app/(shell)/admin/ops/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/dm/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/email/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/review/page.tsx',
  'apps/web/app/app/(shell)/admin/page.tsx',
  'apps/web/app/app/(shell)/admin/people/page.tsx',
  'apps/web/app/app/(shell)/admin/platform-connections/page.tsx',
  'apps/web/app/app/(shell)/admin/playlists/page.tsx',
  'apps/web/app/app/(shell)/admin/releases/page.tsx',
  'apps/web/app/app/(shell)/admin/revenue-lift/page.tsx',
  'apps/web/app/app/(shell)/admin/screenshots/page.tsx',
  'apps/web/app/app/(shell)/admin/share-studio/page.tsx',
  'apps/web/app/app/(shell)/admin/system/page.tsx',
  'apps/web/app/app/(shell)/admin/users/page.tsx',
  'apps/web/app/app/(shell)/admin/waitlist/page.tsx',
  'apps/web/app/app/(shell)/audience/page.tsx',
  'apps/web/app/app/(shell)/calendar/page.tsx',
  'apps/web/app/app/(shell)/chat/[id]/page.tsx',
  'apps/web/app/app/(shell)/chat/page.tsx',
  'apps/web/app/app/(shell)/chats/page.tsx',
  'apps/web/app/app/(shell)/contact/page.tsx',
  'apps/web/app/app/(shell)/contacts/page.tsx',
  'apps/web/app/app/(shell)/dashboard/audience/page.tsx',
  'apps/web/app/app/(shell)/dashboard/catalog-scan/page.tsx',
  'apps/web/app/app/(shell)/dashboard/chat/page.tsx',
  'apps/web/app/app/(shell)/dashboard/contacts/page.tsx',
  'apps/web/app/app/(shell)/dashboard/earnings/page.tsx',
  'apps/web/app/app/(shell)/dashboard/insights/page.tsx',
  'apps/web/app/app/(shell)/dashboard/library/page.tsx',
  'apps/web/app/app/(shell)/dashboard/links/page.tsx',
  'apps/web/app/app/(shell)/dashboard/page.tsx',
  'apps/web/app/app/(shell)/dashboard/presence/page.tsx',
  'apps/web/app/app/(shell)/dashboard/profile/page.tsx',
  'apps/web/app/app/(shell)/dashboard/release-plan/page.tsx',
  'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx',
  'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/tasks/page.tsx',
  'apps/web/app/app/(shell)/dashboard/releases/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tasks/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tipping/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tour-dates/page.tsx',
  'apps/web/app/app/(shell)/earnings/page.tsx',
  'apps/web/app/app/(shell)/feature-flags/page.tsx',
  'apps/web/app/app/(shell)/insights/page.tsx',
  'apps/web/app/app/(shell)/jovie-work/page.tsx',
  'apps/web/app/app/(shell)/library/page.tsx',
  'apps/web/app/app/(shell)/lyrics/[trackId]/page.tsx',
  'apps/web/app/app/(shell)/page.tsx',
  'apps/web/app/app/(shell)/presence/page.tsx',
  'apps/web/app/app/(shell)/profile/page.tsx',
  'apps/web/app/app/(shell)/profiles/page.tsx',
  'apps/web/app/app/(shell)/releases/[releaseId]/tasks/page.tsx',
  'apps/web/app/app/(shell)/releases/page.tsx',
  'apps/web/app/app/(shell)/settings/account/page.tsx',
  'apps/web/app/app/(shell)/settings/admin/page.tsx',
  'apps/web/app/app/(shell)/settings/analytics/page.tsx',
  'apps/web/app/app/(shell)/settings/appearance/page.tsx',
  'apps/web/app/app/(shell)/settings/artist-profile/page.tsx',
  'apps/web/app/app/(shell)/settings/audience/page.tsx',
  'apps/web/app/app/(shell)/settings/billing/page.tsx',
  'apps/web/app/app/(shell)/settings/connectors/page.tsx',
  'apps/web/app/app/(shell)/settings/contacts/page.tsx',
  'apps/web/app/app/(shell)/settings/data-privacy/page.tsx',
  'apps/web/app/app/(shell)/settings/delete-account/page.tsx',
  'apps/web/app/app/(shell)/settings/page.tsx',
  'apps/web/app/app/(shell)/settings/payments/page.tsx',
  'apps/web/app/app/(shell)/settings/profile/page.tsx',
  'apps/web/app/app/(shell)/settings/referral/page.tsx',
  'apps/web/app/app/(shell)/settings/retargeting-ads/page.tsx',
  'apps/web/app/app/(shell)/settings/touring/page.tsx',
  'apps/web/app/app/(shell)/settings/usage/page.tsx',
  'apps/web/app/app/(shell)/tasks/page.tsx',
  'apps/web/app/app/(shell)/threads/page.tsx',
  'apps/web/app/app/(shell)/tipping/page.tsx',
  'apps/web/app/app/(shell)/tour-dates/page.tsx',
  'apps/web/app/app/(shell)/tracks/page.tsx',
  'apps/web/app/app/(shell)/youtube/page.tsx',
] as const;

const LEGACY_PREFIXES = ['apps/web/app/app/(shell)/dashboard/'] as const;

const LEGACY_SOURCES = new Set<string>([
  'apps/web/app/app/(shell)/audience/page.tsx',
  'apps/web/app/app/(shell)/contact/page.tsx',
  'apps/web/app/app/(shell)/feature-flags/page.tsx',
  'apps/web/app/app/(shell)/presence/page.tsx',
  'apps/web/app/app/(shell)/profile/page.tsx',
  'apps/web/app/app/(shell)/releases/page.tsx',
  'apps/web/app/app/(shell)/threads/page.tsx',
  'apps/web/app/app/(shell)/tipping/page.tsx',
  'apps/web/app/app/(shell)/tracks/page.tsx',
]);

const ALIAS_SOURCES = new Set<string>([
  'apps/web/app/app/(shell)/settings/admin/page.tsx',
  'apps/web/app/app/(shell)/settings/appearance/page.tsx',
  'apps/web/app/app/(shell)/settings/delete-account/page.tsx',
  'apps/web/app/app/(shell)/settings/page.tsx',
  'apps/web/app/app/(shell)/settings/profile/page.tsx',
]);

/** Conservative: a redirecting source is never eligible as a visual reference. */
const NON_REFERENCE_SOURCES = new Set<string>([
  'apps/web/app/app/(shell)/admin/algorithm-health/page.tsx',
  'apps/web/app/app/(shell)/admin/campaigns/page.tsx',
  'apps/web/app/app/(shell)/admin/creators/page.tsx',
  'apps/web/app/app/(shell)/admin/feedback/page.tsx',
  'apps/web/app/app/(shell)/admin/growth/yc-metrics/page.tsx',
  'apps/web/app/app/(shell)/admin/ingest/page.tsx',
  'apps/web/app/app/(shell)/admin/leads/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/dm/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/email/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/page.tsx',
  'apps/web/app/app/(shell)/admin/outreach/review/page.tsx',
  'apps/web/app/app/(shell)/admin/releases/page.tsx',
  'apps/web/app/app/(shell)/admin/users/page.tsx',
  'apps/web/app/app/(shell)/admin/waitlist/page.tsx',
  'apps/web/app/app/(shell)/audience/page.tsx',
  'apps/web/app/app/(shell)/contact/page.tsx',
  'apps/web/app/app/(shell)/dashboard/audience/page.tsx',
  'apps/web/app/app/(shell)/dashboard/catalog-scan/page.tsx',
  'apps/web/app/app/(shell)/dashboard/chat/page.tsx',
  'apps/web/app/app/(shell)/dashboard/contacts/page.tsx',
  'apps/web/app/app/(shell)/dashboard/insights/page.tsx',
  'apps/web/app/app/(shell)/dashboard/library/page.tsx',
  'apps/web/app/app/(shell)/dashboard/links/page.tsx',
  'apps/web/app/app/(shell)/dashboard/page.tsx',
  'apps/web/app/app/(shell)/dashboard/presence/page.tsx',
  'apps/web/app/app/(shell)/dashboard/profile/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tasks/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tipping/page.tsx',
  'apps/web/app/app/(shell)/dashboard/tour-dates/page.tsx',
  'apps/web/app/app/(shell)/feature-flags/page.tsx',
  'apps/web/app/app/(shell)/presence/page.tsx',
  'apps/web/app/app/(shell)/profile/page.tsx',
  'apps/web/app/app/(shell)/releases/page.tsx',
  'apps/web/app/app/(shell)/settings/admin/page.tsx',
  'apps/web/app/app/(shell)/settings/appearance/page.tsx',
  'apps/web/app/app/(shell)/settings/delete-account/page.tsx',
  'apps/web/app/app/(shell)/settings/page.tsx',
  'apps/web/app/app/(shell)/settings/payments/page.tsx',
  'apps/web/app/app/(shell)/settings/profile/page.tsx',
  'apps/web/app/app/(shell)/threads/page.tsx',
  'apps/web/app/app/(shell)/tipping/page.tsx',
  'apps/web/app/app/(shell)/tracks/page.tsx',
]);

const SOURCE_PREFIX = 'apps/web/app/app/(shell)';

export function appScreenSourceToRoute(source: string): `/app${string}` {
  const relative = source
    .slice(SOURCE_PREFIX.length)
    .replace(/\/page\.tsx$/, '');
  return (
    relative.length === 0 ? '/app' : `/app${relative}`
  ) as `/app${string}`;
}

function classifyScreen(source: string): AppScreenKind {
  if (source.startsWith(`${SOURCE_PREFIX}/admin/`)) return 'operator';
  if (
    LEGACY_SOURCES.has(source) ||
    LEGACY_PREFIXES.some(prefix => source.startsWith(prefix))
  ) {
    return 'legacy';
  }
  if (ALIAS_SOURCES.has(source)) return 'alias';
  return 'canonical';
}

function recipeFor(source: string, kind: AppScreenKind): AppScreenRecipeId {
  if (kind === 'operator') return 'recipe.app-operator';
  if (kind === 'alias' || kind === 'legacy') {
    return 'recipe.app-compatibility';
  }
  if (source.includes('/settings/')) return 'recipe.app-settings';
  return 'recipe.app-standard';
}

function routeToId(route: string): `screen.${string}` {
  const suffix = route
    .replace(/^\/app\/?/, '')
    .replace(/\[([^\]]+)\]/g, 'by-$1')
    .replace(/[^a-zA-Z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return `screen.${suffix || 'root'}`;
}

export const APP_SCREEN_REGISTRY: readonly AppScreenRegistryEntry[] =
  APP_SCREEN_SOURCES.map(source => {
    const route = appScreenSourceToRoute(source);
    const kind = classifyScreen(source);
    return {
      id: routeToId(route),
      route,
      source,
      kind,
      conceptId: route,
      recipeId: recipeFor(source, kind),
      designReference:
        kind !== 'alias' &&
        kind !== 'legacy' &&
        !NON_REFERENCE_SOURCES.has(source),
    };
  });

const SCREEN_BY_ROUTE: Readonly<Record<string, AppScreenRegistryEntry>> =
  Object.fromEntries(APP_SCREEN_REGISTRY.map(entry => [entry.route, entry]));

export function getAppScreenRegistryEntry(
  route: string
): AppScreenRegistryEntry | null {
  return SCREEN_BY_ROUTE[route] ?? null;
}
