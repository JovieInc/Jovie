import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenComponentRegistryEntry,
  type AppScreenRecipeRegistryEntry,
  type AppScreenRegistryEntry,
  appScreenSourceToRoute,
} from './registry';

export type AppScreenValidationCode =
  | 'duplicate-component'
  | 'duplicate-recipe'
  | 'duplicate-screen'
  | 'duplicate-source'
  | 'duplicate-route'
  | 'duplicate-reference-concept'
  | 'missing-component'
  | 'duplicate-recipe-component'
  | 'missing-recipe'
  | 'invalid-recipe-kind'
  | 'invalid-reference-kind'
  | 'route-source-mismatch'
  | 'missing-error-boundary';

export interface AppScreenValidationIssue {
  readonly code: AppScreenValidationCode;
  readonly message: string;
}

export interface AppScreenValidationInput {
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

export function validateAppScreenSystem({
  components = APP_SCREEN_COMPONENT_REGISTRY,
  recipes = APP_SCREEN_RECIPE_REGISTRY,
  screens = APP_SCREEN_REGISTRY,
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
    }
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
