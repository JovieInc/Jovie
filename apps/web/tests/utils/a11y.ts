import { run as axeRun, type RunOptions } from 'axe-core';
import { expect } from 'vitest';

/**
 * Run axe-core accessibility audit on a container element.
 * Asserts zero violations. On failure, prints each violation with
 * its impact level, rule id, description, and affected HTML nodes.
 *
 * `options` is passed to axe as is. A component that renders a third-party
 * iframe (an embed) passes `{ iframes: false }`: jsdom never loads the
 * frame, and axe cannot message into it. The iframe element itself is
 * still audited (frame-title and the rest), only its document is skipped.
 */
export async function expectNoA11yViolations(
  container: Element,
  options?: RunOptions
): Promise<void> {
  const results = options
    ? await axeRun(container, options)
    : await axeRun(container);
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
