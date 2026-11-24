/**
 * Every clickable presses through one shared utility (JOV-14459).
 *
 * The press is felt, not seen: `press` in tailwind-foundation.css scales to
 * --scale-press and darkens to --press-brightness on pointer down, then
 * springs back. This check keeps anything from escaping it.
 *
 *  (a) hardcoded-press: a literal press scale (`active:scale-95`,
 *      `active:scale-[0.97]`, `:active { transform: scale(0.9) }`,
 *      `whileTap={{ scale: 0.9 }}`) outside the token.
 *  (b) raw-clickable: a raw `<button>` or `role="button"` element in
 *      apps/web/components or packages/ui that carries neither the `press`
 *      utility nor a shared primitive (Button, IconButton, PlainButton, ...).
 *
 * Both sets are recorded in press-state.baseline.json and only shrink.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const PRESS_BASELINE =
  'scripts/invariants/art-direction/press-state.baseline.json';

const SOURCE_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/styles',
  'packages/ui',
];
const CLICKABLE_ROOTS = ['apps/web/components/', 'packages/ui/'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
  'generated',
  '__tests__',
  '__mocks__',
  'fixtures',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
/** The files that define the press. They own the utility by definition. */
const OWNERS = new Set([
  'apps/web/styles/design-system.css',
  'apps/web/styles/tailwind-foundation.css',
]);
/** Primitive implementations. Each renders `press` itself (unit-tested). */
const PRIMITIVE_FILES = new Set([
  'packages/ui/atoms/button.tsx',
  'packages/ui/atoms/plain-button.tsx',
  'packages/ui/atoms/title-menu-trigger.tsx',
]);

const SCALE_UTILITY =
  /(?<![\w-])(?:[\w-]+:)*(?:group-|peer-)?active:scale-(?!press\b|\[var\(--scale-press\)\])(?:\[[^\]\s]+\]|[\w./-]+)/g;
const TAILWIND_ARBITRARY = /(?<![\w-])active:\[scale:[^\]\s]+\]/g;
const WHILE_TAP = /whileTap\s*=\s*\{\{[^}]*scale\s*:\s*[\d.]+/g;
const CSS_ACTIVE_RULE = /([^{}]*:active[^{}]*)\{([^{}]*)\}/g;
const CSS_LITERAL_SCALE =
  /(?:(?:^|[;\s])scale\s*:\s*[\d.]+|transform\s*:[^;]*\bscale(?:3d)?\(\s*[\d.]+)/;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, block =>
    block.replace(/[^\n]/g, ' ')
  );
}

export function hardcodedPress(source, file) {
  const ids = new Set();
  const text = file.endsWith('.css') ? stripComments(source) : source;
  for (const pattern of [SCALE_UTILITY, TAILWIND_ARBITRARY, WHILE_TAP]) {
    for (const match of text.matchAll(pattern)) {
      ids.add(`hardcoded-press:${file}:${match[0].replace(/\s+/g, ' ')}`);
    }
  }
  if (file.endsWith('.css')) {
    for (const rule of text.matchAll(CSS_ACTIVE_RULE)) {
      const found = CSS_LITERAL_SCALE.exec(rule[2]);
      if (found) {
        const selector = rule[1].trim().split('\n').pop().trim();
        ids.add(`hardcoded-press:${file}:${selector} ${found[0].trim()}`);
      }
    }
  }
  return [...ids];
}

function openingElements(source) {
  const file = ts.createSourceFile(
    'press.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const found = [];
  const visit = node => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      found.push({
        name: open.tagName.getText(file),
        raw: open.getText(file),
        role: open.attributes.properties.find(
          attr => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'role'
        ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export function rawClickables(source, file) {
  if (!/<button\b|role\s*=\s*['"{]/.test(source)) return [];
  if (PRIMITIVE_FILES.has(file)) return [];
  const ids = [];
  let index = 0;
  for (const el of openingElements(source)) {
    const roleButton =
      el.role && /['"]button['"]/.test(el.role.getText?.() ?? '');
    if (el.name !== 'button' && !roleButton) continue;
    if (/\bpress\b/.test(el.raw)) continue;
    index += 1;
    ids.push(`raw-clickable:${file}#${index}`);
  }
  return ids;
}

function walk(repoRoot) {
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      files.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  for (const root of SOURCE_ROOTS) visit(join(repoRoot, root));
  return files;
}

export function scanPress(repoRoot = REPO_ROOT) {
  const ids = [];
  for (const absolute of walk(repoRoot)) {
    const rel = relative(repoRoot, absolute).split('\\').join('/');
    if (SKIP_FILE.test(rel) || OWNERS.has(rel)) continue;
    if (!/\.(?:css|ts|tsx)$/.test(rel) || rel.endsWith('.d.ts')) continue;
    const source = readFileSync(absolute, 'utf8');
    ids.push(...hardcodedPress(source, rel));
    if (rel.endsWith('.tsx') && CLICKABLE_ROOTS.some(r => rel.startsWith(r))) {
      ids.push(...rawClickables(source, rel));
    }
  }
  return ids.sort();
}

export function checkPress(repoRoot = REPO_ROOT, recordedIds) {
  const current = scanPress(repoRoot);
  const recorded =
    recordedIds ??
    JSON.parse(readFileSync(join(repoRoot, PRESS_BASELINE), 'utf8')).ids;
  const ancestor = ancestorJson(repoRoot, PRESS_BASELINE);
  if (!ancestor.ok) return { failures: [ancestor.error], ids: current };
  return {
    failures: evaluateRatchet({
      current,
      recorded,
      ancestor: ancestor.ancestor ? ancestor.ancestor.ids : null,
    }),
    ids: current,
  };
}

export const check = checkPress;
