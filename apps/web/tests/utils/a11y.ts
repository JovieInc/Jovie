import { run as axeRun } from 'axe-core';
import { expect } from 'vitest';

/**
 * Run axe-core accessibility audit on a container element.
 * Asserts zero violations. On failure, prints each violation with
 * its impact level, rule id, description, and affected HTML nodes.
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
}
