import {
  APP_SCREEN_ARCHETYPE_IDS,
  APP_SCREEN_ARCHETYPE_REGISTRY,
  APP_SCREEN_SLOT_IDS,
  APP_SCREEN_STATE_IDS,
  type AppScreenArchetypeId,
  type AppScreenArchetypeRegistryEntry,
} from './archetypes';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_LEGACY_BODY_SOURCES,
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenComponentRegistryEntry,
  type AppScreenRecipeRegistryEntry,
  type AppScreenRegistryEntry,
  appScreenSourceToRoute,
} from './registry';

export type AppScreenValidationCode =
  | 'duplicate-component'
  | 'duplicate-component-pen-root'
  | 'duplicate-recipe'
  | 'duplicate-screen'
  | 'duplicate-source'
  | 'duplicate-route'
  | 'duplicate-reference-concept'
  | 'missing-component'
  | 'reference-component-without-pen-root'
  | 'unresolved-component-pen-identity-without-reason'
  | 'duplicate-recipe-component'
  | 'missing-recipe'
  | 'invalid-recipe-kind'
  | 'invalid-reference-kind'
  | 'route-source-mismatch'
  | 'missing-error-boundary'
  | 'missing-story'
  | 'unexpected-story'
  | 'duplicate-story'
  | 'unsafe-story'
  | 'story-recipe-mismatch'
  | 'story-component-mismatch'
  | 'unresolved-concept'
  | 'unexpected-redirect-receipt'
  | 'duplicate-archetype'
  | 'missing-archetype'
  | 'unexpected-archetype'
  | 'invalid-archetype-recipe'
  | 'illegal-recipe-component'
  | 'missing-slot'
  | 'missing-state'
  | 'stale-representative-story'
  | 'unmapped-design-reference';

export interface AppScreenValidationIssue {
  readonly code: AppScreenValidationCode;
  readonly message: string;
}

export interface AppScreenValidationInput {
  readonly components?: readonly AppScreenComponentRegistryEntry[];
  readonly recipes?: readonly AppScreenRecipeRegistryEntry[];
  readonly screens?: readonly AppScreenRegistryEntry[];
  readonly archetypes?: readonly AppScreenArchetypeRegistryEntry[];
}

const duplicates = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

/** Browser-safe Storybook id shape (`<kind>--<story>`, lowercase, dashes). */
const BROWSER_SAFE_STORY_ID =
  /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SLOT_ID_SET: ReadonlySet<string> = new Set(APP_SCREEN_SLOT_IDS);
const STATE_ID_SET: ReadonlySet<string> = new Set(APP_SCREEN_STATE_IDS);
const REQUIRED_ARCHETYPE_IDS: readonly string[] = APP_SCREEN_ARCHETYPE_IDS;

const LEGACY_BODY_SOURCE_SET: ReadonlySet<string> = new Set(
  APP_SCREEN_LEGACY_BODY_SOURCES
);

