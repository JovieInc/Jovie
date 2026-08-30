/** Eight selectable product archetypes (JOV-5424). */
import type {
  AppScreenComponentId,
  AppScreenKind,
  AppScreenRecipeId,
} from './registry';

export const APP_SCREEN_ARCHETYPE_IDS = [
  'dashboard',
  'detail',
  'editor',
  'settings',
  'feed-list',
  'onboarding',
  'profile',
  'opportunity-decision',
] as const;

export type AppScreenArchetypeId = (typeof APP_SCREEN_ARCHETYPE_IDS)[number];

export const APP_SCREEN_SLOT_IDS = [
  'metrics',
  'summary',
  'primaryAction',
  'entity',
  'sections',
  'actions',
  'document',
  'fields',
  'saveAction',
  'items',
  'filters',
  'steps',
  'progress',
  'continueAction',
  'identity',
  'decisionActions',
  'status',
] as const;

export type AppScreenSlotId = (typeof APP_SCREEN_SLOT_IDS)[number];

export const APP_SCREEN_STATE_IDS = [
  'default',
  'loading',
  'empty',
  'error',
  'pending',
  'success',
  'partial',
  'offline',
] as const;

export type AppScreenStateId = (typeof APP_SCREEN_STATE_IDS)[number];

const STANDARD_COMPONENTS = [
  'component.app-shell-frame',
  'component.app-shell-content-panel',
  'component.empty-state',
  'component.entity-sidebar',
  'component.error-fallback',
] as const satisfies readonly AppScreenComponentId[];

const SETTINGS_COMPONENTS = [
  'component.app-shell-frame',
  'component.app-shell-content-panel',
  'component.settings-panel',
  'component.error-fallback',
] as const satisfies readonly AppScreenComponentId[];

const BASE_STATES = [
  'default',
  'loading',
  'empty',
  'error',
] as const satisfies readonly AppScreenStateId[];

const STANDARD_AND_OPERATOR = [
  'recipe.app-standard',
  'recipe.app-operator',
] as const satisfies readonly AppScreenRecipeId[];

export interface AppScreenArchetypeRegistryEntry {
  readonly id: AppScreenArchetypeId;
  readonly recipeId: AppScreenRecipeId;
  readonly allowedRecipeIds: readonly AppScreenRecipeId[];
  readonly componentIds: readonly AppScreenComponentId[];
  readonly requiredSlots: readonly AppScreenSlotId[];
  readonly requiredStates: readonly AppScreenStateId[];
  readonly representativeScreenId: `screen.${string}` | null;
  readonly representativeStoryId: string;
}

const routes = (
  id: AppScreenArchetypeId,
  csv: string
): ReadonlyArray<readonly [string, AppScreenArchetypeId]> =>
  csv.split(',').map(route => [route, id] as const);

/** Closed-world design-reference route → archetype. Alias/legacy are absent. */
export const DESIGN_REFERENCE_ARCHETYPE_BY_ROUTE = Object.fromEntries([
  ...routes(
    'opportunity-decision',
    '/app,/app/jovie-work,/app/youtube,/app/admin/interviews'
  ),
  ...routes(
    'dashboard',
    '/app/earnings,/app/insights,/app/admin/costs,/app/admin/growth,/app/admin/revenue-lift,/app/admin/system'
  ),
  ...routes(
    'detail',
    '/app/chat/[id],/app/lyrics/[trackId],/app/releases/[releaseId]/tasks,/app/admin/agent-runs/[id]'
  ),
  ...routes('editor', '/app/chat,/app/admin/chat,/app/admin/share-studio'),
  ...routes(
    'settings',
    '/app/settings/account,/app/settings/analytics,/app/settings/artist-profile,/app/settings/audience,/app/settings/billing,/app/settings/connectors,/app/settings/contacts,/app/settings/data-privacy,/app/settings/referral,/app/settings/retargeting-ads,/app/settings/touring,/app/settings/usage,/app/admin/investors/settings'
  ),
  ...routes('profile', '/app/profiles'),
  ...routes(
    'feed-list',
    '/app/calendar,/app/chats,/app/contacts,/app/library,/app/tasks,/app/tour-dates,/app/admin/activity,/app/admin/features,/app/admin/investors,/app/admin/investors/links,/app/admin/people,/app/admin/platform-connections,/app/admin/playlists,/app/admin/screenshots'
  ),
]) as Readonly<Record<string, AppScreenArchetypeId>>;

