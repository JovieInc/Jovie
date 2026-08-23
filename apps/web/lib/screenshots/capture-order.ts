import type { ScreenshotScenario } from './types';

/** Stable dependency order for scenarios that render another scenario's export. */
export function orderScreenshotScenariosForCapture(
  scenarios: readonly ScreenshotScenario[]
): readonly ScreenshotScenario[] {
  const scenariosById = new Map(
    scenarios.map(scenario => [scenario.id, scenario] as const)
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: ScreenshotScenario[] = [];

  const visit = (scenario: ScreenshotScenario) => {
    if (visited.has(scenario.id)) return;
    if (visiting.has(scenario.id)) {
      throw new Error(`Screenshot capture dependency cycle at ${scenario.id}`);
    }

    visiting.add(scenario.id);
    for (const dependencyId of scenario.captureAfter ?? []) {
      const dependency = scenariosById.get(dependencyId);
      if (!dependency) {
        throw new Error(
          `Unknown screenshot capture dependency ${dependencyId} for ${scenario.id}`
        );
      }
      visit(dependency);
    }
    visiting.delete(scenario.id);
    visited.add(scenario.id);
    ordered.push(scenario);
  };

  for (const scenario of scenarios) visit(scenario);
  return ordered;
}
