/** Typed archetype resolver: select an identity and supply its declared slots. */
import {
  APP_SCREEN_ARCHETYPE_REGISTRY,
  type AppScreenArchetypeId,
  type AppScreenArchetypeRegistryEntry,
  type AppScreenSlotId,
  type AppScreenStateId,
  getAppScreenArchetype,
} from './archetypes';
import {
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenComponentId,
  type AppScreenRecipeId,
} from './registry';

export type AppScreenAssemblyIssueCode =
  | 'missing-archetype'
  | 'wrong-recipe'
  | 'illegal-recipe-component'
  | 'missing-slot'
  | 'missing-state'
  | 'unexpected-slot'
  | 'stale-representative-story';

export interface AppScreenAssemblyIssue {
  readonly code: AppScreenAssemblyIssueCode;
  readonly message: string;
}

export interface AppScreenAssemblyInput {
  readonly archetypeId: AppScreenArchetypeId | string;
  readonly slots: Readonly<Partial<Record<AppScreenSlotId, unknown>>>;
  readonly states?: readonly AppScreenStateId[];
  readonly recipeId?: AppScreenRecipeId;
  readonly componentIds?: readonly AppScreenComponentId[];
}

export interface AppScreenAssembly {
  readonly archetypeId: AppScreenArchetypeId;
  readonly recipeId: AppScreenRecipeId;
  readonly componentIds: readonly AppScreenComponentId[];
  readonly slots: Readonly<Partial<Record<AppScreenSlotId, unknown>>>;
  readonly states: readonly AppScreenStateId[];
  readonly representativeStoryId: string;
  readonly representativeScreenId: `screen.${string}` | null;
}

const RECIPE_BY_ID = new Map(
  APP_SCREEN_RECIPE_REGISTRY.map(recipe => [recipe.id, recipe])
);
const SCREEN_BY_ID = new Map(
  APP_SCREEN_REGISTRY.map(screen => [screen.id, screen])
);

export function resolveAppScreenArchetype(
  id: string
): AppScreenArchetypeRegistryEntry | null {
  return getAppScreenArchetype(id);
}

export function validateAppScreenAssembly(
  input: AppScreenAssemblyInput,
  archetypes: readonly AppScreenArchetypeRegistryEntry[] = APP_SCREEN_ARCHETYPE_REGISTRY
): readonly AppScreenAssemblyIssue[] {
  const issues: AppScreenAssemblyIssue[] = [];
  const add = (code: AppScreenAssemblyIssueCode, message: string) =>
    issues.push({ code, message });
  const archetype =
    archetypes.find(entry => entry.id === input.archetypeId) ?? null;
  if (!archetype) {
    add(
      'missing-archetype',
      `archetype ${String(input.archetypeId)} is not registered`
    );
    return issues;
  }

  const recipeId = input.recipeId ?? archetype.recipeId;
  if (!archetype.allowedRecipeIds.includes(recipeId)) {
    add(
      'wrong-recipe',
      `recipe ${recipeId} is not allowed for archetype ${archetype.id}`
    );
  }

  const recipe = RECIPE_BY_ID.get(recipeId);
  const componentIds = input.componentIds ?? archetype.componentIds;
  const allowed = new Set(recipe?.componentIds ?? archetype.componentIds);
  for (const componentId of componentIds) {
    if (!allowed.has(componentId)) {
      add(
        'illegal-recipe-component',
        `component ${componentId} is not allowed on ${recipeId} for ${archetype.id}`
      );
    }
  }

  const requiredSlots = new Set(archetype.requiredSlots);
  for (const slot of requiredSlots) {
    if (!(slot in input.slots) || input.slots[slot] === undefined) {
      add(
        'missing-slot',
        `archetype ${archetype.id} is missing required slot ${slot}`
      );
    }
  }
  for (const slot of Object.keys(input.slots) as AppScreenSlotId[]) {
    if (!requiredSlots.has(slot)) {
      add(
        'unexpected-slot',
        `archetype ${archetype.id} does not declare slot ${slot}`
      );
    }
  }

  const providedStates = new Set(input.states ?? archetype.requiredStates);
  for (const state of archetype.requiredStates) {
    if (!providedStates.has(state)) {
      add(
        'missing-state',
        `archetype ${archetype.id} is missing required state ${state}`
      );
    }
  }

  if (archetype.representativeScreenId) {
    const screen = SCREEN_BY_ID.get(archetype.representativeScreenId);
    if (screen?.story?.id !== archetype.representativeStoryId) {
      add(
        'stale-representative-story',
        `archetype ${archetype.id} representative story ${archetype.representativeStoryId} does not match ${archetype.representativeScreenId}`
      );
    }
  }
  return issues;
}

export function assembleAppScreen(
  input: AppScreenAssemblyInput
): AppScreenAssembly {
  const issues = validateAppScreenAssembly(input);
  if (issues.length > 0) {
    throw new Error(
      [
        'App screen archetype assembly failed:',
        ...issues.map(issue => `- [${issue.code}] ${issue.message}`),
      ].join('\n')
    );
  }
  const archetype = getAppScreenArchetype(String(input.archetypeId));
  if (!archetype) {
    throw new Error(
      `App screen archetype assembly failed: archetype ${String(input.archetypeId)} is not registered`
    );
  }
  return {
    archetypeId: archetype.id,
    recipeId: input.recipeId ?? archetype.recipeId,
    componentIds: input.componentIds ?? archetype.componentIds,
    slots: input.slots,
    states: input.states ?? archetype.requiredStates,
    representativeStoryId: archetype.representativeStoryId,
    representativeScreenId: archetype.representativeScreenId,
  };
}
