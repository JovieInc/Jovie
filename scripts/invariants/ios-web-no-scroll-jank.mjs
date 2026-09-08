#!/usr/bin/env node
/**
 * JOV-INV-032: ios-web-no-scroll-jank-v1 hard-gate.
 *
 * Check class: ios-safari-scroll-jank
 * Public web (`apps/web`) homepage, profile, and Find me surfaces.
 * Rejects known iOS Safari/WebKit scroll-jank sources:
 *   - scroll/touch/wheel listeners without { passive: true }
 *   - layout-forcing reads inside those handlers without rAF
 *   - 100vh-only / h-screen mobile chrome jumps (dvh/svh required)
 *   - html/body touch-action: none and overscroll-behavior: none
 *   - will-change spam on the document root
 *   - body overflow+position lock that does not restore scrollY
 *
 * Prefer Biome + this targeted scanner. Do not add a parallel ESLint
 * design lane (design-enforce-biome-primary-v1).
 *
 * This gate invents no scroll-FPS / INP budgets.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID = 'JOV-INV-032';
export const IOS_WEB_NO_SCROLL_JANK_SCHEMA = 'jovie-ios-web-no-scroll-jank/v1';
export const IOS_WEB_NO_SCROLL_JANK_SLUG =
  'jovie/coordination/ios-web-no-scroll-jank-v1';
export const IOS_WEB_NO_SCROLL_JANK_CHECK_CLASS = 'ios-safari-scroll-jank';
export const ESLINT_CONFIG_PATH = 'apps/web/eslint.config.js';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const PUBLIC_SURFACE_ROOTS = Object.freeze([
  'apps/web/app/(home)',
  'apps/web/app/[username]',
  'apps/web/components/homepage',
  'apps/web/components/features/home',
  'apps/web/components/features/profile',
  'apps/web/components/marketing/artist-profile',
  'apps/web/components/site/PublicPageShell.tsx',
  'apps/web/components/organisms/ProfileSection.tsx',
  'apps/web/components/molecules/FrostedContainer.tsx',
  'apps/web/hooks/useMobileKeyboard.ts',
]);

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  'tests',
  '__tests__',
  'e2e',
  'storybook-static',
  'generated',
]);

const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
]);

const SCROLL_EVENTS = new Set(['scroll', 'touchstart', 'touchmove', 'wheel']);

const LAYOUT_FORCE_RE =
  /\b(?:getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight|offsetTop|offsetLeft|clientWidth|clientHeight|scrollWidth|scrollHeight)\b/;

const TAILWIND_VH_RE =
  /(?<![A-Za-z0-9_-])(?:min-h-screen|max-h-screen|h-screen|min-h-\[100vh\]|max-h-\[100vh\]|h-\[100vh\])(?![A-Za-z0-9_-])/;

const CSS_VH_PROP_RE = /(min-height|max-height|height)\s*:\s*100vh\b/gi;

const LISTENER_RE =
  /\.addEventListener\(\s*(['"`])(scroll|touchstart|touchmove|wheel)\1/g;

export const FIXTURE_ROOT =
  'scripts/invariants/fixtures/ios-web-no-scroll-jank';

function posixRel(repoRoot, abs) {
  return relative(repoRoot, abs).split('\\').join('/');
}

function isExcludedSource(relPath) {
  return (
    /\.(test|spec|stories)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relPath) ||
    relPath.includes('/tests/') ||
    relPath.includes('/__tests__/') ||
    relPath.includes('/e2e/')
  );
}

function isScannedSource(relPath) {
  return SOURCE_EXT.has(extname(relPath)) && !isExcludedSource(relPath);
}

function walkFiles(absDir, files) {
  if (!existsSync(absDir)) return;
  const stat = statSync(absDir);
  if (stat.isFile()) {
    files.push(absDir);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory() && EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const next = join(absDir, entry.name);
    if (entry.isDirectory()) walkFiles(next, files);
    else files.push(next);
  }
}

export function collectPublicSurfaceFiles(repoRoot = DEFAULT_ROOT, files = {}) {
  if (Object.keys(files).length > 0) {
    return Object.keys(files).filter(isScannedSource);
  }
  const absFiles = [];
  for (const root of PUBLIC_SURFACE_ROOTS) {
    walkFiles(resolve(repoRoot, root), absFiles);
  }
  return absFiles
    .map(abs => posixRel(repoRoot, abs))
    .filter(isScannedSource)
    .sort();
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`
    );
}

function matchingParen(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findCallOpen(source, matchIndex) {
  const open = source.indexOf('(', matchIndex);
  return open;
}

function splitTopLevelArgs(argsText) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const char of argsText) {
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractHandlerName(handlerText) {
  const trimmed = handlerText.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return trimmed;
  return null;
}

function findNamedFunctionBody(source, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\(`),
    new RegExp(
      `(?:const|let|var)\\s+${name}\\s*=\\s*(?:useCallback\\()?\\s*(?:async\\s*)?(?:\\([^)]*\\)|${name})?\\s*=>\\s*\\{`
    ),
    new RegExp(
      `(?:const|let|var)\\s+${name}\\s*=\\s*(?:useCallback\\()?\\s*(?:async\\s*)?function\\b`
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const brace = source.indexOf('{', match.index + match[0].length - 1);
    if (brace < 0) continue;
    const end = matchingBrace(source, brace);
    if (end < 0) continue;
    return source.slice(brace, end + 1);
  }
  return null;
}

function handlerForcesLayout(callText, handlerName, source) {
  if (LAYOUT_FORCE_RE.test(callText)) {
    return !/requestAnimationFrame/.test(callText);
  }
  if (!handlerName) return false;
  const body = findNamedFunctionBody(source, handlerName);
  if (!body) return false;
  return LAYOUT_FORCE_RE.test(body) && !/requestAnimationFrame/.test(body);
}

function scanListeners(relPath, source, findings) {
  LISTENER_RE.lastIndex = 0;
  let match = LISTENER_RE.exec(source);
  while (match) {
    const eventName = match[2];
    const open = findCallOpen(source, match.index);
    const close = matchingParen(source, open);
    if (close < 0) {
      match = LISTENER_RE.exec(source);
      continue;
    }
    const callText = source.slice(match.index, close + 1);
    const argsText = source.slice(open + 1, close);
    const args = splitTopLevelArgs(argsText);
    const handlerText = args[1] ?? '';
    const optionsText = args[2] ?? '';
    const hasPassiveTrue = /passive\s*:\s*true/.test(optionsText);
    if (!hasPassiveTrue && SCROLL_EVENTS.has(eventName)) {
      findings.push({
        path: relPath,
        rule: 'non-passive-scroll-listener',
        detail: `${eventName} listener missing { passive: true }`,
      });
    }
    const handlerName = extractHandlerName(handlerText);
    if (handlerForcesLayout(handlerText || callText, handlerName, source)) {
      findings.push({
        path: relPath,
        rule: 'layout-force-in-scroll-handler',
        detail: `${eventName} handler forces layout without requestAnimationFrame`,
      });
    }
    match = LISTENER_RE.exec(source);
  }
}

function cssRuleHasDynamicViewport(block) {
  return /100(?:svh|dvh|lvh)\b/.test(block);
}

function selectorHasSupportsOverride(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const supports = new RegExp(
    `@supports\\s*\\(\\s*height:\\s*100(?:svh|dvh)\\s*\\)\\s*\\{[\\s\\S]*?${escaped}\\s*\\{[^}]*100(?:svh|dvh)`,
    'i'
  );
  return supports.test(source);
}

function scanViewportUnits(relPath, source, findings) {
  if (TAILWIND_VH_RE.test(source)) {
    findings.push({
      path: relPath,
      rule: '100vh-mobile-chrome',
      detail:
        '100vh-only Tailwind class (h-screen / min-h-screen); use svh/dvh',
    });
  }

  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  let rule = ruleRe.exec(source);
  while (rule) {
    const selector = rule[1].trim();
    const block = rule[2];
    CSS_VH_PROP_RE.lastIndex = 0;
    if (
      CSS_VH_PROP_RE.test(block) &&
      !cssRuleHasDynamicViewport(block) &&
      !selectorHasSupportsOverride(source, selector.split(',')[0].trim())
    ) {
      findings.push({
        path: relPath,
        rule: '100vh-mobile-chrome',
        detail: `${selector} uses 100vh without a dvh/svh cascade`,
      });
    }
    rule = ruleRe.exec(source);
  }
}

function scanRootCss(relPath, source, findings) {
  const rootRuleRe =
    /(?:^|[,}\s])((?:html|body|:root)(?:\s*,\s*(?:html|body|:root))*)\s*\{([^}]+)\}/g;
  let match = rootRuleRe.exec(source);
  while (match) {
    const block = match[2];
    if (/overscroll-behavior(?:-[xy])?\s*:\s*none/i.test(block)) {
      findings.push({
        path: relPath,
        rule: 'overscroll-none-root',
        detail: 'html/body overscroll-behavior: none fights iOS rubber-band',
      });
    }
    if (/touch-action\s*:\s*none/i.test(block)) {
      findings.push({
        path: relPath,
        rule: 'touch-action-none-root',
        detail: 'html/body touch-action: none blocks iOS scrolling',
      });
    }
    if (/will-change\s*:/i.test(block)) {
      findings.push({
        path: relPath,
        rule: 'will-change-spam',
        detail: 'html/body will-change promotes the whole document',
      });
    }
    match = rootRuleRe.exec(source);
  }

  if (
    /<(?:html|body)\b[^>]*\boverscroll-none\b/.test(source) ||
    /document\.(?:documentElement|body)\.style\.overscrollBehavior\s*=\s*['"]none['"]/.test(
      source
    )
  ) {
    findings.push({
      path: relPath,
      rule: 'overscroll-none-root',
      detail: 'root overscroll-none',
    });
  }
  if (
    /<(?:html|body)\b[^>]*\btouch-none\b/.test(source) ||
    /document\.(?:documentElement|body)\.style\.touchAction\s*=\s*['"]none['"]/.test(
      source
    )
  ) {
    findings.push({
      path: relPath,
      rule: 'touch-action-none-root',
      detail: 'root touch-action: none',
    });
  }
}

function scanWillChangeSpam(relPath, source, findings) {
  if (/will-change\s*:\s*[^;]+,[^;]+,[^;]+,/.test(source)) {
    findings.push({
      path: relPath,
      rule: 'will-change-spam',
      detail: 'will-change lists 4+ properties',
    });
  }
}

function scanBodyScrollLock(relPath, source, findings) {
  const locksOverflow =
    /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/.test(source);
  const locksFixed = /document\.body\.style\.position\s*=\s*['"]fixed['"]/.test(
    source
  );
  if (locksOverflow && locksFixed && !/\bscrollY\b/.test(source)) {
    findings.push({
      path: relPath,
      rule: 'body-scroll-lock-ios',
      detail:
        'body overflow:hidden + position:fixed without saving window.scrollY breaks iOS scroll restore',
    });
  }
}

export function scanSource(relPath, sourceText) {
  const source = stripComments(sourceText);
  /** @type {Array<{path: string, rule: string, detail: string}>} */
  const findings = [];
  scanListeners(relPath, source, findings);
  scanViewportUnits(relPath, source, findings);
  scanRootCss(relPath, source, findings);
  scanWillChangeSpam(relPath, source, findings);
  scanBodyScrollLock(relPath, source, findings);
  return findings;
}