const sameComponentIds = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export function validateAppScreenSystem({
  components = APP_SCREEN_COMPONENT_REGISTRY,
  recipes = APP_SCREEN_RECIPE_REGISTRY,
  screens = APP_SCREEN_REGISTRY,
  archetypes = APP_SCREEN_ARCHETYPE_REGISTRY,
}: AppScreenValidationInput = {}): readonly AppScreenValidationIssue[] {
  const issues: AppScreenValidationIssue[] = [];
  const add = (code: AppScreenValidationCode, message: string) =>
    issues.push({ code, message });

  for (const id of duplicates(components.map(entry => entry.id))) {
    add('duplicate-component', `component ${id} is registered more than once`);
  }
  for (const id of duplicates(recipes.map(entry => entry.id))) {
    add('duplicate-recipe', `recipe ${id} is registered more than once`);
  }
  for (const id of duplicates(screens.map(entry => entry.id))) {
    add('duplicate-screen', `screen ${id} is registered more than once`);
  }
  for (const source of duplicates(screens.map(entry => entry.source))) {
    add('duplicate-source', `source ${source} is registered more than once`);
  }
  for (const route of duplicates(screens.map(entry => entry.route))) {
    add('duplicate-route', `route ${route} is registered more than once`);
  }

  const componentsById = new Map(
    components.map(component => [component.id, component])
  );
  const recipesById = new Map(recipes.map(recipe => [recipe.id, recipe]));

  const componentPenRoots = new Set<string>();
  for (const component of components) {
    if (component.penReferenceEligible && !component.penRootId) {
      add(
        'reference-component-without-pen-root',
        `component ${component.id} is Pen-referenceable without a native root`
      );
    }
    if (!component.penReferenceEligible && !component.penIdentityReason) {
      add(
        'unresolved-component-pen-identity-without-reason',
        `component ${component.id} has no native Pen root or unresolved-identity reason`
      );
    }
    if (component.penRootId) {
      if (componentPenRoots.has(component.penRootId)) {
        add(
          'duplicate-component-pen-root',
          `component Pen root ${component.penRootId} is registered more than once`
        );
      }
      componentPenRoots.add(component.penRootId);
    }
  }

  for (const recipe of recipes) {
    for (const componentId of duplicates(recipe.componentIds)) {
      add(
        'duplicate-recipe-component',
        `recipe ${recipe.id} repeats ${componentId}`
      );
    }
    for (const componentId of recipe.componentIds) {
      if (!componentsById.has(componentId)) {
        add(
          'missing-component',
          `recipe ${recipe.id} uses unregistered ${componentId}`
        );
      }
    }
    if (!recipe.errorBoundarySource) {
      add(
        'missing-error-boundary',
        `recipe ${recipe.id} has no error boundary`
      );
    }
  }

  const referenceConceptCounts = new Map<string, number>();
  const referenceConcepts = new Set<string>();
  for (const screen of screens) {
    if (screen.designReference) referenceConcepts.add(screen.conceptId);
  }

  for (const screen of screens) {
    const recipe = recipesById.get(screen.recipeId);
    if (!recipe) {
      add(
        'missing-recipe',
        `screen ${screen.id} uses unregistered ${screen.recipeId}`
      );
    } else if (!recipe.allowedKinds.includes(screen.kind)) {
      add(
        'invalid-recipe-kind',
        `recipe ${recipe.id} does not allow ${screen.kind} screens`
      );
    }
    if (
      screen.designReference &&
      (screen.kind === 'alias' || screen.kind === 'legacy')
    ) {
      add(
        'invalid-reference-kind',
        `${screen.kind} screen ${screen.id} cannot be a design reference`
      );
    }
    if (screen.route !== appScreenSourceToRoute(screen.source)) {
      add(
        'route-source-mismatch',
        `${screen.route} does not match ${screen.source}`
      );
    }

    if (screen.designReference) {
      referenceConceptCounts.set(
        screen.conceptId,
        (referenceConceptCounts.get(screen.conceptId) ?? 0) + 1
      );
      if (!screen.story) {
        add(
          'missing-story',
          `design reference ${screen.id} has no Storybook story contract`
        );
      }
    } else if (screen.story) {
      add(
        'unexpected-story',
        `non-reference screen ${screen.id} must not carry a story contract`
      );
    }

    if (screen.story) {
      if (!BROWSER_SAFE_STORY_ID.test(screen.story.id)) {
        add(
          'unsafe-story',
          `story id '${screen.story.id}' on ${screen.id} is not browser-safe`
        );
      }
      if (screen.story.recipeId !== screen.recipeId) {
        add(
          'story-recipe-mismatch',
          `story ${screen.story.id} uses ${screen.story.recipeId} but ${screen.id} declares ${screen.recipeId}`
        );
      }
      if (
        recipe &&
        !sameComponentIds(screen.story.componentIds, recipe.componentIds)
      ) {
        add(
          'story-component-mismatch',
          `story ${screen.story.id} does not use the declared components of ${screen.recipeId}`
        );
      }
    }

    if (screen.kind === 'alias' || screen.kind === 'legacy') {
      if (screen.conceptId === screen.route) {
        if (!LEGACY_BODY_SOURCE_SET.has(screen.source)) {
          add(
            'unresolved-concept',
            `${screen.kind} screen ${screen.id} has no canonical concept mapping`
          );
        }
      } else if (!referenceConcepts.has(screen.conceptId)) {
        add(
          'unresolved-concept',
          `${screen.kind} screen ${screen.id} concept ${screen.conceptId} is not a design reference`
        );
      }
    } else if (screen.redirectTo !== null) {
      add(
        'unexpected-redirect-receipt',
        `${screen.kind} screen ${screen.id} must not carry a redirect receipt`
      );
    }
  }
  for (const id of duplicates(screens.map(entry => entry.story?.id ?? ''))) {
    if (id) add('duplicate-story', `story id ${id} is used more than once`);
  }
  for (const [conceptId, count] of referenceConceptCounts) {
    if (count > 1) {
      add(
        'duplicate-reference-concept',
        `concept ${conceptId} has ${count} design references`
      );
    }
  }

  for (const id of duplicates(archetypes.map(entry => entry.id))) {
    add('duplicate-archetype', `archetype ${id} is registered more than once`);
  }
  const registeredArchetypeIds = new Set(archetypes.map(entry => entry.id));
  for (const id of REQUIRED_ARCHETYPE_IDS) {
    if (!registeredArchetypeIds.has(id)) {
      add('missing-archetype', `required product archetype ${id} is missing`);
    }
  }
  for (const id of registeredArchetypeIds) {
    if (!REQUIRED_ARCHETYPE_IDS.includes(id)) {
      add(
        'unexpected-archetype',
        `archetype ${id} is not one of the eight product archetypes`
      );
    }
  }

  const screensById = new Map(screens.map(screen => [screen.id, screen]));
  const representedArchetypes = new Set<string>();
  const representativeStories = new Set<string>();
  for (const archetype of archetypes) {
    const recipe = recipesById.get(archetype.recipeId);
    if (!recipe || !archetype.allowedRecipeIds.includes(archetype.recipeId)) {
      add(
        'invalid-archetype-recipe',
        `archetype ${archetype.id} canonical recipe ${archetype.recipeId} is invalid`
      );
    }
    for (const recipeId of archetype.allowedRecipeIds) {
      if (!recipesById.has(recipeId)) {
        add(
          'invalid-archetype-recipe',
          `archetype ${archetype.id} allows unregistered ${recipeId}`
        );
      }
    }
    const recipeComponents = new Set(recipe?.componentIds ?? []);
    for (const componentId of archetype.componentIds) {
      if (
        !componentsById.has(componentId) ||
        !recipeComponents.has(componentId)
      ) {
        add(
          'illegal-recipe-component',
          `archetype ${archetype.id} pairs ${archetype.recipeId} with ${componentId}`
        );
      }
    }
    if (
      archetype.requiredSlots.length === 0 ||
      duplicates(archetype.requiredSlots).length > 0 ||
      archetype.requiredSlots.some(slot => !SLOT_ID_SET.has(slot))
    ) {
      add(
        'missing-slot',
        `archetype ${archetype.id} has invalid required slots`
      );
    }
    if (
      archetype.requiredStates.length === 0 ||
      duplicates(archetype.requiredStates).length > 0 ||
      archetype.requiredStates.some(state => !STATE_ID_SET.has(state))
    ) {
      add(
        'missing-state',
        `archetype ${archetype.id} has invalid required states`
      );
    }
    const storyId = archetype.representativeStoryId;
    if (
      !BROWSER_SAFE_STORY_ID.test(storyId) ||
      representativeStories.has(storyId)
    ) {
      add(
        'stale-representative-story',
        `archetype ${archetype.id} representative story ${storyId} is stale`
      );
    }
    representativeStories.add(storyId);
    const screen = archetype.representativeScreenId
      ? screensById.get(archetype.representativeScreenId)
      : null;
    const story = screen?.story;
    const representativeOk = archetype.representativeScreenId
      ? Boolean(
          screen?.designReference &&
            screen.archetypeId === archetype.id &&
            story?.id === storyId &&
            story.recipeId === archetype.recipeId &&
            sameComponentIds(story.componentIds, archetype.componentIds)
        )
      : Boolean(storyId);
    if (!representativeOk) {
      add(
        'stale-representative-story',
        `archetype ${archetype.id} representative ${archetype.representativeScreenId ?? storyId} is stale`
      );
    } else {
      representedArchetypes.add(archetype.id);
    }
  }

  for (const screen of screens) {
    const projection =
      screen.kind === 'alias' ||
      screen.kind === 'legacy' ||
      !screen.designReference;
    if (projection) {
      if (screen.archetypeId) {
        add(
          'unexpected-archetype',
          `${screen.kind} screen ${screen.id} cannot mint archetype authority`
        );
      }
      continue;
    }
    if (!screen.archetypeId) {
      add(
        'unmapped-design-reference',
        `design reference ${screen.id} has no product archetype`
      );
      continue;
    }
    const archetype = archetypes.find(entry => entry.id === screen.archetypeId);
    if (!archetype) {
      add(
        'missing-archetype',
        `screen ${screen.id} uses unregistered ${screen.archetypeId}`
      );
    } else if (!archetype.allowedRecipeIds.includes(screen.recipeId)) {
      add(
        'invalid-archetype-recipe',
        `screen ${screen.id} uses ${screen.recipeId} which ${archetype.id} does not allow`
      );
    }
  }
  for (const id of REQUIRED_ARCHETYPE_IDS) {
    if (registeredArchetypeIds.has(id) && !representedArchetypes.has(id)) {
      add(
        'stale-representative-story',
        `archetype ${id} has no representative design-reference screen or story`
      );
    }
  }

  return issues;
}

