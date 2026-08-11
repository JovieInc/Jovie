/**
 * Machine-readable Pen export for the authenticated app-screen registry
 * (JOV-4963). This is the single authoritative denominator the Pen lane
 * consumes: every screen exactly once, with its canonical concept, recipe,
 * components, deterministic Storybook story id, source SHA, and reference
 * eligibility. The Pen lane must derive counts (e.g. the number of design
 * references) from this receipt instead of hardcoding them.
 *
 * The builder is pure: callers that can read the filesystem inject a
 * `hashSource` function to attach per-screen source SHAs.
 */

import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_RECIPE_REGISTRY,
  APP_SCREEN_REGISTRY,
  type AppScreenComponentId,
  type AppScreenComponentRegistryEntry,
  type AppScreenKind,
  type AppScreenRecipeId,
  type AppScreenRecipeRegistryEntry,
} from './registry';
import { validateAppScreenSystem } from './validation';

export const APP_SCREEN_PEN_EXPORT_SCHEMA = 'app-screen-pen-export/v1';

export interface AppScreenPenExportScreen {
  readonly id: string;
  readonly route: string;
  readonly source: string;
  readonly kind: AppScreenKind;
  readonly conceptId: string;
  readonly recipeId: AppScreenRecipeId;
  readonly componentIds: readonly AppScreenComponentId[];
  readonly storyId: string | null;
  readonly sourceSha: string | null;
  readonly designReference: boolean;
  readonly redirectTo: string | null;
}

export interface AppScreenPenExport {
  readonly schema: typeof APP_SCREEN_PEN_EXPORT_SCHEMA;
  readonly counts: {
    readonly screens: number;
    readonly designReferences: number;
    readonly components: number;
    readonly recipes: number;
  };
  readonly components: readonly AppScreenComponentRegistryEntry[];
  readonly recipes: readonly AppScreenRecipeRegistryEntry[];
  readonly screens: readonly AppScreenPenExportScreen[];
}

export interface AppScreenPenExportInput {
  /** Returns the content SHA (e.g. sha256 hex) for a screen source path. */
  readonly hashSource?: (source: string) => string;
}

/**
 * Build the deterministic Pen receipt. Fails closed: an invalid registry
 * throws instead of emitting a receipt the Pen lane could trust.
 */
export function buildAppScreenPenExport(
  input: AppScreenPenExportInput = {}
): AppScreenPenExport {
  const issues = validateAppScreenSystem();
  if (issues.length > 0) {
    throw new Error(
      [
        'Cannot build app-screen Pen export from an invalid registry:',
        ...issues.map(issue => `- [${issue.code}] ${issue.message}`),
      ].join('\n')
    );
  }

  const recipeComponents = new Map(
    APP_SCREEN_RECIPE_REGISTRY.map(recipe => [recipe.id, recipe.componentIds])
  );

  const screens = [...APP_SCREEN_REGISTRY]
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(screen => ({
      id: screen.id,
      route: screen.route,
      source: screen.source,
      kind: screen.kind,
      conceptId: screen.conceptId,
      recipeId: screen.recipeId,
      componentIds: recipeComponents.get(screen.recipeId) ?? [],
      storyId: screen.story?.id ?? null,
      sourceSha: input.hashSource?.(screen.source) ?? null,
      designReference: screen.designReference,
      redirectTo: screen.redirectTo,
    }));

  return {
    schema: APP_SCREEN_PEN_EXPORT_SCHEMA,
    counts: {
      screens: screens.length,
      designReferences: screens.filter(screen => screen.designReference).length,
      components: APP_SCREEN_COMPONENT_REGISTRY.length,
      recipes: APP_SCREEN_RECIPE_REGISTRY.length,
    },
    components: APP_SCREEN_COMPONENT_REGISTRY,
    recipes: APP_SCREEN_RECIPE_REGISTRY,
    screens,
  };
}
