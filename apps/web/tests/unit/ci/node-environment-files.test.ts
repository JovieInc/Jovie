import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..');
const listPath = resolve(webRoot, 'tests/node-environment-files.json');

const listedFiles: unknown = JSON.parse(readFileSync(listPath, 'utf8'));

// The selection heuristic used to build tests/node-environment-files.json:
// any reference to the DOM, browser APIs, React, component/hook imports, or an
// explicit environment pragma keeps a file on jsdom. A selected file that
// starts matching must leave the list (or its directory entry must be split).
// Word boundaries keep identifiers such as `windowStart`, `readFile(`,
// `clientTurnId` and `vi.useFakeTimers(` from reading as DOM or hook usage;
// every selected file is also verified to pass under node before it is added.
const DOM_OR_REACT_REFERENCE = new RegExp(
  [
    '\\bdocument\\b',
    '\\bwindow\\b',
    'navigator',
    'localStorage',
    'sessionStorage',
    '@testing-library',
    'HTMLElement',
    '\\bElement\\b',
    'matchMedia',
    'requestAnimationFrame',
    'IntersectionObserver',
    'ResizeObserver',
    'location\\??\\.',
    'jsdom',
    'DOMParser',
    'renderHook',
    '\\brender\\(',
    'screen\\.',
    'userEvent',
    'KeyboardEvent',
    'MouseEvent',
    'CustomEvent',
    'react-dom',
    'Image\\(',
    'FileReader',
    'createObjectURL',
    'dispatchEvent',
    'addEventListener',
    'innerHTML',
    'getComputedStyle',
    'scrollTo',
    'React',
    '(?<!vi\\.)\\buse[A-Z]\\w+\\(',
    '@vitest-environment',
    'FormData',
    '\\bFile\\(',
    'DOMException',
    'atob',
    'btoa',
    'HTMLCanvas',
    'OffscreenCanvas',
    'getContext\\(',
    '\\bNode\\.',
    'instanceof Node\\b',
    'MutationObserver',
    '@/app/.*/(page|layout)',
    "from '\\./[A-Z]",
    "from '@/lib/hooks",
    'posthog-js',
    '[\'"]use client[\'"]',
    // Module specifiers that load components, hooks, TSX/JSX, or the browser
    // auth client. The same paths inside plain strings (source-contract tests
    // that read .tsx files as text) do not load them and do not count.
    '(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*)[\'"][^\'"]*(?:components/|\\bhooks?/|\\.[jt]sx[\'"]|/auth/client[\'"])',
  ].join('|')
);

// tests/setup-optimized.ts registers jest-dom matchers only when a DOM
// exists, so node-environment files must not call any of them.
const JEST_DOM_MATCHER_CALL = new RegExp(
  `\\.(${Object.keys(jestDomMatchers).join('|')})\\(`
);

function entries(): string[] {
  expect(Array.isArray(listedFiles)).toBe(true);
  return listedFiles as string[];
}

// Mirrors vitest.config.fast.mts: a `dir/` entry selects `dir/**/*.test.ts`.
function testFilesUnder(dir: string): string[] {
  return readdirSync(resolve(webRoot, dir), { recursive: true })
    .map(String)
    .filter(file => file.endsWith('.test.ts') && !file.includes('node_modules'))
    .map(file => relative(webRoot, resolve(webRoot, dir, file)))
    .sort();
}

function isDirectoryEntry(entry: string): boolean {
  return entry.endsWith('/');
}

// Every file the node project selects, with directory entries expanded.
function files(): string[] {
  return entries().flatMap(entry => {
    if (!isDirectoryEntry(entry)) return [entry];
    return existsSync(resolve(webRoot, entry)) ? testFilesUnder(entry) : [];
  });
}