export function assertAppScreenSystem(): void {
  const issues = validateAppScreenSystem();
  if (issues.length > 0) {
    throw new Error(
      [
        'Authenticated screen registry gate failed:',
        ...issues.map(issue => `- [${issue.code}] ${issue.message}`),
      ].join('\n')
    );
  }
}

export const APP_SCREEN_ARCHETYPE_RECEIPT_SCHEMA =
  'app-screen-archetype-receipt/v1';

export interface AppScreenArchetypeReceipt {
  readonly schema: typeof APP_SCREEN_ARCHETYPE_RECEIPT_SCHEMA;
  readonly headSha: string;
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly archetypes: readonly AppScreenArchetypeId[];
  readonly representatives: readonly {
    readonly archetypeId: AppScreenArchetypeId;
    readonly screenId: `screen.${string}` | null;
    readonly storyId: string;
  }[];
}

export function buildAppScreenArchetypeReceipt(input: {
  readonly headSha: string;
}): AppScreenArchetypeReceipt {
  const headSha = input.headSha.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error(
      'Cannot build app-screen archetype receipt without an exact HEAD SHA'
    );
  }
  const issues = validateAppScreenSystem();
  return {
    schema: APP_SCREEN_ARCHETYPE_RECEIPT_SCHEMA,
    headSha,
    ok: issues.length === 0,
    issues: issues.map(issue => `[${issue.code}] ${issue.message}`),
    archetypes: APP_SCREEN_ARCHETYPE_IDS,
    representatives: APP_SCREEN_ARCHETYPE_REGISTRY.map(entry => ({
      archetypeId: entry.id,
      screenId: entry.representativeScreenId,
      storyId: entry.representativeStoryId,
    })),
  };
}
