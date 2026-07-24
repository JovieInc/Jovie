#!/usr/bin/env node
/**
 * Design-system agent gate (System B lock).
 *
 * Makes it hard for agents to ship off-system UI. Fails when NEW / changed code
 * introduces:
 *   1. raw hex colors outside packages/ui theme + design-system.css
 *   2. banned motion classes (hover:scale, transition-all, duration-N) outside
 *      allowed motion tokens (duration-subtle/cinematic, ease-subtle/cinematic)
 *   3. new apps/web/components files that collide with an existing @jovie/ui atom
 *      by filename / export name without re-exporting from @jovie/ui
 *   4. imports of deleted design-studio stories / System A-only paths
 *
 * Run:
 *   node scripts/design-system-agent-gate.mjs
 *   pnpm design-system:gate
 *
 * Modes:
 *   (default)  scan git-changed files vs merge-base with origin/main|main
 *   --all      full product scan (still respects token/theme allowlists)
 *   --json     machine-readable findings on stdout
 *
 * Founder canon 2026-06-18: DESIGN.md System B is the sole system.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PRODUCT_SCAN_ROOTS = [
  'apps/web/components',
  'apps/web/app',
  'packages/ui/atoms',
];

const SKIP_PATH_PATTERNS = [
  /(?:^|\/)(?:node_modules|\.next|dist|coverage|storybook-static)(?:\/|$)/,
  /(?:\.test|\.spec|\.stories)\.[tj]sx?$/,
  /(?:^|\/)(?:tests|__tests__|__mocks__|fixtures|screenshot-catalog)(?:\/|$)/,
  /(?:^|\/)apps\/web\/eslint-rules(?:\/|$)/,
  /(?:^|\/)apps\/web\/app\/exp(?:\/|$)/,
  /(?:^|\/)apps\/web\/scripts(?:\/|$)/,
];

const HEX_ALLOW_PATTERNS = [
  /(?:^|\/)packages\/ui\/theme\//,
  /(?:^|\/)apps\/web\/styles\/design-system\.css$/,
  /(?:^|\/)apps\/web\/styles\/linear-tokens\.css$/,
  /(?:^|\/)apps\/web\/lib\/design\/generated\//,
  /(?:^|\/)packages\/ui\/.*\.css$/,
  /(?:^|\/)tailwind\.config\.[cm]?[jt]s$/,
  // Brand/DSP registry legitimately stores partner brand hex.
  /(?:^|\/)apps\/web\/lib\/dsp\//,
  /(?:^|\/)apps\/web\/lib\/brand\//,
  /(?:^|\/)apps\/web\/data\/(?:brand|dsp|marketing)\//,
];

const SOURCE_EXT = /\.(tsx|ts|css|mjs|cjs|js)$/;
const COMPONENT_EXT = /\.tsx$/;

/** Raw hex in class strings / style literals (not CSS custom-property defs in allowlisted files). */
const RAW_HEX_RE =
  /(?:(?:text|bg|border|ring|fill|stroke|from|to|via)-\[#|['"`]#|:\s*['"]?#|=\s*['"]#)([0-9A-Fa-f]{3,8})\b/g;

const BANNED_MOTION_RE =
  /\b(?:hover:scale-(?!100\b)|group-hover:scale-(?!100\b)|transition-all|duration-\d+)\b/g;

const ALLOWED_MOTION_TOKENS = new Set([
  'duration-subtle',
  'duration-cinematic',
  'duration-instant',
  'duration-fast',
  'duration-normal',
  'duration-slow',
  'ease-subtle',
  'ease-cinematic',
  'ease-out',
  'ease-in-out',
  'ease-drawer',
  'ease-spring',
]);

/** System A / deleted design-studio story import paths. */
const BANNED_IMPORT_RES = [
  {
    rule: 'no-design-studio-stories',
    re: /from\s+['"][^'"]*design-studio[^'"]*\.stories[^'"]*['"]/,
    detail:
      'Do not import deleted design-studio stories. Compose System B product components in Storybook instead.',
  },
  {
    rule: 'no-system-a-linear-marketing-import',
    re: /from\s+['"][^'"]*(?:linear-marketing|system-a|design-system-a)[^'"]*['"]/,
    detail:
      'System A paths are retired (founder 2026-06-18). Build on System B tokens + @jovie/ui.',
  },
  {
    rule: 'no-linear-marketing-class',
    re: /\blinear-marketing\b/,
    detail:
      '`.linear-marketing` (System A wrapper) is retired. Use `.system-b-marketing` / System B tokens.',
  },
];

/** Canonical @jovie/ui atom basenames (kebab file + Pascal export). */
const UI_ATOM_INTERNAL = new Set([
  'common-dropdown-item-renderers',
  'common-dropdown-renderer',
  'common-dropdown-types',
  'common-dropdown-utils',
]);

/**
 * @param {string} root
 * @returns {string[]}
 */
export function listUiAtomNames(root = ROOT) {
  const atomsDir = path.join(root, 'packages/ui/atoms');
  if (!existsSync(atomsDir)) return [];
  /** @type {string[]} */
  const names = [];
  for (const entry of readdirSync(atomsDir)) {
    if (!entry.endsWith('.tsx')) continue;
    if (/\.(stories|test)\.tsx$/.test(entry)) continue;
    const base = entry.replace(/\.tsx$/, '');
    if (UI_ATOM_INTERNAL.has(base)) continue;
    names.push(base);
  }
  return names.sort();
}

/**
 * @param {string} kebab
 */
function toPascalCase(kebab) {
  return kebab
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * @param {string[]} atomKebabs
 * @returns {Map<string, string>} lower(fileOrExport) -> kebab
 */
export function buildAtomCollisionIndex(atomKebabs) {
  /** @type {Map<string, string>} */
  const index = new Map();
  for (const kebab of atomKebabs) {
    const pascal = toPascalCase(kebab);
    index.set(kebab.toLowerCase(), kebab);
    index.set(pascal.toLowerCase(), kebab);
  }
  return index;
}

/**
 * @param {string} file
 */
function shouldSkipPath(file) {
  const normalized = file.replaceAll('\\', '/');
  return SKIP_PATH_PATTERNS.some(re => re.test(normalized));
}

/**
 * @param {string} file
 */
function isHexAllowed(file) {
  const normalized = file.replaceAll('\\', '/');
  return HEX_ALLOW_PATTERNS.some(re => re.test(normalized));
}

/**
 * @param {string} dir
 * @param {(name: string) => boolean} [filter]
 * @returns {string[]}
 */
function walkFiles(dir, filter = () => true) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  /** @param {string} current */
  const walk = current => {
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'dist'
        ) {
          continue;
        }
        walk(full);
        continue;
      }
      if (entry.isFile() && filter(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * @param {string} root
 * @param {string[]} [baseCandidates]
 */
export function resolveGitBase(
  root = ROOT,
  baseCandidates = ['origin/main', 'main']
) {
  for (const candidate of baseCandidates) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: root,
        stdio: 'pipe',
      });
      const mergeBase = execFileSync('git', ['merge-base', 'HEAD', candidate], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      if (mergeBase) return mergeBase;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * @param {string} root
 * @param {string | null} base
 * @returns {{ changed: string[], added: string[] }}
 */
/**
 * @param {string} root
 * @param {string[]} args
 */
function gitLines(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function listChangedFiles(root = ROOT, base = resolveGitBase(root)) {
  /** @type {Set<string>} */
  const changed = new Set();
  /** @type {Set<string>} */
  const added = new Set();

  if (base) {
    for (const f of gitLines(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      `${base}...HEAD`,
    ])) {
      changed.add(f);
    }
    for (const f of gitLines(root, [
      'diff',
      '--name-only',
      '--diff-filter=A',
      `${base}...HEAD`,
    ])) {
      added.add(f);
    }
    // Include uncommitted work so pre-commit / local agent runs catch drift
    // before it lands on HEAD.
    for (const f of gitLines(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      base,
    ])) {
      changed.add(f);
    }
    for (const f of gitLines(root, [
      'diff',
      '--name-only',
      '--diff-filter=A',
      '--cached',
      base,
    ])) {
      added.add(f);
    }
  }

  // Working tree + index (unstaged / staged vs HEAD)
  for (const f of gitLines(root, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    'HEAD',
  ])) {
    changed.add(f);
  }
  for (const f of gitLines(root, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    '--cached',
  ])) {
    changed.add(f);
  }
  for (const f of gitLines(root, [
    'diff',
    '--name-only',
    '--diff-filter=A',
    '--cached',
  ])) {
    added.add(f);
  }
  // Untracked new files (agents often add components without staging first)
  for (const f of gitLines(root, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ])) {
    changed.add(f);
    added.add(f);
  }

  return { changed: [...changed].sort(), added: [...added].sort() };
}

/**
 * @param {string} text
 * @param {RegExp} re
 * @returns {string[]}
 */
function matchAll(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  /** @type {string[]} */
  const hits = [];
  let m;
  while ((m = global.exec(text)) !== null) {
    hits.push(m[0]);
    if (m[0].length === 0) global.lastIndex += 1;
  }
  return hits;
}

/**
 * @param {string} fileRel
 * @param {string} text
 * @param {Map<string, string>} atomIndex
 * @param {{ isAdded: boolean }} opts
 * @returns {{ file: string, rule: string, detail: string }[]}
 */
export function evaluateFile(
  fileRel,
  text,
  atomIndex,
  opts = { isAdded: false }
) {
  /** @type {{ file: string, rule: string, detail: string }[]} */
  const findings = [];
  const normalized = fileRel.replaceAll('\\', '/');

  if (shouldSkipPath(normalized)) return findings;

  // 1) raw hex outside theme sources
  if (!isHexAllowed(normalized) && SOURCE_EXT.test(normalized)) {
    const hexHits = matchAll(text, RAW_HEX_RE);
    // Ignore pure hash comments like #region and markdown anchors roughly:
    const real = hexHits.filter(hit =>
      /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/.test(hit)
    );
    if (real.length > 0) {
      findings.push({
        file: normalized,
        rule: 'no-raw-hex-outside-tokens',
        detail: `Raw hex color(s) (${real.slice(0, 5).join(', ')}${real.length > 5 ? '…' : ''}). Use System B tokens (packages/ui/theme + apps/web/styles/design-system.css) — never hardcode hex in product UI.`,
      });
    }
  }

  // 2) banned motion classes
  if (SOURCE_EXT.test(normalized)) {
    const motionHits = matchAll(text, BANNED_MOTION_RE);
    // duration-\d+ is banned; token names like duration-subtle are not matched by duration-\d+
    const offenders = motionHits.filter(hit => !ALLOWED_MOTION_TOKENS.has(hit));
    if (offenders.length > 0) {
      findings.push({
        file: normalized,
        rule: 'no-banned-motion-classes',
        detail: `Banned motion class(es): ${[...new Set(offenders)].slice(0, 8).join(', ')}. Use duration-subtle/cinematic + ease-subtle/cinematic (see .claude/rules/motion.md). No hover:scale / transition-all / duration-N.`,
      });
    }
  }

  // 3) atom filename / export collisions for NEW component files only
  if (
    opts.isAdded &&
    normalized.startsWith('apps/web/components/') &&
    COMPONENT_EXT.test(normalized) &&
    !/\.(stories|test)\.tsx$/.test(normalized)
  ) {
    const base = path.basename(normalized, '.tsx');
    const atomKebab = atomIndex.get(base.toLowerCase());
    if (atomKebab) {
      const reexportsUi =
        /from\s+['"]@jovie\/ui['"]/.test(text) ||
        /from\s+['"]@jovie\/ui\//.test(text);
      // Thin wrappers that compose @jovie/ui are allowed (Badge.tsx pattern).
      if (!reexportsUi) {
        findings.push({
          file: normalized,
          rule: 'no-duplicate-ui-atom',
          detail: `New component "${base}" collides with @jovie/ui atom "${atomKebab}". Import/compose from @jovie/ui instead of forking a one-off under apps/web/components.`,
        });
      }
    }

    // Export-name collision: `export function Button` / `export const Button`
    for (const [key, atomKebab] of atomIndex) {
      // only check Pascal keys (skip kebab duplicates in index)
      if (key.includes('-')) continue;
      const pascal = toPascalCase(atomKebab);
      if (pascal.toLowerCase() !== key) continue;
      const exportRe = new RegExp(
        `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${pascal}\\b`
      );
      if (exportRe.test(text) && base.toLowerCase() !== pascal.toLowerCase()) {
        const reexportsUi =
          /from\s+['"]@jovie\/ui['"]/.test(text) ||
          /from\s+['"]@jovie\/ui\//.test(text);
        if (!reexportsUi) {
          findings.push({
            file: normalized,
            rule: 'no-duplicate-ui-atom-export',
            detail: `New file exports "${pascal}" which collides with @jovie/ui atom "${atomKebab}". Reuse @jovie/ui or pick a non-colliding app-specific name.`,
          });
        }
      }
    }
  }

  // 4) banned System A / design-studio story imports (any changed product file)
  if (SOURCE_EXT.test(normalized)) {
    for (const ban of BANNED_IMPORT_RES) {
      if (ban.re.test(text)) {
        findings.push({
          file: normalized,
          rule: ban.rule,
          detail: ban.detail,
        });
      }
    }
  }

  return findings;
}

/**
 * @param {{
 *   root?: string,
 *   mode?: 'changed' | 'all',
 *   changedFiles?: string[],
 *   addedFiles?: string[],
 *   readFile?: (abs: string) => string,
 *   atomNames?: string[],
 * }} [options]
 */
export function evaluateDesignSystemAgentGate(options = {}) {
  const root = options.root ?? ROOT;
  const mode = options.mode ?? 'changed';
  const atomNames = options.atomNames ?? listUiAtomNames(root);
  const atomIndex = buildAtomCollisionIndex(atomNames);
  const read = options.readFile ?? (abs => readFileSync(abs, 'utf8'));

  /** @type {string[]} */
  let targets = [];
  /** @type {Set<string>} */
  let addedSet = new Set(options.addedFiles ?? []);

  if (mode === 'all') {
    for (const relRoot of PRODUCT_SCAN_ROOTS) {
      const abs = path.join(root, relRoot);
      targets.push(
        ...walkFiles(abs, name => SOURCE_EXT.test(name)).map(f =>
          path.relative(root, f).replaceAll('\\', '/')
        )
      );
    }
    // In --all mode treat every file as "changed" but only brand-new collisions
    // still need added semantics; without git, skip collision-on-added unless
    // caller supplied addedFiles.
  } else {
    const discovered = options.changedFiles ?? listChangedFiles(root).changed;
    const discoveredAdded = options.addedFiles ?? listChangedFiles(root).added;
    addedSet = new Set(discoveredAdded.map(f => f.replaceAll('\\', '/')));
    targets = discovered
      .map(f => f.replaceAll('\\', '/'))
      .filter(f => {
        if (shouldSkipPath(f)) return false;
        if (!SOURCE_EXT.test(f)) return false;
        // Only product surfaces + ui atoms for agent gate.
        return (
          f.startsWith('apps/web/components/') ||
          f.startsWith('apps/web/app/') ||
          f.startsWith('packages/ui/atoms/') ||
          f === 'apps/web/styles/design-system.css' ||
          f.startsWith('packages/ui/theme/')
        );
      });
  }

  /** @type {{ file: string, rule: string, detail: string }[]} */
  const findings = [];
  for (const rel of [...new Set(targets)].sort()) {
    const abs = path.join(root, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    let text = '';
    try {
      text = read(abs);
    } catch {
      continue;
    }
    findings.push(
      ...evaluateFile(rel, text, atomIndex, {
        isAdded: addedSet.has(rel),
      })
    );
  }

  return {
    ok: findings.length === 0,
    findings,
    scanned: targets.length,
    mode,
    atomCount: atomNames.length,
  };
}

function parseArgs(argv) {
  return {
    all: argv.includes('--all'),
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node scripts/design-system-agent-gate.mjs [--all] [--json]

Fails when changed (or --all) product UI introduces off-system colors, motion,
duplicate @jovie/ui atoms, or System A / design-studio story imports.
`);
    return 0;
  }

  const result = evaluateDesignSystemAgentGate({
    mode: args.all ? 'all' : 'changed',
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      `[design-system-agent-gate] clean (${result.scanned} file(s), mode=${result.mode}, ${result.atomCount} ui atoms)`
    );
  } else {
    console.error(
      `[design-system-agent-gate] ${result.findings.length} finding(s) in ${result.scanned} file(s) (mode=${result.mode}):`
    );
    for (const f of result.findings) {
      console.error(`- ${f.file}\n  rule: ${f.rule}\n  ${f.detail}`);
    }
    console.error(
      '\nSystem B is the sole design system (DESIGN.md, founder 2026-06-18). Fix findings or compose @jovie/ui — do not ship off-system UI.'
    );
  }

  return result.ok ? 0 : 1;
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

export { main, ROOT };
