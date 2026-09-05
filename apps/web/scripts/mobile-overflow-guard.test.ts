import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findMobileOverflowViolations,
  scanSourceFile,
} from './mobile-overflow-guard.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const globals = 'apps/web/app/globals.css';
const owner = 'packages/ui/lib/overlay-styles.ts';
const utility =
  '@utility w-overlay-viewport {\n  width: calc(100vw - var(--space-8));\n}';
const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true });
});

describe('audited overlay width exception', () => {
  it('accepts only the current geometry contract without changing source', () => {
    expect(
      scanSourceFile(globals, readFileSync(join(repoRoot, globals), 'utf8'))
    ).toEqual([]);
    expect(
      scanSourceFile(owner, readFileSync(join(repoRoot, owner), 'utf8'))
    ).toEqual([]);
    const tokens = readFileSync(
      join(repoRoot, 'apps/web/styles/design-system.css'),
      'utf8'
    );
    expect(
      [...tokens.matchAll(/--space-8:\s*([^;]+);/g)].map(match => match[1])
    ).toEqual(['2rem']);
    expect(scanSourceFile(globals, utility.replaceAll(' ', '\t'))).toEqual([]);
  });

  // Seven negative groups protect the narrow exception and the existing scanner.
  it.each([
    ['apps/web/components/example.css', utility],
    [globals, utility.replace('w-overlay-viewport', 'w-other-overlay')],
    [globals, `@media (min-width: 1px) {\n${utility}\n}`],
  ])('rejects the utility outside its exact file and top-level owner: %s', (file, css) => {
    expect(scanSourceFile(file, css)).toHaveLength(1);
  });

  it.each([
    '100vw',
    'calc(100vw + var(--space-8))',
    'calc(100vw - var(--space-4))',
    'calc(100vw - 2rem)',
    'calc(100vw-var(--space-8))',
    'calc(100vw -var(--space-8))',
  ])('rejects an unaudited width value: %s', value => {
    expect(
      scanSourceFile(
        globals,
        utility.replace('calc(100vw - var(--space-8))', value)
      )
    ).toHaveLength(1);
  });

  it.each([
    'min-width: 100vw;',
    'padding: 1rem;',
    'width: 100vw;',
  ])('rejects additional declarations: %s', extra => {
    expect(
      scanSourceFile(globals, utility.replace('\n}', `\n${extra}\n}`))
    ).toHaveLength(1);
  });

  it('rejects duplicate utility blocks and important overrides', () => {
    expect(scanSourceFile(globals, `${utility}\n${utility}`)).toHaveLength(1);
    expect(
      scanSourceFile(globals, utility.replace(';', ' !important;'))
    ).toHaveLength(1);
  });

  it.each([
    'before',
    'after',
  ])('still reports another risky declaration %s the allowed block at the original line', position => {
    const risky = '.unrelated {\n  width: 100vw;\n}';
    const css =
      position === 'before' ? `${risky}\n${utility}` : `${utility}\n${risky}`;
    const violations = scanSourceFile(globals, css);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('width: 100vw');
    // Existing scanner reports the opening delimiter's line, preserved by masking.
    expect(violations[0].line).toBe(position === 'before' ? 1 : 4);
  });

  it('rejects new consumers and removal of the audited owner constraints', () => {
    expect(
      scanSourceFile(
        'apps/web/components/Unconstrained.tsx',
        "<div className='w-overlay-viewport' />"
      )[0].rule
    ).toContain('unaudited');
    expect(
      scanSourceFile(
        globals,
        `${utility}\n.unconstrained { @apply w-overlay-viewport; }`
      ).some(item => item.rule.includes('unaudited'))
    ).toBe(true);
    const original = readFileSync(join(repoRoot, owner), 'utf8');
    for (const changed of [
      original.replace('fixed left-1/2', 'absolute left-0'),
      original.replace('max-w-lg', 'max-w-none'),
    ]) {
      expect(
        scanSourceFile(owner, changed).some(item =>
          item.rule.includes('unaudited')
        )
      ).toBe(true);
    }
  });

  it.each([
    'w-screen',
    'min-w-screen',
    'w-[100vw]',
    'min-w-[100vw]',
    'left-0 right-0 w-screen',
  ])('preserves existing Tailwind rejection: %s', className => {
    expect(
      scanSourceFile(
        'apps/web/components/Risky.tsx',
        `const classes = ' ${className} ';`
      ).length
    ).toBeGreaterThan(0);
  });

  it('keeps unrelated safe styles and the existing home exception unchanged', () => {
    expect(
      scanSourceFile(
        'apps/web/app/safe.css',
        '.safe { width: 100%; max-width: 100vw; }'
      )
    ).toEqual([]);
    expect(
      scanSourceFile(
        'apps/web/app/(home)/home.css',
        '.existing { width: 100vw; }'
      )
    ).toEqual([]);
    expect(
      scanSourceFile('apps/web/lib/example.ts', "const className = 'w-full';")
    ).toEqual([]);
    expect(scanSourceFile('README.md', 'width:100vw')).toEqual([]);
    expect(() =>
      scanSourceFile(globals, '@utility w-overlay-viewport {')
    ).toThrow();
  });

  it('runs actual file discovery across app, component and package owners and ignores tests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-overflow-guard-'));
    temporaryRoots.push(root);
    const files = {
      [globals]: `${utility}\n.other { min-width: 100vw; }`,
      'apps/web/components/Risky.tsx': "const classes = ' w-screen ';",
      'apps/web/components/Ignored.test.tsx': "const classes = ' w-screen ';",
      'packages/ui/lib/new-overlay.ts': "const classes = 'w-overlay-viewport';",
    };
    for (const [file, content] of Object.entries(files)) {
      const target = join(root, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const violations = await findMobileOverflowViolations(root);
    expect(violations.map(item => item.filePath).sort()).toEqual(
      [
        globals,
        'apps/web/components/Risky.tsx',
        'packages/ui/lib/new-overlay.ts',
      ].sort()
    );
    expect(violations.find(item => item.filePath === globals)?.rule).toBe(
      'min-width: 100vw'
    );
  });
});
