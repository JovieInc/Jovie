import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DESIGN_SYSTEM_CSS = join(process.cwd(), 'styles', 'design-system.css');

const INPUT_FOCUS_SELECTOR = `:where(
  input,
  textarea,
  select,
  [contenteditable="true"],
  [role="textbox"]
):focus-visible`;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NORMALIZED_INPUT_FOCUS_SELECTOR = INPUT_FOCUS_SELECTOR.replace(
  /\s+/g,
  ' '
).trim();

describe('Input focus cascade contract', () => {
  it('keeps the generic input focus suppression in the base layer', () => {
    const css = readFileSync(DESIGN_SYSTEM_CSS, 'utf8');
    const normalizedCss = css.replace(/\s+/g, ' ');
    const inputFocusRule = new RegExp(
      `${escapeRegExp(NORMALIZED_INPUT_FOCUS_SELECTOR)}\\s*\\{[^}]*\\}`,
      'g'
    );
    const matches = [...normalizedCss.matchAll(inputFocusRule)];

    expect(matches).toHaveLength(1);
    expect(matches[0][0]).toMatch(/box-shadow:\s*none;/);

    const ruleStart = matches[0].index ?? -1;
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(normalizedCss.lastIndexOf('@layer base', ruleStart)).toBeGreaterThan(
      normalizedCss.lastIndexOf('}', ruleStart)
    );
  });
});
