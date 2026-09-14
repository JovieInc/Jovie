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
// Match the same marker-owned block as the web Noir Ion contract, including
// selector lists and nested rules. The selector no longer ends at the attribute.
function extractShellWorkspaceBlock(css: string): string {
  const marker = 'NOIR ION D — workspace state surfaces (shell-scoped)';
  const markerIndex = css.indexOf(marker);
  if (markerIndex === -1) throw new Error('Noir Ion D marker not found');
  const fromMarker = css.slice(markerIndex);
  const selectorStart = fromMarker.search(
    /\[data-app-shell-frame=(['"])true\1\]/
  );
  if (selectorStart === -1)
    throw new Error('Shell workspace selector not found');
  const blockStart = fromMarker.lastIndexOf('\n', selectorStart) + 1;
  const openBrace = fromMarker.indexOf('{', blockStart);
  if (openBrace === -1) throw new Error('Shell workspace block not found');
  const selectors = fromMarker.slice(blockStart, openBrace).trim().split(',');
  if (
    !selectors.every(selector =>
      /^(?:\.dark\s+)?\[data-app-shell-frame=(['"])true\1\](?:\.dark)?$/.test(
        selector.trim()
      )
    )
  ) {
    throw new Error('Unexpected shell workspace selector');
  }
  let depth = 0;
  for (let i = openBrace; i < fromMarker.length; i++) {
    const ch = fromMarker[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return fromMarker.slice(blockStart, i + 1);
    }
  }
  throw new Error('Unclosed shell workspace block');
}

const appShellFrameBlock = extractShellWorkspaceBlock(systemBAppCss);

const workspaceMarker =
  '/* NOIR ION D — workspace state surfaces (shell-scoped) */';

// Noir Ion dark-mode anchors live in the :root.dark block that carries the
// surface ladder. A file-wide first match can instead hit the light :root
// alias block (shared marketing chrome), which points
// --noir-ion-text-secondary back at var(--color-text-secondary-token) —
// itself projected from the Noir Ion anchors — so scope the read to the
// dark block, the same marker-owned extraction the web Noir Ion contract
// uses for --noir-ion-canvas.
function extractDarkNoirIonBlock(css: string): string {
  const blocks = css.match(/:root\.dark(?:\s*,[^{]+)?\s*\{[\s\S]*?\n\}/g) ?? [];
  const hit = blocks.find(block => block.includes('--noir-ion-canvas:'));
  if (!hit) throw new Error('Noir Ion dark block not found in web canon CSS');
  return hit;
}

const darkNoirIonBlock = extractDarkNoirIonBlock(designSystemCss);

describe('shell workspace CSS extraction', () => {
  test.each(['"', "'"])(
    'reads the marker-owned dark selector list with %s quotes',
    quote => {
      const frame = `[data-app-shell-frame=${quote}true${quote}]`;
      const block = `.dark ${frame},\n${frame}.dark {
  --color-border-subtle: expected;
  &:hover { --nested: value; }
  --shadow-popover: expected-shadow;
}`;
      const css = `${frame} { --color-border-subtle: wrong; }
${workspaceMarker}
${block}
.unrelated { --shadow-popover: wrong; }`;
      const extracted = extractShellWorkspaceBlock(css);
      expect(extracted).toBe(block);
      expect(readCssVar('--shadow-popover', extracted)).toBe('expected-shadow');
    }
  );

  test.each([
    ['', 'Noir Ion D marker not found'],
    [workspaceMarker, 'Shell workspace selector not found'],
    [
      `${workspaceMarker}\n[data-app-shell-frame="true"].dark`,
      'Shell workspace block not found',
    ],
    [
      `${workspaceMarker}\n[data-app-shell-frame="true"].dark {`,
      'Unclosed shell workspace block',
    ],
    [
      `${workspaceMarker}\n[data-app-shell-frame="true"].dark
.unrelated { --color-border-subtle: wrong; }`,
      'Unexpected shell workspace selector',
    ],
  ])('rejects missing or incomplete workspace CSS (%s)', (css, message) => {
    expect(() => extractShellWorkspaceBlock(css)).toThrow(message);
  });
});

describe('dark Noir Ion block extraction', () => {
  const darkBlock = `:root.dark {
  --noir-ion-canvas: #030407;
  --noir-ion-text-secondary: #d7dce8;
}`;

  test('reads the anchor-owned dark block, not an earlier light alias', () => {
    const css = `:root {
  --noir-ion-text-secondary: var(--color-text-secondary-token);
}
${darkBlock}`;
    const extracted = extractDarkNoirIonBlock(css);
    expect(readCssVar('--noir-ion-text-secondary', extracted)).toBe('#d7dce8');
  });

  test('rejects CSS without the anchor-owned dark block', () => {
    expect(() =>
      extractDarkNoirIonBlock(':root { --noir-ion-canvas: #030407; }')
    ).toThrow('Noir Ion dark block not found in web canon CSS');
  });
});

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
      normalize(readCssVar('--noir-ion-text-secondary', darkNoirIonBlock))
    );
  });

  test('shadowPopover matches the app-shell frame --shadow-popover', () => {
    expect(normalize(SYSTEM_B_DESKTOP_TOKENS.shadowPopover)).toBe(
      normalize(readCssVar('--shadow-popover', appShellFrameBlock))
    );
  });

  test('splash-B mark size and cream stay locked to the web brand tokens', () => {
    const webBrandTokens = readFileSync(
      join(webRoot, 'lib', 'brand', 'tokens.ts'),
      'utf8'
    );
    expect(SYSTEM_B_DESKTOP_TOKENS.splashMarkSizePx).toBe(32);
    expect(SYSTEM_B_DESKTOP_TOKENS.markCream).toBe('#F5F4F0');
    expect(webBrandTokens).toMatch(/splash:\s*32/);
    expect(webBrandTokens).toMatch(/export const BRAND_MARK_CREAM = '#F5F4F0'/);
  });
});
