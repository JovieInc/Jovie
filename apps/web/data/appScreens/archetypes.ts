import { APP_ROUTES } from '@/constants/routes';
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

export const APP_SCREEN_ARCHETYPE_SLOT_IDS = [
  'header',
  'summary',
  'primary-content',
  'feedback',
  'identity',
  'actions',
  'editor',
  'navigation',
  'section',
  'toolbar',
  'collection',
  'progress',
  'prompt',
  'input',
  'primary-action',
  'evidence',
  'decision-actions',
] as const;

export type AppScreenArchetypeSlotId =
  (typeof APP_SCREEN_ARCHETYPE_SLOT_IDS)[number];

export const APP_SCREEN_ARCHETYPE_STATE_IDS = [
  'loading',
  'empty',
  'populated',
  'pending',
  'success',
  'error',
  'offline',
  'recovery',
] as const;

export type AppScreenArchetypeStateId =
  (typeof APP_SCREEN_ARCHETYPE_STATE_IDS)[number];

export type AppScreenArchetypeReference =
  | {
      readonly kind: 'app-screen';
      readonly conceptId: `/app${string}`;
    }
  | {
      readonly kind: 'component-story';
      readonly storySource: string;
      readonly storybookTitle: string;
      readonly storyId: string;
    };

export interface AppScreenArchetypeRegistryEntry {
  readonly id: AppScreenArchetypeId;
  readonly recipeId: AppScreenRecipeId;
  readonly allowedKinds: readonly AppScreenKind[];
  readonly componentIds: readonly AppScreenComponentId[];
  readonly requiredSlotIds: readonly AppScreenArchetypeSlotId[];
  readonly requiredStateIds: readonly AppScreenArchetypeStateId[];
  readonly reference: AppScreenArchetypeReference;
}

const SHELL_COMPONENTS = [
  'component.app-shell-frame',
  'component.app-shell-content-panel',
] as const satisfies readonly AppScreenComponentId[];

const COLLECTION_STATES = ['loading', 'empty', 'populated', 'error'] as const;
const MUTATION_STATES = [
  'loading',
  'populated',
  'pending',
  'success',
  'error',
  'recovery',
] as const;
const nestedAppRoute = (
  route: `/app${string}`,
  suffix: string
): `/app${string}` => `${route}/${suffix}`;
const legacyAdminRoute = (suffix: string): `/app${string}` =>
  nestedAppRoute(APP_ROUTES.LEGACY_ADMIN, suffix);

export const APP_SCREEN_ARCHETYPE_REGISTRY = [
  {
    id: 'dashboard',
    recipeId: 'recipe.product.dashboard',
    allowedKinds: ['canonical', 'operator'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: ['header', 'summary', 'primary-content', 'feedback'],
    requiredStateIds: COLLECTION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.INSIGHTS },
  },
  {
    id: 'detail',
    recipeId: 'recipe.product.detail',
    allowedKinds: ['canonical', 'operator'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.entity-sidebar',
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: [
      'header',
      'identity',
      'primary-content',
      'actions',
      'feedback',
    ],
    requiredStateIds: COLLECTION_STATES,
    reference: {
      kind: 'app-screen',
      conceptId: nestedAppRoute(APP_ROUTES.CHAT, '[id]'),
    },
  },
  {
    id: 'editor',
    recipeId: 'recipe.product.editor',
    allowedKinds: ['canonical', 'operator'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.entity-sidebar',
      'component.error-fallback',
    ],
    requiredSlotIds: ['header', 'editor', 'actions', 'feedback'],
    requiredStateIds: MUTATION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.CHAT },
  },
  {
    id: 'settings',
    recipeId: 'recipe.product.settings',
    allowedKinds: ['canonical', 'operator'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.settings-panel',
      'component.error-fallback',
    ],
    requiredSlotIds: ['navigation', 'section', 'actions', 'feedback'],
    requiredStateIds: MUTATION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.SETTINGS_ACCOUNT },
  },
  {
    id: 'feed-list',
    recipeId: 'recipe.product.feed-list',
    allowedKinds: ['canonical', 'operator'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.unified-table',
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: ['toolbar', 'collection', 'feedback'],
    requiredStateIds: COLLECTION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.LIBRARY },
  },
  {
    id: 'onboarding',
    recipeId: 'recipe.product.onboarding',
    allowedKinds: ['canonical'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: ['progress', 'prompt', 'input', 'feedback'],
    requiredStateIds: [
      'loading',
      'empty',
      'populated',
      'pending',
      'success',
      'error',
      'recovery',
    ],
    reference: {
      kind: 'component-story',
      storySource:
        'apps/web/components/features/onboarding/OnboardingChatEmptyIntro.stories.tsx',
      storybookTitle: 'Onboarding/Public Start Entry',
      storyId: 'onboarding-public-start-entry--blank-entry',
    },
  },
  {
    id: 'profile',
    recipeId: 'recipe.product.profile',
    allowedKinds: ['canonical'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.entity-sidebar',
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: [
      'identity',
      'primary-action',
      'primary-content',
      'feedback',
    ],
    requiredStateIds: COLLECTION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.PROFILES },
  },
  {
    id: 'opportunity-decision',
    recipeId: 'recipe.product.opportunity-decision',
    allowedKinds: ['canonical'],
    componentIds: [
      ...SHELL_COMPONENTS,
      'component.entity-sidebar',
      'component.empty-state',
      'component.error-fallback',
    ],
    requiredSlotIds: ['identity', 'evidence', 'decision-actions', 'feedback'],
    requiredStateIds: MUTATION_STATES,
    reference: { kind: 'app-screen', conceptId: APP_ROUTES.DASHBOARD },
  },
] as const satisfies readonly AppScreenArchetypeRegistryEntry[];

