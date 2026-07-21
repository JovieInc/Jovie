import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { SYSTEM_B_DESKTOP_TOKENS } from '../src/system-b-tokens.ts';

const webRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'web'
);
const designSystemCss = readFileSync(
  join(webRoot, 'styles', 'design-system.css'),
  'utf8'
);

// Desktop tokens strip whitespace inside rgba(); normalize before comparing.
function normalize(value: string): string {
  return value.replace(/\s+/g, '');
}

function readCssVar(name: string, fromCss: string): string {
  const match = fromCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} not found in design-system.css`);
  return match[1].trim();
}

// System-B dark-mode source of truth: the `.dark` block in design-system.css
// (the desktop app is always dark). These assertions guard against token
// drift between the web design system and the desktop tokens module.
describe('SYSTEM_B_DESKTOP_TOKENS stays aligned with web design-system.css', () => {
  test('borderSubtle matches --linear-border-subtle', () => {
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.borderSubtle)).toBe(
      normalize(readCssVar('--linear-border-subtle', designSystemCss))
    );
  });

  test('textSecondary matches --linear-text-secondary', () => {
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.textSecondary)).toBe(
      normalize(readCssVar('--linear-text-secondary', designSystemCss))
    );
  });

  test('shadowPopover matches the dark-mode --shadow-popover', () => {
    // --shadow-popover is defined twice (light default + dark override);
    // the desktop shell is dark, so compare against the last (dark) value.
    const matches = [
      ...designSystemCss.matchAll(/--shadow-popover:\s*([^;]+);/gs),
    ];
    expect(matches.length).toBeGreaterThan(1);
    const darkValue = matches[matches.length - 1][1].trim();
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.shadowPopover)).toBe(
      normalize(darkValue)
    );
  });
});
