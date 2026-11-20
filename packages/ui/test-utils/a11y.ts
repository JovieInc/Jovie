import { run as axeRun } from 'axe-core';
import { expect } from 'vitest';

/**
 * Run an axe-core audit on a rendered container and assert zero violations.
 * Mirrors apps/web/tests/utils/a11y.ts so @jovie/ui atoms carry the same
 * a11y evidence the component certificate reads (`expectNoA11yViolations`).
 */
export async function expectNoA11yViolations(
  container: Element
): Promise<void> {
  const results = await axeRun(container);
  const { violations } = results;

  if (violations.length > 0) {
    const message = violations
      .map(
        v =>
          `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map(n => n.html).join('\n  ')}`
      )
      .join('\n\n');
    expect.fail(`Accessibility violations found:\n\n${message}`);
  }

  expect(violations).toHaveLength(0);
}