function defineArchetype(
  id: AppScreenArchetypeId,
  spec: {
    readonly requiredSlots: readonly AppScreenSlotId[];
    readonly representativeScreenId: `screen.${string}` | null;
    readonly representativeStoryId: string;
    readonly recipeId?: AppScreenRecipeId;
    readonly allowedRecipeIds?: readonly AppScreenRecipeId[];
    readonly componentIds?: readonly AppScreenComponentId[];
    readonly requiredStates?: readonly AppScreenStateId[];
  }
): AppScreenArchetypeRegistryEntry {
  return {
    id,
    recipeId: spec.recipeId ?? 'recipe.app-standard',
    allowedRecipeIds: spec.allowedRecipeIds ?? STANDARD_AND_OPERATOR,
    componentIds: spec.componentIds ?? STANDARD_COMPONENTS,
    requiredSlots: spec.requiredSlots,
    requiredStates: spec.requiredStates ?? BASE_STATES,
    representativeScreenId: spec.representativeScreenId,
    representativeStoryId: spec.representativeStoryId,
  };
}

export const APP_SCREEN_ARCHETYPE_REGISTRY = [
  defineArchetype('dashboard', {
    requiredSlots: ['metrics', 'summary', 'primaryAction'],
    representativeScreenId: 'screen.insights',
    representativeStoryId: 'app-screens-insights--reference',
  }),
  defineArchetype('detail', {
    requiredSlots: ['entity', 'sections', 'actions'],
    representativeScreenId: 'screen.lyrics.by.trackId',
    representativeStoryId: 'app-screens-lyrics-by-trackid--reference',
  }),
  defineArchetype('editor', {
    requiredSlots: ['document', 'fields', 'saveAction'],
    requiredStates: [...BASE_STATES, 'pending'],
    representativeScreenId: 'screen.chat',
    representativeStoryId: 'app-screens-chat--reference',
  }),
  defineArchetype('settings', {
    recipeId: 'recipe.app-settings',
    allowedRecipeIds: ['recipe.app-settings', 'recipe.app-operator'],
    componentIds: SETTINGS_COMPONENTS,
    requiredSlots: ['sections', 'fields', 'saveAction'],
    representativeScreenId: 'screen.settings.account',
    representativeStoryId: 'app-screens-settings-account--reference',
  }),
  defineArchetype('feed-list', {
    requiredSlots: ['items', 'filters', 'primaryAction'],
    representativeScreenId: 'screen.library',
    representativeStoryId: 'app-screens-library--reference',
  }),
  defineArchetype('onboarding', {
    allowedRecipeIds: ['recipe.app-standard'],
    requiredSlots: ['steps', 'progress', 'continueAction'],
    requiredStates: [...BASE_STATES, 'pending'],
    representativeScreenId: null,
    representativeStoryId: 'app-screens-onboarding--reference',
  }),
  defineArchetype('profile', {
    allowedRecipeIds: ['recipe.app-standard'],
    requiredSlots: ['identity', 'sections', 'primaryAction'],
    representativeScreenId: 'screen.profiles',
    representativeStoryId: 'app-screens-profiles--reference',
  }),
  defineArchetype('opportunity-decision', {
    requiredSlots: ['items', 'decisionActions', 'status'],
    requiredStates: [...BASE_STATES, 'pending'],
    representativeScreenId: 'screen.root',
    representativeStoryId: 'app-screens-root--reference',
  }),
] as const satisfies readonly AppScreenArchetypeRegistryEntry[];

const ARCHETYPE_BY_ID = Object.fromEntries(
  APP_SCREEN_ARCHETYPE_REGISTRY.map(entry => [entry.id, entry])
) as Record<AppScreenArchetypeId, AppScreenArchetypeRegistryEntry>;

export function getAppScreenArchetype(
  id: string
): AppScreenArchetypeRegistryEntry | null {
  return ARCHETYPE_BY_ID[id as AppScreenArchetypeId] ?? null;
}

export function archetypeIdForScreen(input: {
  readonly route: string;
  readonly kind: AppScreenKind;
  readonly designReference: boolean;
}): AppScreenArchetypeId | null {
  if (!input.designReference) return null;
  if (input.kind === 'alias' || input.kind === 'legacy') return null;
  return (
    (
      DESIGN_REFERENCE_ARCHETYPE_BY_ROUTE as Readonly<
        Record<string, AppScreenArchetypeId>
      >
    )[input.route] ?? null
  );
}