export interface AppScreenArchetypeAssignment {
  readonly conceptId: `/app${string}`;
  readonly archetypeId: AppScreenArchetypeId;
}

const assignment = (
  conceptId: `/app${string}`,
  archetypeId: AppScreenArchetypeId
): AppScreenArchetypeAssignment => ({ conceptId, archetypeId });

export const APP_SCREEN_ARCHETYPE_ASSIGNMENTS = [
  assignment(legacyAdminRoute('activity'), 'feed-list'),
  assignment(legacyAdminRoute('agent-runs/[id]'), 'detail'),
  assignment(legacyAdminRoute('chat'), 'editor'),
  assignment(legacyAdminRoute('costs'), 'dashboard'),
  assignment(legacyAdminRoute('features'), 'settings'),
  assignment(legacyAdminRoute('growth'), 'dashboard'),
  assignment(legacyAdminRoute('interviews'), 'feed-list'),
  assignment(legacyAdminRoute('investors/links'), 'feed-list'),
  assignment(legacyAdminRoute('investors'), 'feed-list'),
  assignment(legacyAdminRoute('investors/settings'), 'settings'),
  assignment(legacyAdminRoute('people'), 'feed-list'),
  assignment(legacyAdminRoute('platform-connections'), 'settings'),
  assignment(legacyAdminRoute('playlists'), 'feed-list'),
  assignment(legacyAdminRoute('revenue-lift'), 'dashboard'),
  assignment(legacyAdminRoute('screenshots'), 'feed-list'),
  assignment(legacyAdminRoute('share-studio'), 'editor'),
  assignment(legacyAdminRoute('system'), 'dashboard'),
  assignment(APP_ROUTES.CALENDAR, 'feed-list'),
  assignment(nestedAppRoute(APP_ROUTES.CHAT, '[id]'), 'detail'),
  assignment(APP_ROUTES.CHAT, 'editor'),
  assignment(APP_ROUTES.CHATS, 'feed-list'),
  assignment(APP_ROUTES.CONTACTS, 'feed-list'),
  assignment(APP_ROUTES.EARNINGS, 'dashboard'),
  assignment(APP_ROUTES.INSIGHTS, 'dashboard'),
  assignment(APP_ROUTES.JOVIE_WORK, 'opportunity-decision'),
  assignment(APP_ROUTES.LIBRARY, 'feed-list'),
  assignment(nestedAppRoute(APP_ROUTES.LYRICS, '[trackId]'), 'editor'),
  assignment(APP_ROUTES.DASHBOARD, 'opportunity-decision'),
  assignment(APP_ROUTES.PROFILES, 'profile'),
  assignment(
    nestedAppRoute(APP_ROUTES.RELEASES, '[releaseId]/tasks'),
    'detail'
  ),
  assignment(APP_ROUTES.SETTINGS_ACCOUNT, 'settings'),
  assignment(APP_ROUTES.SETTINGS_ANALYTICS, 'settings'),
  assignment(APP_ROUTES.SETTINGS_ARTIST_PROFILE, 'settings'),
  assignment(APP_ROUTES.SETTINGS_AUDIENCE, 'settings'),
  assignment(APP_ROUTES.SETTINGS_BILLING, 'settings'),
  assignment(APP_ROUTES.SETTINGS_CONNECTORS, 'settings'),
  assignment(APP_ROUTES.SETTINGS_CONTACTS, 'settings'),
  assignment(APP_ROUTES.SETTINGS_DATA_PRIVACY, 'settings'),
  assignment(APP_ROUTES.SETTINGS_REFERRAL, 'settings'),
  assignment(APP_ROUTES.SETTINGS_RETARGETING_ADS, 'settings'),
  assignment(APP_ROUTES.SETTINGS_TOURING, 'settings'),
  assignment(APP_ROUTES.SETTINGS_USAGE, 'settings'),
  assignment(APP_ROUTES.TASKS, 'feed-list'),
  assignment(APP_ROUTES.TOUR_DATES, 'feed-list'),
  assignment(APP_ROUTES.YOUTUBE_REVIVAL, 'feed-list'),
] as const satisfies readonly AppScreenArchetypeAssignment[];

