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
const systemBAppCss = readFileSync(
  join(webRoot, 'styles', 'system-b-app.css'),
  'utf8'
);

// Desktop tokens strip whitespace inside rgba(); normalize before comparing.
function normalize(value: string): string {
  return value.replace(/\s+/g, '');
}

function readCssVar(name: string, fromCss: string): string {
  const match = fromCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} not found in web canon CSS`);
  return match[1].trim();
}

// System-B dark-mode source of truth (per DESIGN.md "App Colors — Dark
// Mode"): the Noir Ion anchors in design-system.css plus the authenticated
// app-shell frame overrides in system-b-app.css (`[data-app-shell-frame]`,
// JOV-4648 Noir Ion D). The desktop shell is always dark and mirrors the
// app-shell frame, so desktop tokens are contracted against those values.
// These assertions guard against token drift between the web design system
// and the desktop tokens module.
const appShellFrameBlock = (() => {
  const match = systemBAppCss.match(
    /\[data-app-shell-frame="true"\]\s*\{([^}]*)\}/s
  );
  if (!match) {
    throw new Error(
      '[data-app-shell-frame="true"] block not found in system-b-app.css'
    );
  }
  return match[1];
})();

describe('SYSTEM_B_DESKTOP_TOKENS stays aligned with web System-B canon', () => {
  test('borderSubtle matches the app-shell frame --color-border-subtle', () => {
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.borderSubtle)).toBe(
      normalize(readCssVar('--color-border-subtle', appShellFrameBlock))
    );
  });

  test('textSecondary matches the Noir Ion --noir-ion-text-secondary', () => {
    // The app-shell frame does not override text color; it inherits the dark
    // Noir Ion anchor (DESIGN.md: Text secondary #D7DCE8).
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.textSecondary)).toBe(
      normalize(readCssVar('--noir-ion-text-secondary', designSystemCss))
    );
  });

  test('shadowPopover matches the app-shell frame --shadow-popover', () => {
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.shadowPopover)).toBe(
      normalize(readCssVar('--shadow-popover', appShellFrameBlock))
    );
  });
});
