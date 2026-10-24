import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
const selector = '.dark [data-app-shell-workspace="ov"]';

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
  it('limits the palette override to dark Ovie frames, including placeholders', () => {
    const start = workspaceCss.indexOf(selector);
    const selectors = workspaceCss.slice(
      start,
      workspaceCss.indexOf('{', start)
    );
    const theme = document.createElement('div');
    const frame = document.createElement('div');
    theme.append(frame);
    for (const mode of ['light', 'dark']) {
      theme.className = mode;
      for (const workspace of ['ov', 'jovie']) {
        frame.dataset.appShellWorkspace = workspace;
        expect(frame.matches(selectors), `${mode} ${workspace}`).toBe(
          mode === 'dark' && workspace === 'ov'
        );
      }
    }
    theme.className = '';
    frame.dataset.appShellWorkspace = 'ov';
    frame.className = 'dark';
    expect(frame.matches(selectors)).toBe(true);
  });

  it('uses the canonical Noir Ion canvas throughout the Ovie shell', () => {
    expect(Object.keys(stylesheetOwner)).toEqual(['/styles/system-b-app.css']);
    expect(Object.keys(canvasOwners).length).toBeGreaterThan(40);
    const start = workspaceCss.indexOf(selector);
    expect(
      start,
      'Ovie must override the duplicate workspace graphite ramp'
    ).toBeGreaterThan(-1);
    const block = workspaceCss.slice(start, workspaceCss.indexOf('}', start));
    expect(block).toContain(
      '--app-shell-content-surface: var(--noir-ion-card)'
    );
    expect(block).toContain('--color-bg-surface-1: var(--noir-ion-card)');
    expect(rawBackgrounds(block)).toEqual([]);
    expect(read('/components/organisms/AppShellFrame.tsx')).toContain(
      "data-app-shell-workspace={brandVariant === 'ov' ? 'ov' : undefined}"
    );
    // Background definitions in this scoped override can only alias existing tokens.
    const values = [...block.matchAll(/--[\w-]+:\s*([^;]+);/g)].map(
      match => match[1]
    );
    expect(values.length).toBeGreaterThanOrEqual(8);
    for (const value of values) expect(value).toMatch(/^var\(--[\w-]+\)$/);
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