const ARCHETYPE_BY_ID: Readonly<
  Record<AppScreenArchetypeId, AppScreenArchetypeRegistryEntry>
> = Object.fromEntries(
  APP_SCREEN_ARCHETYPE_REGISTRY.map(archetype => [archetype.id, archetype])
) as Record<AppScreenArchetypeId, AppScreenArchetypeRegistryEntry>;

export function getAppScreenArchetype(
  archetypeId: string
): AppScreenArchetypeRegistryEntry | null {
  return ARCHETYPE_BY_ID[archetypeId as AppScreenArchetypeId] ?? null;
}

export interface AppScreenArchetypeAssemblyInput {
  readonly archetypeId: string;
  readonly recipeId: string;
  readonly componentIds: readonly string[];
  readonly slotIds: readonly string[];
  readonly stateIds: readonly string[];
}

export interface AppScreenArchetypeAssembly {
  readonly archetypeId: AppScreenArchetypeId;
  readonly recipeId: AppScreenRecipeId;
  readonly componentIds: readonly AppScreenComponentId[];
  readonly slotIds: readonly AppScreenArchetypeSlotId[];
  readonly stateIds: readonly AppScreenArchetypeStateId[];
}

const sameValues = (
  actual: readonly string[],
  expected: readonly string[]
): boolean =>
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

export function buildAppScreenArchetypeAssembly(
  input: AppScreenArchetypeAssemblyInput
): AppScreenArchetypeAssembly {
  const archetype = getAppScreenArchetype(input.archetypeId);
  if (!archetype) {
    throw new Error(`[missing-archetype] ${input.archetypeId}`);
  }
  if (input.recipeId !== archetype.recipeId) {
    throw new Error(
      `[archetype-recipe-mismatch] ${archetype.id} requires ${archetype.recipeId}`
    );
  }
  if (!sameValues(input.componentIds, archetype.componentIds)) {
    throw new Error(
      `[archetype-component-mismatch] ${archetype.id} requires its canonical component composition`
    );
  }
  if (!sameValues(input.slotIds, archetype.requiredSlotIds)) {
    throw new Error(
      `[missing-archetype-slot] ${archetype.id} requires ${archetype.requiredSlotIds.join(', ')}`
    );
  }
  if (!sameValues(input.stateIds, archetype.requiredStateIds)) {
    throw new Error(
      `[missing-archetype-state] ${archetype.id} requires ${archetype.requiredStateIds.join(', ')}`
    );
  }
  return {
    archetypeId: archetype.id,
    recipeId: archetype.recipeId,
    componentIds: archetype.componentIds,
    slotIds: archetype.requiredSlotIds,
    stateIds: archetype.requiredStateIds,
  };
}
