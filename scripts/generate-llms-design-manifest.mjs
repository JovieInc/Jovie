#!/usr/bin/env node
/**
 * Generate docs/llms-design-manifest.txt — llms.txt-style design contract for AI agents.
 *
 * Canon: one design system (System B), two languages (product + marketing editorial).
 * Prefer @jovie/ui atoms; see docs/design/COMPONENT_MAP.md + root DESIGN.md.
 *
 * Sources:
 *   - apps/web/styles/design-system.css (CSS custom properties)
 *   - packages/ui/atoms/* (shared UI primitives)
 *   - apps/web/eslint.config.js + apps/web/eslint-rules/* (design guardrails)
 *   - apps/web/lib/canonical-surfaces.ts (canonical review surfaces)
 *
 * Usage:
 *   node scripts/generate-llms-design-manifest.mjs [--check] [--out <path>]
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_OUT = path.join(REPO_ROOT, 'docs/llms-design-manifest.txt');
const DESIGN_SYSTEM_CSS = path.join(
  REPO_ROOT,
  'apps/web/styles/design-system.css'
);
const ESLINT_CONFIG = path.join(REPO_ROOT, 'apps/web/eslint.config.js');
const ESLINT_RULES_DIR = path.join(REPO_ROOT, 'apps/web/eslint-rules');
const UI_ATOMS_DIR = path.join(REPO_ROOT, 'packages/ui/atoms');
const CANONICAL_SURFACES = path.join(
  REPO_ROOT,
  'apps/web/lib/canonical-surfaces.ts'
);

const GENERATED_HEADER = [
  '<!--',
  '  AUTO-GENERATED — do not hand-edit.',
  '  Regenerate: pnpm ds:llms-manifest',
  '  Source: scripts/generate-llms-design-manifest.mjs',
  '-->',
  '',
].join('\n');

/** Rules enforced for UI/design work (auto-detected from rule JSDoc + allowlist). */
const DESIGN_RULE_ALLOWLIST = new Set([
  'canonical-ui-label-casing',
  'icon-usage',
  'no-ad-hoc-currency',
  'no-hardcoded-theme-colors',
  'no-raw-focus-ring',
  'no-raw-motion-values',
]);

const DESIGN_RULE_KEYWORDS =
  /\b(design|focus|motion|casing|theme|color|icon|label|ring|token|tailwind|contrast|ui)\b/i;

/** Prefixes included in the AI contract manifest (full registry stays in CSS). */
const CONTRACT_TOKEN_PREFIXES = [
  'ds-',
  'app-shell-',
  'system-b-',
  'public-shell-',
  'public-content-',
  'profile-shell-',
  'profile-card-',
  'profile-inner-',
  'profile-drawer-',
  'profile-action-',
  'profile-notification-',
  'profile-bottom-nav-',
  'page-pad',
  'section-gap',
  'card-pad',
  'content-max',
  'radius-',
  'text-',
  'font-',
  'space-',
  'shadow-',
  'theme-',
  'duration-',
  'ease-',
  'color-text-',
  'color-bg-',
  'color-border-',
  'color-btn-',
  'color-accent',
  'color-success',
  'color-error',
  'color-warning',
  'color-info',
  'color-interactive-',
  'linear-app-',
  'linear-header-',
  'linear-btn-',
  'linear-bg-',
];

const CONTRACT_TOKEN_BLOCKLIST_PREFIXES = ['color-brand-', 'color-accent-'];

export function isContractToken(name) {
  const bare = name.startsWith('--') ? name.slice(2) : name;
  if (
    CONTRACT_TOKEN_BLOCKLIST_PREFIXES.some(prefix => bare.startsWith(prefix))
  ) {
    return false;
  }
  return CONTRACT_TOKEN_PREFIXES.some(
    prefix => bare === prefix || bare.startsWith(prefix)
  );
}

export function filterContractTokens(tokens) {
  const filtered = new Map();
  for (const [name, value] of tokens) {
    if (isContractToken(name)) {
      filtered.set(name, value);
    }
  }
  return filtered;
}

