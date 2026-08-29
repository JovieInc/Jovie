import {
  APP_SCREEN_ARCHETYPE_ASSIGNMENTS,
  APP_SCREEN_ARCHETYPE_REGISTRY,
  type AppScreenArchetypeAssignment,
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
  | 'duplicate-archetype'
  | 'duplicate-archetype-assignment'
  | 'duplicate-component'
  | 'duplicate-component-pen-root'
  | 'duplicate-recipe'
  | 'duplicate-screen'
  | 'duplicate-source'
  | 'duplicate-route'
  | 'duplicate-reference-concept'
  | 'missing-component'
  | 'missing-archetype'
  | 'missing-archetype-assignment'
  | 'missing-archetype-recipe'
  | 'stale-archetype-assignment'
  | 'invalid-archetype-reference'
  | 'unexpected-screen-archetype'
  | 'screen-archetype-mismatch'
  | 'archetype-recipe-mismatch'
  | 'archetype-component-mismatch'
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
  | 'story-archetype-mismatch'
  | 'story-slot-mismatch'
  | 'story-state-mismatch'
  | 'unresolved-concept'
  | 'unexpected-redirect-receipt';

export interface AppScreenValidationIssue {
  readonly code: AppScreenValidationCode;
  readonly message: string;
}

export interface AppScreenValidationInput {
  readonly archetypes?: readonly AppScreenArchetypeRegistryEntry[];
  readonly archetypeAssignments?: readonly AppScreenArchetypeAssignment[];
  readonly components?: readonly AppScreenComponentRegistryEntry[];
  readonly recipes?: readonly AppScreenRecipeRegistryEntry[];
  readonly screens?: readonly AppScreenRegistryEntry[];
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

const LEGACY_BODY_SOURCE_SET: ReadonlySet<string> = new Set(
  APP_SCREEN_LEGACY_BODY_SOURCES
);

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export function validateAppScreenSystem({
  archetypes = APP_SCREEN_ARCHETYPE_REGISTRY,
  archetypeAssignments = APP_SCREEN_ARCHETYPE_ASSIGNMENTS,
  components = APP_SCREEN_COMPONENT_REGISTRY,
  recipes = APP_SCREEN_RECIPE_REGISTRY,
  screens = APP_SCREEN_REGISTRY,
}: AppScreenValidationInput = {}): readonly AppScreenValidationIssue[] {
  const issues: AppScreenValidationIssue[] = [];
  const add = (code: AppScreenValidationCode, message: string) =>
    issues.push({ code, message });

  for (const id of duplicates(archetypes.map(entry => entry.id))) {
    add('duplicate-archetype', `archetype ${id} is registered more than once`);
  }
  for (const conceptId of duplicates(
    archetypeAssignments.map(entry => entry.conceptId)
  )) {
    add(
      'duplicate-archetype-assignment',
      `concept ${conceptId} has more than one archetype assignment`
    );
  }
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
  const archetypesById = new Map(
    archetypes.map(archetype => [archetype.id, archetype])
  );
  const assignmentsByConcept = new Map(
    archetypeAssignments.map(assignment => [
      assignment.conceptId,
      assignment.archetypeId,
    ])
  );

  for (const archetype of archetypes) {
    const recipe = recipesById.get(archetype.recipeId);
    if (!recipe) {
      add(
        'missing-archetype-recipe',
        `archetype ${archetype.id} uses unregistered ${archetype.recipeId}`
      );
    } else if (!sameIds(archetype.componentIds, recipe.componentIds)) {
      add(
        'archetype-component-mismatch',
        `archetype ${archetype.id} does not match ${recipe.id}`
      );
    }
  }

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

  for (const assignment of archetypeAssignments) {
    if (!archetypesById.has(assignment.archetypeId)) {
      add(
        'missing-archetype',
        `concept ${assignment.conceptId} uses unregistered ${assignment.archetypeId}`
      );
    }
    if (!referenceConcepts.has(assignment.conceptId)) {
      add(
        'stale-archetype-assignment',
        `concept ${assignment.conceptId} is not a design reference`
      );
    }
  }

  for (const archetype of archetypes) {
    if (archetype.reference.kind !== 'app-screen') continue;
    const reference = screens.find(
      screen =>
        screen.designReference &&
        screen.conceptId === archetype.reference.conceptId
    );
    if (!reference || reference.archetypeId !== archetype.id) {
      add(
        'invalid-archetype-reference',
        `archetype ${archetype.id} has no matching design-reference screen`
      );
    }
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
      const assignedArchetypeId = assignmentsByConcept.get(screen.conceptId);
      if (!assignedArchetypeId) {
        add(
          'missing-archetype-assignment',
          `design reference ${screen.id} has no explicit archetype assignment`
        );
      }
      if (!screen.archetypeId) {
        add(
          'missing-archetype',
          `design reference ${screen.id} has no product archetype`
        );
      } else {
        if (assignedArchetypeId !== screen.archetypeId) {
          add(
            'screen-archetype-mismatch',
            `${screen.id} declares ${screen.archetypeId} but its assignment declares ${assignedArchetypeId ?? 'none'}`
          );
        }
        const archetype = archetypesById.get(screen.archetypeId);
        if (!archetype) {
          add(
            'missing-archetype',
            `screen ${screen.id} uses unregistered ${screen.archetypeId}`
          );
        } else if (screen.recipeId !== archetype.recipeId) {
          add(
            'archetype-recipe-mismatch',
            `screen ${screen.id} uses ${screen.recipeId} but ${archetype.id} requires ${archetype.recipeId}`
          );
        }
      }
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
    } else {
      if (screen.archetypeId) {
        add(
          'unexpected-screen-archetype',
          `non-reference screen ${screen.id} must not select an archetype`
        );
      }
      if (screen.story) {
        add(
          'unexpected-story',
          `non-reference screen ${screen.id} must not carry a story contract`
        );
      }
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
      if (screen.story.archetypeId !== screen.archetypeId) {
        add(
          'story-archetype-mismatch',
          `story ${screen.story.id} does not match ${screen.id}'s archetype`
        );
      }
      const archetype = archetypesById.get(screen.story.archetypeId);
      if (
        archetype &&
        !sameIds(screen.story.slotIds, archetype.requiredSlotIds)
      ) {
        add(
          'story-slot-mismatch',
          `story ${screen.story.id} slot IDs do not exactly match ${archetype.id}`
        );
      }
      if (
        archetype &&
        !sameIds(screen.story.stateIds, archetype.requiredStateIds)
      ) {
        add(
          'story-state-mismatch',
          `story ${screen.story.id} state IDs do not exactly match ${archetype.id}`
        );
      }
      if (recipe && !sameIds(screen.story.componentIds, recipe.componentIds)) {
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
