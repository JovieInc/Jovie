import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, '..', '..', '..');
const listPath = resolve(webRoot, 'tests/node-environment-files.json');

const listedFiles: unknown = JSON.parse(readFileSync(listPath, 'utf8'));

// The selection heuristic used to build tests/node-environment-files.json:
// any reference to the DOM, browser APIs, React, components, hooks, or an
// explicit environment pragma keeps a file on jsdom. A listed file that starts
// matching must be removed from the list (or rewritten to stay DOM-free).
const DOM_OR_REACT_REFERENCE = new RegExp(
  [
    'document',
    'window',
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
    'location\\.',
    'jsdom',
    'DOMParser',
    'renderHook',
    '\\brender\\(',
    'screen\\.',
    'userEvent',
    'KeyboardEvent',
    'MouseEvent',
    'CustomEvent',
    '\\.tsx[\'"]',
    'react-dom',
    'Image\\(',
    'FileReader',
    'createObjectURL',
    'dispatchEvent',
    'addEventListener',
    'innerHTML',
    'getComputedStyle',
    'scrollTo',
    '@/components',
    'components/',
    'React',
    'jsx',
    '\\bhooks?/',
    'use[A-Z]\\w+\\(',
    '@vitest-environment',
    'FormData',
    'File\\(',
    'DOMException',
    'atob',
    'btoa',
    'HTMLCanvas',
    'canvas',
    '\\bNode\\b',
    'MutationObserver',
    '@/app/.*/(page|layout)',
    "from '\\./[A-Z]",
    "from '@/lib/hooks",
    'posthog-js',
    'client',
  ].join('|')
);

// tests/setup-optimized.ts registers jest-dom matchers only when a DOM
// exists, so node-environment files must not call any of them.
const JEST_DOM_MATCHER_CALL = new RegExp(
  `\\.(${Object.keys(jestDomMatchers).join('|')})\\(`
);

function files(): string[] {
  expect(Array.isArray(listedFiles)).toBe(true);
  return listedFiles as string[];
}

describe('tests/node-environment-files.json', () => {
  it('is a non-empty, sorted, duplicate-free list of relative test paths', () => {
    const list = files();
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(typeof entry).toBe('string');
      expect(entry).toMatch(/^[^./\\][^\\]*\.test\.(c|m)?[jt]s$/);
    }
    expect(new Set(list).size).toBe(list.length);
    expect(list).toEqual([...list].sort());
  });

  it('lists only files that exist', () => {
    const stale = files().filter(entry => !existsSync(resolve(webRoot, entry)));
    expect(stale).toEqual([]);
  });

  it('lists only files free of DOM, browser-API, and React references', () => {
    const domBound = files().flatMap(entry => {
      const path = resolve(webRoot, entry);
      // Missing entries are reported by the stale-list check above.
      if (!existsSync(path)) return [];
      const match = readFileSync(path, 'utf8').match(DOM_OR_REACT_REFERENCE);
      return match ? [`${entry} (references "${match[0]}")`] : [];
    });
    expect(domBound).toEqual([]);
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
    expect(config).toMatch(
      /name: 'node',\s*environment: 'node',\s*include: nodeEnvironmentGlobs/
    );
    expect(config).toMatch(
      /name: 'jsdom',\s*environment: 'jsdom',\s*exclude: nodeEnvironmentGlobs/
    );
    expect(config).toContain('projects: environmentProjects,');
  });
});