const TOKEN_CATEGORY_ORDER = [
  ['ds-', 'DS Foundation'],
  ['color-', 'Semantic Colors'],
  ['system-b-', 'System B Surfaces'],
  ['app-shell-', 'App Shell'],
  ['public-shell-', 'Public Shell'],
  ['public-content-', 'Public Content Width'],
  ['profile-', 'Profile Shell'],
  ['radius-', 'Border Radius'],
  ['text-', 'Typography Scale'],
  ['font-', 'Font'],
  ['space-', 'Spacing'],
  ['shadow-', 'Shadows'],
  ['linear-', 'Linear Chrome'],
  ['theme-', 'Theme Inputs'],
  ['ds-motion-', 'Motion Tokens'],
];

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function compactValue(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip @media (prefers-reduced-motion) blocks so later 0ms overrides are ignored. */
export function stripReducedMotionOverrides(css) {
  const marker = '@media (prefers-reduced-motion: reduce)';
  let result = css;
  let index = result.indexOf(marker);
  while (index !== -1) {
    const braceStart = result.indexOf('{', index);
    if (braceStart === -1) {
      break;
    }
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < result.length; i += 1) {
      if (result[i] === '{') depth += 1;
      else if (result[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    result = result.slice(0, index) + result.slice(end);
    index = result.indexOf(marker);
  }
  return result;
}

/**
 * Parse `--token: value;` declarations from design-system.css.
 * Handles simple multiline values (e.g. calc(), color-mix()).
 * First definition wins so canonical :root values beat later overrides.
 */
export function parseCssCustomProperties(css) {
  const tokens = new Map();
  const scopedCss = stripReducedMotionOverrides(css);
  const lines = scopedCss.split('\n');
  let currentName = null;
  let currentValue = '';

  function commitToken() {
    if (!currentName) return;
    const value = compactValue(currentValue);
    if (value && !tokens.has(currentName)) {
      tokens.set(currentName, value);
    }
    currentName = null;
    currentValue = '';
  }

  for (const line of lines) {
    const declStart = line.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.*)$/);
    if (declStart) {
      commitToken();
      currentName = declStart[1];
      const rest = declStart[2];
      if (rest.includes(';')) {
        currentValue = rest.replace(/;.*$/, '');
        commitToken();
      } else {
        currentValue = rest;
      }
      continue;
    }

    if (currentName) {
      if (line.includes(';')) {
        currentValue += ` ${line.replace(/;.*$/, '')}`;
        commitToken();
      } else {
        currentValue += ` ${line.trim()}`;
      }
    }
  }

  commitToken();
  return tokens;
}

export function categorizeTokens(tokens) {
  const categories = new Map();
  const assigned = new Set();

  for (const [prefix, label] of TOKEN_CATEGORY_ORDER) {
    const entries = [];
    for (const [name, value] of tokens) {
      if (name.startsWith(`--${prefix}`)) {
        entries.push([name, value]);
        assigned.add(name);
      }
    }
    if (entries.length > 0) {
      entries.sort(([a], [b]) => a.localeCompare(b));
      categories.set(label, entries);
    }
  }

  const other = [];
  for (const [name, value] of tokens) {
    if (!assigned.has(name)) {
      other.push([name, value]);
    }
  }
  if (other.length > 0) {
    other.sort(([a], [b]) => a.localeCompare(b));
    categories.set('Other Tokens', other);
  }

  return categories;
}

export function listUiAtomComponents(atomsDir = UI_ATOMS_DIR) {
  if (!existsSync(atomsDir)) {
    return [];
  }

  const excludedStems = new Set([
    'common-dropdown-item-renderers',
    'common-dropdown-renderer',
  ]);

  return readdirSync(atomsDir)
    .filter(
      file =>
        file.endsWith('.tsx') &&
        !file.endsWith('.test.tsx') &&
        !file.endsWith('.stories.tsx') &&
        !excludedStems.has(file.replace(/\.tsx$/, ''))
    )
    .map(file => {
      const stem = file.replace(/\.tsx$/, '');
      const pascal =
        stem.charAt(0).toUpperCase() +
        stem
          .slice(1)
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          .replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
      return {
        file: `packages/ui/atoms/${file}`,
        importFrom: '@jovie/ui',
        name: pascal,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function extractRuleDescription(ruleId, rulesDir = ESLINT_RULES_DIR) {
  const rulePath = path.join(rulesDir, `${ruleId}.js`);
  if (!existsSync(rulePath)) {
    return null;
  }

  const source = readText(rulePath);
  const match = source.match(/\/\*\*([\s\S]*?)\*\//);
  if (!match) {
    return null;
  }

  const lines = match[1]
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean);

  const paragraph = [];
  for (const line of lines) {
    if (line.startsWith('@')) break;
    if (
      line.startsWith('Rules:') ||
      line.startsWith('Bad:') ||
      line.startsWith('Good:')
    ) {
      break;
    }
    paragraph.push(line);
  }

  const full = paragraph.join(' ').trim();
  if (!full) {
    return null;
  }

  const firstSentence =
    full.match(/^[\s\S]*?[.!?](?:\s|$)/)?.[0]?.trim() ?? full;
  return firstSentence.length > 220
    ? `${firstSentence.slice(0, 217).trimEnd()}...`
    : firstSentence;
}

export function parseEnabledJovieRules(eslintConfigSource) {
  const rules = [];
  const pattern = /'@jovie\/([a-z0-9-]+)':\s*'(error|warn)'/g;
  let match;
  while ((match = pattern.exec(eslintConfigSource)) !== null) {
    rules.push({ id: match[1], severity: match[2] });
  }
  return rules;
}

export function filterDesignEslintRules(
  enabledRules,
  rulesDir = ESLINT_RULES_DIR
) {
  return enabledRules
    .map(rule => {
      const description = extractRuleDescription(rule.id, rulesDir);
      const isDesign =
        DESIGN_RULE_ALLOWLIST.has(rule.id) ||
        (description ? DESIGN_RULE_KEYWORDS.test(description) : false);
      return { ...rule, description, isDesign };
    })
    .filter(rule => rule.isDesign)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function parseRestrictedUiImports(eslintConfigSource) {
  const imports = [];
  const blockMatch = eslintConfigSource.match(
    /'no-restricted-imports':\s*\[\s*'error',\s*\{([\s\S]*?)\}\s*,?\s*\]/
  );
  if (!blockMatch) {
    return imports;
  }

  const block = blockMatch[1];
  const pathPattern =
    /name:\s*'(@\/components\/atoms\/[^']+)'[\s\S]*?message:\s*"([^"]+)"/g;
  let match;
  while ((match = pathPattern.exec(block)) !== null) {
    if (match[2].includes('@jovie/ui')) {
      imports.push({ banned: match[1], message: match[2] });
    }
  }

  return imports;
}

export function parseCanonicalSurfaces(source) {
  const marker = 'export const CANONICAL_SURFACES = [';
  const start = source.indexOf(marker);
  if (start === -1) {
    return [];
  }

  const surfaces = [];
  const chunks = source
    .slice(start)
    .split(/\{\s*\n\s*id:\s*'/)
    .slice(1);

  for (const chunk of chunks) {
    const id = chunk.match(/^([^']+)'/)?.[1];
    const label = chunk.match(/label:\s*'([^']+)'/)?.[1];
    const componentFamily = chunk.match(/componentFamily:\s*'([^']+)'/)?.[1];
    const description =
      chunk.match(/description:\s*'([^']+)'/)?.[1] ??
      chunk.match(/description:\s*\n\s*'([^']+)'/)?.[1];
    if (!id || !label || !componentFamily || !description) {
      continue;
    }
    surfaces.push({ id, label, componentFamily, description });
  }

  return surfaces;
}

function formatTokenSection(categories) {
  const sections = [];
  for (const [label, entries] of categories) {
    sections.push(`### ${label}`, '');
    for (const [name, value] of entries) {
      sections.push(`- \`${name}\`: ${value}`);
    }
    sections.push('');
  }
  return sections.join('\n');
}

export function buildLlmsDesignManifest({
  repoRoot = REPO_ROOT,
  designSystemCss = readText(DESIGN_SYSTEM_CSS),
  eslintConfig = readText(ESLINT_CONFIG),
  canonicalSurfacesSource = readText(CANONICAL_SURFACES),
  uiComponents = listUiAtomComponents(path.join(repoRoot, 'packages/ui/atoms')),
} = {}) {
  const allTokens = parseCssCustomProperties(designSystemCss);
  const tokens = filterContractTokens(allTokens);
  const categories = categorizeTokens(tokens);
  const enabledRules = parseEnabledJovieRules(eslintConfig);
  const designRules = filterDesignEslintRules(
    enabledRules,
    path.join(repoRoot, 'apps/web/eslint-rules')
  );
  const restrictedImports = parseRestrictedUiImports(eslintConfig);
  const surfaces = parseCanonicalSurfaces(canonicalSurfacesSource);

  const lines = [
    '# Jovie Design System — AI Agent Contract',
    '',
    '> Machine-readable design contract for AI agents editing Jovie UI. Tokens come from `apps/web/styles/design-system.css`; shared primitives from `@jovie/ui`.',
    '>',
    '> **One system, two languages:** System B tokens only (product + marketing editorial). Historical System A is not a valid choice for new work. Prefer/forbid map: `docs/design/COMPONENT_MAP.md`.',
    '',
    '## Source of Truth',
    '',
    '- **Visual spec:** `DESIGN.md` (read before any UI edit)',
    '- **Component map:** `docs/design/COMPONENT_MAP.md` (prefer `@jovie/ui`; forbid void stories / design-studio leftovers)',
    '- **Token registry:** `apps/web/styles/design-system.css`',
    '- **Token docs:** `docs/DESIGN_TOKENS.md`',
    "- **Shared primitives:** `packages/ui/atoms/*` via `import { ... } from '@jovie/ui'`",
    '- **Canonical surfaces:** `apps/web/lib/canonical-surfaces.ts`',
    '- **Tailwind mapping:** `apps/web/tailwind.config.js`',
    '',
    '## Hard Rules',
    '',
    '- Never invent design tokens — add shared tokens only in `design-system.css`.',
    '- Never import local `@/components/atoms/*` for primitives covered by `@jovie/ui`.',
    '- Use semantic Tailwind utilities (`text-primary-token`, `bg-surface-1`, `duration-subtle`) instead of raw colors, hex, or arbitrary motion.',
    '- Motion: only `duration-subtle ease-subtle` or `duration-cinematic ease-cinematic`.',
    '- Public/marketing width: `max-w-public-content` (`--ds-public-content-max` = 1298px).',
    '- Prose width: `max-w-prose-canonical` (`--ds-prose-max` = 680px).',
    '- No emoji in UI — use Lucide icons or approved SVGs.',
    '- Title Case for labels/buttons; sentence case for body, tooltips, and toasts.',
    '- System B only for new work — do not reintroduce System A / `.linear-marketing` / DM Sans; marketing uses `.system-b-marketing` editorial language on the same tokens.',
    '- No void Storybook atoms, hand-rolled package-covered primitives, design-studio leftovers, or demo/exp chrome as shipping templates.',
    '',
    '## Canonical Tailwind Utilities',
    '',
    '- `max-w-public-content` — public/marketing container (1298px)',
    '- `max-w-prose-canonical` — long-form prose (680px)',
    '- `duration-subtle` / `ease-subtle` — micro-interaction motion (150ms)',
    '- `duration-cinematic` / `ease-cinematic` — panel/modal motion (420ms)',
    '- `text-primary-token`, `text-secondary-token`, `text-tertiary-token`',
    '- `bg-surface-0`, `bg-surface-1`, `bg-surface-2`, `bg-base`, `bg-page`',
    '- `border-subtle`, `border-default`, `border-strong`',
    '- `focus-ring-themed` or `focus-visible:*` on interactive elements',
    '',
    `## Design Tokens (${tokens.size} contract tokens; ${allTokens.size} total in CSS)`,
    '',
    'Contract tokens below are the semantic surface for AI edits. DSP brand colors and extended accent palettes live in `apps/web/styles/design-system.css` only.',
    '',
    formatTokenSection(categories).trimEnd(),
    '',
    `## Shared UI Components (${uiComponents.length} atom primitives)`,
    '',
    'Import from `@jovie/ui` — do not recreate local atom copies.',
    '',
  ];

  for (const component of uiComponents) {
    lines.push(`- **${component.name}** — \`${component.file}\``);
  }

  lines.push(
    '',
    '## Canonical Surfaces',
    '',
    'These are the production review surfaces. Match their token usage and component families.',
    ''
  );

  for (const surface of surfaces) {
    lines.push(
      `- **${surface.label}** (\`${surface.id}\`) — ${surface.description} — family: \`${surface.componentFamily}\``
    );
  }

  lines.push(
    '',
    `## ESLint Design Guardrails (${designRules.length} rules)`,
    '',
    'Auto-generated from `apps/web/eslint.config.js` and `apps/web/eslint-rules/*`.',
    ''
  );

  for (const rule of designRules) {
    const summary = rule.description ?? 'Enforced custom ESLint rule.';
    lines.push(`- **\`@jovie/${rule.id}\`** (${rule.severity}) — ${summary}`);
  }

  if (restrictedImports.length > 0) {
    lines.push(
      '',
      '### Restricted Local Atom Imports',
      '',
      '`no-restricted-imports` blocks these — use `@jovie/ui` instead:',
      ''
    );
    for (const entry of restrictedImports) {
      lines.push(`- \`${entry.banned}\` — ${entry.message}`);
    }
  }

  lines.push('');
  return `${GENERATED_HEADER}${lines.join('\n')}`;
}

export function generateLlmsDesignManifest({
  outPath = DEFAULT_OUT,
  write = true,
  repoRoot = REPO_ROOT,
} = {}) {
  const manifest = buildLlmsDesignManifest({ repoRoot });
  const previous = existsSync(outPath) ? readText(outPath) : null;
  const changed = previous !== manifest;

  if (write) {
    writeFileSync(outPath, manifest);
  }

  return { manifest, outPath, changed };
}

function parseArgs(argv) {
  const args = { check: false, out: DEFAULT_OUT, write: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      args.check = true;
      args.write = false;
    } else if (arg === '--out') {
      args.out = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const { manifest, outPath, changed } = generateLlmsDesignManifest({
    outPath: args.out,
    write: args.write,
  });

  if (args.check) {
    if (changed) {
      console.error(
        `❌ ${path.relative(REPO_ROOT, outPath)} is out of date. Run: pnpm ds:llms-manifest`
      );
      process.exit(1);
    }
    console.log(`✅ ${path.relative(REPO_ROOT, outPath)} is up to date`);
    return;
  }

  console.log(
    `Wrote ${path.relative(REPO_ROOT, outPath)} (${manifest.split('\n').length} lines)`
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