export function scanRuntime(repoRoot = DEFAULT_ROOT, files = {}) {
  const findings = [];
  for (const relPath of collectPublicSurfaceFiles(repoRoot, files)) {
    const source =
      files[relPath] ??
      (existsSync(resolve(repoRoot, relPath))
        ? readFileSync(resolve(repoRoot, relPath), 'utf8')
        : null);
    if (source == null) continue;
    findings.push(...scanSource(relPath, source));
  }
  return findings;
}

export function scanFixture(name, repoRoot = DEFAULT_ROOT) {
  return scanRuntime(resolve(repoRoot, FIXTURE_ROOT, name));
}

export function validateIosWebNoScrollJankContract(
  registry,
  repoRoot = DEFAULT_ROOT
) {
  const invariant = registry?.invariants?.find(
    item => item.id === IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID
  );
  if (!invariant) {
    return [
      `${IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID} is missing from the registry`,
    ];
  }
  const policy = invariant.policy?.value ?? {};
  const errors = [];
  if (policy.schema !== IOS_WEB_NO_SCROLL_JANK_SCHEMA) {
    errors.push(`policy schema must be ${IOS_WEB_NO_SCROLL_JANK_SCHEMA}`);
  }
  if (policy.gbrainSlug !== IOS_WEB_NO_SCROLL_JANK_SLUG) {
    errors.push(`gbrain slug must be ${IOS_WEB_NO_SCROLL_JANK_SLUG}`);
  }
  if (policy.checkClass !== IOS_WEB_NO_SCROLL_JANK_CHECK_CLASS) {
    errors.push(`checkClass must be ${IOS_WEB_NO_SCROLL_JANK_CHECK_CLASS}`);
  }
  if (policy.inventMetrics !== false) {
    errors.push('must refuse invented scroll-FPS / INP budget numbers');
  }
  if (policy.eslintLane !== false) {
    errors.push('must keep eslintLane false (design-enforce-biome-primary-v1)');
  }
  if (policy.biomePrimary !== true) {
    errors.push('must keep biomePrimary true');
  }
  const consumers = invariant.enforcementConsumers ?? [];
  if (consumers.some(item => item.path === ESLINT_CONFIG_PATH)) {
    errors.push('must not add a parallel ESLint design-lane consumer');
  }
  void repoRoot;
  return errors;
}

export function validateIosWebNoScrollJank(
  repoRoot = DEFAULT_ROOT,
  { files = {}, registry = readInvariantRegistry(repoRoot) } = {}
) {
  const findings = scanRuntime(repoRoot, files);
  return [
    ...validateIosWebNoScrollJankContract(registry, repoRoot),
    ...findings.map(item => `${item.rule}: ${item.path} — ${item.detail}`),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateIosWebNoScrollJank();
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('ios-web-no-scroll-jank-v1 public-web gate clean\n');
  }
}