describe('tests/node-environment-files.json', () => {
  it('is a non-empty, sorted, duplicate-free list of relative test paths', () => {
    const list = entries();
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(typeof entry).toBe('string');
      expect(entry).toMatch(/^[^./\\][^\\]*(\.test\.(c|m)?[jt]s|\/)$/);
    }
    expect(new Set(list).size).toBe(list.length);
    expect(list).toEqual([...list].sort());
  });

  it('lists only files and directories that exist', () => {
    const stale = entries().filter(entry => {
      const path = resolve(webRoot, entry);
      if (!existsSync(path)) return true;
      return isDirectoryEntry(entry) !== statSync(path).isDirectory();
    });
    expect(stale).toEqual([]);
  });

  it('keeps directory entries non-empty and file entries uncovered', () => {
    const directories = entries().filter(isDirectoryEntry);
    const empty = directories.filter(
      dir => existsSync(resolve(webRoot, dir)) && !testFilesUnder(dir).length
    );
    expect(empty).toEqual([]);
    const redundant = entries().filter(
      entry =>
        directories.some(dir => dir !== entry && entry.startsWith(dir)) &&
        (isDirectoryEntry(entry) || entry.endsWith('.test.ts'))
    );
    expect(redundant).toEqual([]);
  });

  it('selects only files free of DOM, browser-API, and React references', () => {
    const domBound = files().flatMap(entry => {
      const path = resolve(webRoot, entry);
      // Missing entries are reported by the stale-list check above.
      if (!existsSync(path)) return [];
      const match = readFileSync(path, 'utf8').match(DOM_OR_REACT_REFERENCE);
      return match ? [`${entry} (references "${match[0]}")`] : [];
    });
    expect(domBound).toEqual([]);
  });

  it('flags DOM and hook usage but not identifiers that only contain the words', () => {
    for (const domUsage of [
      'window.scrollTo(0, 0);',
      "if (typeof window === 'undefined') return;",
      "document.createElement('textarea');",
      'const origin = globalThis.location?.origin;',
      "new File(['a'], 'a.txt');",
      'const [open, setOpen] = useState(false);',
      "import { createAuthClient } from '@/lib/auth/client';",
      "'use client';",
      "import { Card } from '@/components/molecules/Card';",
      "const { Page } = await import('./Page.tsx');",
      "import { useThing } from '../hooks/useThing';",
      'if (node instanceof Node) return;',
    ]) {
      expect(domUsage).toMatch(DOM_OR_REACT_REFERENCE);
    }
    for (const lookalike of [
      "const windowStart = new Date('2026-01-01');",
      "await request('/api/library/documents');",
      "const source = await readFile('package.json', 'utf8');",
      'vi.useFakeTimers();',
      "const input = { clientTurnId: 'turn-1' };",
      "const source = readSource('components/shell/Card.tsx');",
      "vi.mock('@/lib/stripe/client', () => ({ stripe }));",
      "const redis = createLocalRedisClient('redis://127.0.0.1:6379');",
      'const parser = { ecmaFeatures: { jsx: true } };',
    ]) {
      expect(lookalike).not.toMatch(DOM_OR_REACT_REFERENCE);
    }
  });

  it('lists only files that use no jest-dom matchers', () => {
    expect(Object.keys(jestDomMatchers)).toContain('toBeInTheDocument');
    const matcherUsers = files().flatMap(entry => {
      const path = resolve(webRoot, entry);
      if (!existsSync(path)) return [];
      const match = readFileSync(path, 'utf8').match(JEST_DOM_MATCHER_CALL);
      return match ? [`${entry} (calls "${match[1]}")`] : [];
    });
    expect(matcherUsers).toEqual([]);
  });

  it('loads DOM testing setup only when a DOM exists', () => {
    const setup = readFileSync(
      resolve(webRoot, 'tests/setup-optimized.ts'),
      'utf8'
    );
    // No static import: node-environment files must not pay for jest-dom or
    // React Testing Library at setup time.
    expect(setup).not.toMatch(/^import[^;]*'@testing-library\//m);
    const guard = setup.indexOf("if (typeof window !== 'undefined') {");
    expect(guard).toBeGreaterThanOrEqual(0);
    for (const snippet of [
      "import('@testing-library/jest-dom/matchers')",
      "import('@testing-library/react')",
      'expect.extend(jestDomMatchers);',
      'cleanup();',
    ]) {
      expect(setup.indexOf(snippet)).toBeGreaterThan(guard);
    }
  });

  it('is wired into the unit config as a node-environment project', () => {
    const config = readFileSync(
      resolve(webRoot, 'vitest.config.fast.mts'),
      'utf8'
    );
    expect(config).toContain("'tests/node-environment-files.json'");
    expect(config).toContain("entry.endsWith('/') ? `${literal}**/*.test.ts`");
    expect(config).toMatch(
      /name: 'node',\s*environment: 'node',\s*include: nodeEnvironmentGlobs/
    );
    expect(config).toMatch(
      /name: 'jsdom',\s*environment: 'jsdom',\s*exclude: nodeEnvironmentGlobs/
    );
    expect(config).toContain('projects: environmentProjects,');
  });
});
