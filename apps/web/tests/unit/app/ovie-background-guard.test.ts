import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Next.js already types import.meta.glob. Avoid vite/client: its wildcard asset
// declarations would mask unresolved assets elsewhere in the test typecheck.

const workspaceCss = readFileSync(
  resolve(__dirname, '../../../styles/system-b-app.css'),
  'utf8'
);

// Track the stylesheet without blanket CSS/asset module declarations. Vitest
// stubs CSS, so assertions use the actual text read above rather than its import.
const stylesheetOwner = import.meta.glob('/styles/system-b-app.css', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Eager raw imports put every guarded component in the affected module graph.
const canvasOwners = import.meta.glob<string>(
  [
    '/app/app/\\(shell\\)/admin/**/*.tsx',
    '/components/features/admin/layout/**/*.tsx',
    '/components/features/admin/hud/**/*.tsx',
    '/components/organisms/home-loop/**/*.tsx',
    '/components/organisms/{AuthShell,AppShellFrame,AppShellSkeleton,AppShellContentPanel,PageShell}.tsx',
    '!**/*.test.*',
    '!**/*.stories.*',
  ],
  { eager: true, query: '?raw', import: 'default' }
);
const read = (file: string) => {
  const source = canvasOwners[file];
  if (source === undefined) throw new Error(`Missing canvas source: ${file}`);
  return source;
};
const shellFrameSelector = '.dark [data-app-shell-frame="true"]';
const shellFrameMarker = 'NOIR ION D — workspace state surfaces (shell-scoped)';

function extractShellFrameBlock(css: string): string {
  const markerIndex = css.indexOf(shellFrameMarker);
  expect(markerIndex, 'shell frame Noir Ion marker').toBeGreaterThan(-1);
  const fromMarker = css.slice(markerIndex);
  const selectorStart = fromMarker.search(
    /\[data-app-shell-frame=(['"])true\1\]/
  );
  expect(selectorStart).toBeGreaterThan(-1);
  const blockStart = fromMarker.lastIndexOf('\n', selectorStart) + 1;
  const openBrace = fromMarker.indexOf('{', blockStart);
  let depth = 0;
  for (let i = openBrace; i < fromMarker.length; i++) {
    const ch = fromMarker[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return fromMarker.slice(blockStart, i + 1);
    }
  }
  throw new Error('Unclosed shell frame block');
}

function rawBackgrounds(source: string) {
  const utilityOrDirectColor =
    source.match(
      /\bbg-(?:\[(?!(?:var\(|--))[^\]]+\]|(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?)(?:\/[^\s'"`]+)?|\bbackground(?:Color|-color)?\s*:\s*['"`]?(?:#[\da-f]+|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^;}'"`]+|(?:white|black|navy)\b)/gi
    ) ?? [];
  // Inspect complete literal values so named colors and gradient stops cannot
  // hide behind a shorthand. Unquoted JS expressions remain token-owned values.
  const declarations = [
    ...source.matchAll(
      /\bbackground(?:Color|Image)?\s*:\s*(['"`])([\s\S]*?)\1/g
    ),
    ...source.matchAll(/\bbackground(?:-color|-image)?\s*:\s*()([^;}]+);/g),
  ];
  const literalColors = declarations.filter(([, , value = '']) => {
    const colorLiteral =
      /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i;
    const keyword =
      /^(?:transparent|currentcolor|inherit|initial|unset|revert(?:-layer)?|none)$/i;
    const trimmed = value.trim();
    return (
      colorLiteral.test(trimmed) ||
      (/^[a-z-]+$/i.test(trimmed) && !keyword.test(trimmed))
    );
  });
  return [...utilityOrDirectColor, ...literalColors.map(([match]) => match)];
}

describe('Ovie Home and dashboard background contract', () => {
  it('shares the dark shell-frame ZiaWI ladder (no Ovie-only carbon override)', () => {
    // Drift T1.1: Ovie no longer needs a parallel workspace palette; the
    // authenticated shell frame binds every workspace to --noir-ion-*.
    expect(workspaceCss).not.toContain('.dark [data-app-shell-workspace="ov"]');
    const block = extractShellFrameBlock(workspaceCss);
    const selectors = block.slice(0, block.indexOf('{')).trim();
    expect(selectors).toContain(shellFrameSelector);

    const theme = document.createElement('div');
    const frame = document.createElement('div');
    frame.dataset.appShellFrame = 'true';
    theme.append(frame);
    for (const mode of ['light', 'dark']) {
      theme.className = mode;
      for (const workspace of ['ov', 'jovie']) {
        frame.dataset.appShellWorkspace = workspace;
        expect(frame.matches(selectors), `${mode} ${workspace}`).toBe(
          mode === 'dark'
        );
      }
    }
    theme.className = '';
    frame.className = 'dark';
    expect(frame.matches(selectors)).toBe(true);
  });

  it('uses the canonical Noir Ion canvas throughout the Ovie shell', () => {
    expect(Object.keys(stylesheetOwner)).toEqual(['/styles/system-b-app.css']);
    expect(Object.keys(canvasOwners).length).toBeGreaterThan(40);
    const block = extractShellFrameBlock(workspaceCss);
    expect(block).toContain(
      '--app-shell-content-surface: var(--noir-ion-card)'
    );
    expect(block).toContain('--color-bg-surface-0: var(--noir-ion-shell)');
    expect(block).toContain('--color-bg-surface-1: var(--noir-ion-card)');
    expect(block).toContain('--color-bg-surface-2: var(--noir-ion-elevated)');
    expect(block).toContain('--color-bg-surface-3: var(--noir-ion-floating)');
    // Surface ladder values must be noir-ion aliases (not carbon hexes).
    expect(block).not.toMatch(/#101114|#0b0c0f|#14161a|#1b1d22|#24272d/i);
    expect(read('/components/organisms/AppShellFrame.tsx')).toContain(
      "data-app-shell-workspace={brandVariant === 'ov' ? 'ov' : undefined}"
    );
    const surfaceValues = [
      ...block.matchAll(
        /--(?:app-shell-content-surface|color-bg-surface-\d|color-bg-elevated|color-bg-tooltip|color-bg-input|color-skeleton-base):\s*([^;]+);/g
      ),
    ].map(match => match[1]);
    expect(surfaceValues.length).toBeGreaterThanOrEqual(8);
    for (const value of surfaceValues) {
      expect(value).toMatch(/^var\(--noir-ion-[\w-]+\)$/);
    }
  });

  it.each(['dock', 'surface', 'scroll-fade'])(
    'bans raw fills in shared composer %s rules consumed by Ovie',
    role => {
      const rules = [
        ...workspaceCss.matchAll(
          new RegExp(
            `:where\\(\\.system-b-chat-composer-${role}[^{}]*\\{([^}]+)\\}`,
            'g'
          )
        ),
      ];
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules)
        expect(rawBackgrounds(rule[1] ?? '')).toEqual([]);
    }
  );

  it('leaves Ovie Home paint with the shell instead of layering ambient washes', () => {
    expect(read('/app/app/(shell)/admin/chat/OvChatClient.tsx')).toMatch(
      /\sambientOwnedByShell\s/
    );
    expect(read('/components/organisms/AuthShell.tsx')).toContain(
      "chatAmbientGradient={isChatRoute && section !== 'ov'}"
    );
  });

  it.each(Object.keys(canvasOwners))(
    'bans raw background colors in %s',
    file => {
      expect(rawBackgrounds(read(file)), file).toEqual([]);
    }
  );

  it.each([
    'bg-[#101114]',
    'hover:bg-white/5',
    'dark:bg-zinc-950',
    'bg-[rgb(1_2_3)]',
    'background: #101114;',
    "backgroundColor: 'rgba(1, 2, 3, 0.5)'",
    'background-color: navy;',
    "backgroundColor: 'orange'",
    "background: 'linear-gradient(#101114, #14161a)'",
    'background: linear-gradient(#101114, #14161a);',
    'background-color: orange;',
  ])('rejects a raw background regression: %s', source => {
    expect(rawBackgrounds(source)).not.toEqual([]);
  });

  it.each([
    'bg-surface-1',
    'bg-(--app-shell-content-surface)',
    'bg-transparent',
    'background: var(--system-b-app-content-surface);',
    "backgroundColor: 'transparent'",
    "background: 'linear-gradient(var(--color-bg-surface-1), transparent)'",
    'background: inherit;',
  ])('allows semantic backgrounds: %s', source => {
    expect(rawBackgrounds(source)).toEqual([]);
  });
});
