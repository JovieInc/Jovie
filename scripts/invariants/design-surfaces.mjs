#!/usr/bin/env node
/**
 * JOV-INV-038: founder design invariants are certification rules, not
 * prompt-only guidance (JOV-6039, extends the blocking-ui pack locked by
 * Tim 2026-08-30 — no second invariant set).
 *
 * The canonical registry is the authority. This validator binds the
 * `jovie-design-invariants/v1` policy contract — the eight founder-approved
 * statements are embedded here verbatim so a registry edit cannot silently
 * reinterpret taste — and runs the deterministic subset against checked-in
 * marketing/app surfaces:
 *
 *   - zero-or-one-primary-action    (deterministic): the existing
 *     one-primary-action-per-screen-v1 blocking-ui detector must stay wired
 *     into the structural web lane.
 *   - route-intent                  (deterministic): every marketing recipe
 *     declares an audience and the grammar projects it per route type.
 *   - section-earns-place           (deterministic): every landing-page
 *     family carries content slots and bound invariant ids.
 *   - no-internal-scaffolding-copy  (deterministic): customer-facing copy
 *     sources never contain scaffolding tokens ("proof kit", lorem ipsum,
 *     bare TBD/TODO/placeholder strings, agent-instruction leaks).
 *   - nav-label-matches-destination (deterministic): persona nav labels may
 *     not route to developer/tooling surfaces ("Founders" → /cli is the
 *     known failure), and tool labels must land on their tool route.
 *   - homepage CTA lock: the hero search action stays "Find me" and the
 *     grammar lock keeps primaryAction 'Find me' — not "Get started".
 *   - locked atoms: optical-grid:4px, control:32/510, control-compact:28/620.
 *
 * dominant-first-hierarchy, progressive-depth, and proximal-proof are
 * visual/semantic evals: they are certified by the rendered-eval + taste
 * corpus stream (JOV-6040), not faked as static checks.
 *
 * Fail-closed: a missing scan root or a policy rule that loses its verbatim
 * statement is red, never advisory.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const DESIGN_SURFACES_INVARIANT_ID = 'JOV-INV-038';
export const DESIGN_SURFACES_SCHEMA = 'jovie-design-invariants/v1';
export const DESIGN_SURFACES_SLUG =
  'jovie/coordination/founder-design-invariants-v1';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Copy-bearing marketing surfaces scanned for scaffolding leaks. */
export const MARKETING_COPY_ROOTS = Object.freeze([
  'apps/web/data',
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
  'apps/web/components/site',
]);

/**
 * Copy-bearing product UI surfaces. JOV-INV-038 scopes `app-ui`, so the
 * scaffolding scan covers the signed-in app, onboarding, billing, public
 * profiles, and the shared feature/shell components that render their copy.
 */
export const APP_UI_COPY_ROOTS = Object.freeze([
  'apps/web/app/app',
  'apps/web/app/onboarding',
  'apps/web/app/account',
  'apps/web/app/billing',
  'apps/web/app/[username]',
  'apps/web/components/features',
  'apps/web/components/onboarding',
  'apps/web/components/shell',
  'apps/web/components/organisms',
  'apps/web/components/molecules',
  'apps/web/components/jovie',
]);

export const DESIGN_SURFACE_ROOTS = Object.freeze([
  ...MARKETING_COPY_ROOTS,
  ...APP_UI_COPY_ROOTS,
]);

export const NAVIGATION_SOURCE = 'apps/web/data/marketingNavigation.ts';
export const LANDING_GRAMMAR_SOURCE =
  'apps/web/data/marketing/landingPageGrammar.ts';
export const RECIPES_SOURCE = 'apps/web/data/marketing/recipes.ts';
export const HOMEPAGE_COPY_SOURCE = 'apps/web/data/homepageLaunchCopy.ts';
export const CI_FAST_LANES_SOURCE = 'scripts/ci-fast-lanes.mjs';
export const BLOCKING_UI_PACK_TEST =
  'apps/web/tests/unit/design-system/one-primary-action-per-screen-v1.test.ts';

export const FIXTURE_ROOT = 'scripts/invariants/fixtures/design-surfaces';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  '__tests__',
  'tests',
  'fixtures',
  'storybook',
]);

function isExcludedSource(relPath) {
  // Fixture data files (e.g. demo-fixtures.ts) are excluded like fixtures/
  // directories: they hold sample records, not authored product copy.
  return (
    /\.(test|spec|stories)\.(ts|tsx|js|jsx)$/.test(relPath) ||
    /(?:^|[/._-])fixtures\.(ts|tsx|js|jsx)$/.test(relPath)
  );
}

function posixRel(repoRoot, abs) {
  return relative(repoRoot, abs).split('\\').join('/');
}

function walkFiles(absDir, out) {
  if (!existsSync(absDir)) return;
  const stat = statSync(absDir);
  if (stat.isFile()) {
    out.push(absDir);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const next = join(absDir, entry.name);
    if (entry.isDirectory()) walkFiles(next, out);
    else out.push(next);
  }
}

export function collectCopySurfaceFiles(repoRoot = DEFAULT_ROOT, files = {}) {
  if (Object.keys(files).length > 0) {
    return Object.keys(files).filter(
      rel => SOURCE_EXT.has(extname(rel)) && !isExcludedSource(rel)
    );
  }
  const absFiles = [];
  for (const root of DESIGN_SURFACE_ROOTS) {
    const abs = resolve(repoRoot, root);
    if (!existsSync(abs)) {
      throw new Error(
        `design-surfaces scan root missing (ENOENT is FAIL, not advisory): ${root}`
      );
    }
    walkFiles(abs, absFiles);
  }
  const relFiles = absFiles
    .map(abs => posixRel(repoRoot, abs))
    .filter(rel => SOURCE_EXT.has(extname(rel)) && !isExcludedSource(rel))
    .sort();
  if (relFiles.length === 0) {
    throw new Error(
      'design-surfaces scanned zero copy files — detector is blind, failing closed'
    );
  }
  return relFiles;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`
    );
}

/**
 * Founder-approved statements, verbatim (JOV-6039). The registry must carry
 * these exactly — drift here is a silent taste reinterpretation and fails.
 */
export const FOUNDER_RULES = Object.freeze([
  {
    id: 'zero-or-one-primary-action',
    statement:
      'Zero or one primary action per surface/section. A section does not need an action, but if it has one, there is exactly one primary action. The same principle applies inside product surfaces (page, rail, toolbar, etc.).',
    classification: 'deterministic',
  },
  {
    id: 'dominant-first-hierarchy',
    statement:
      'One dominant thing to perceive first. Visual hierarchy should be intentionally cinematic: the primary idea dominates; secondary information recedes substantially rather than competing at nearly equal weight.',
    classification: 'visual-semantic',
  },
  {
    id: 'progressive-depth',
    statement:
      'Depth is progressive, not simultaneous. Keep default surfaces clean; reveal richer information through hover/popover/tooltips/drill-down where appropriate. Prefer information-dense visual primitives (icons, progress, etc.) over unnecessary text.',
    classification: 'visual-semantic',
  },
  {
    id: 'route-intent',
    statement:
      'Route intent beats global product completeness. Copy and composition must be specific to the landing-page intent/ICP. A founder page should speak to founders; a developer page to developers; an artist claim/experiment page to that exact artist/use case. Never dilute a specific route merely to explain the entire product.',
    classification: 'deterministic',
  },
  {
    id: 'proximal-proof',
    statement:
      'Claims need proximal, route-specific proof. Proof should support the promise being made on that route, not generic proof inserted mechanically.',
    classification: 'visual-semantic',
  },
  {
    id: 'section-earns-place',
    statement:
      'Every section earns its place. No template filler or sections without a user-facing job.',
    classification: 'deterministic',
  },
  {
    id: 'no-internal-scaffolding-copy',
    statement:
      'Internal scaffolding must never become customer-facing copy. Component names, implementation notes, agent instructions, placeholders such as "proof kit," and other internal language are certification failures.',
    classification: 'deterministic',
  },
  {
    id: 'nav-label-matches-destination',
    statement:
      'Navigation semantics must match destination semantics. Link/flyout labels may not misrepresent their targets (e.g. "Founders" cannot route to a CLI page). Machine certification should verify label/route intent alignment.',
    classification: 'deterministic',
  },
]);

export const RULE_CLASSIFICATIONS = Object.freeze(
  FOUNDER_RULES.map(rule => rule.classification)
);

const SCAFFOLDING_ANYWHERE = Object.freeze([
  { token: /\bproof\s*kits?\b/i, detail: '"proof kit" placeholder language' },
  { token: /\blorem\s+ipsum\b/i, detail: 'lorem ipsum placeholder copy' },
  {
    token: /\bagent\s+instructions?\b/i,
    detail: 'agent-instruction leak into customer copy',
  },
]);

// TBD/TODO/FIXME are matched case-sensitively: product UI legitimately uses
// the lowercase 'todo' task status and the 'Todo' status label.
const BARE_SCAFFOLDING_MARKER = /['"`](?:TBD|TODO|FIXME)['"`]/;
const BARE_PLACEHOLDER_STRING = /['"`](?:placeholder|lorem ipsum)['"`]/i;

const PLACEHOLDER_LANGUAGE = /\bplaceholder\s+(?:text|copy|image|content)\b/i;

export function scanScaffoldingCopy(relPath, sourceText) {
  const source = stripComments(sourceText);
  const findings = [];
  for (const { token, detail } of SCAFFOLDING_ANYWHERE) {
    if (token.test(source)) {
      findings.push({
        path: relPath,
        rule: 'internal-scaffolding-copy',
        detail,
      });
    }
  }
  if (
    BARE_SCAFFOLDING_MARKER.test(source) ||
    BARE_PLACEHOLDER_STRING.test(source)
  ) {
    findings.push({
      path: relPath,
      rule: 'internal-scaffolding-copy',
      detail: 'bare TBD/TODO/FIXME/placeholder string in copy source',
    });
  }
  if (PLACEHOLDER_LANGUAGE.test(source)) {
    findings.push({
      path: relPath,
      rule: 'internal-scaffolding-copy',
      detail: 'placeholder-language leak into customer copy',
    });
  }
  return findings;
}

// Every MarketingNavLink literal form: a direct `APP_ROUTES.X` href or a
// template `${APP_ROUTES.X}...` href, and a label in single, double, or
// backtick quotes, in either key order. The gap between keys may not cross
// an object brace, so one link's label never pairs with the next link's href.
const NAV_HREF_FIRST_RE =
  /href:\s*(?:`\$\{\s*APP_ROUTES\.([A-Z_]+)\s*\}[^`]*`|APP_ROUTES\.([A-Z_]+))[^{}]{0,200}?label:\s*(['"`])((?:(?!\3).)+)\3/g;
const NAV_LABEL_FIRST_RE =
  /label:\s*(['"`])((?:(?!\1).)+)\1[^{}]{0,200}?href:\s*(?:`\$\{\s*APP_ROUTES\.([A-Z_]+)\s*\}[^`]*`|APP_ROUTES\.([A-Z_]+))/g;

function navPairs(source) {
  const pairs = [];
  for (const match of source.matchAll(NAV_HREF_FIRST_RE)) {
    pairs.push({ route: match[1] ?? match[2], label: match[4] });
  }
  for (const match of source.matchAll(NAV_LABEL_FIRST_RE)) {
    pairs.push({ route: match[3] ?? match[4], label: match[2] });
  }
  return pairs;
}

const PERSONA_LABELS = new Set([
  'founders',
  'artists',
  'creators',
  'authors',
  'musicians',
  'producers',
  'agencies',
  'managers',
  'labels',
]);
const TOOLING_ROUTES = new Set(['CLI', 'DEVELOPERS', 'DOCS']);
const TOOL_LABEL_ROUTE = Object.freeze({
  cli: 'CLI',
  developers: 'DEVELOPERS',
});

export function scanNavSemantics(relPath, sourceText) {
  const source = stripComments(sourceText);
  const findings = [];
  for (const { route, label } of navPairs(source)) {
    const key = label.trim().toLowerCase();
    if (PERSONA_LABELS.has(key) && TOOLING_ROUTES.has(route)) {
      findings.push({
        path: relPath,
        rule: 'nav-label-route-mismatch',
        detail: `persona label "${label}" routes to developer/tooling destination APP_ROUTES.${route}`,
      });
    }
    const expected = TOOL_LABEL_ROUTE[key];
    if (expected && route !== expected) {
      findings.push({
        path: relPath,
        rule: 'nav-label-route-mismatch',
        detail: `tool label "${label}" must route to APP_ROUTES.${expected}, got APP_ROUTES.${route}`,
      });
    }
  }
  return findings;
}

function readRequired(repoRoot, relPath) {
  const abs = resolve(repoRoot, relPath);
  if (!existsSync(abs)) {
    throw new Error(
      `design-surfaces required source missing (ENOENT is FAIL, not advisory): ${relPath}`
    );
  }
  return readFileSync(abs, 'utf8');
}

export function scanRouteIntent(repoRoot = DEFAULT_ROOT, sources = {}) {
  const recipes =
    sources[RECIPES_SOURCE] ?? readRequired(repoRoot, RECIPES_SOURCE);
  const grammar =
    sources[LANDING_GRAMMAR_SOURCE] ??
    readRequired(repoRoot, LANDING_GRAMMAR_SOURCE);
  const findings = [];

  const recipeBlock = recipes.slice(
    recipes.indexOf('export const MARKETING_RECIPES')
  );
  const recipeCount = (recipeBlock.match(/^\s+id: '/gm) ?? []).length;
  const audienceCount = (recipeBlock.match(/audience: '/g) ?? []).length;
  // A declared-but-empty job array carries no job, so only non-empty arrays
  // count toward the per-recipe and per-family totals.
  const sectionOrderCount = (
    recipeBlock.match(/sectionOrder:\s*\[\s*[^\]\s]/g) ?? []
  ).length;
  if (recipeCount === 0 || audienceCount !== recipeCount) {
    findings.push({
      path: RECIPES_SOURCE,
      rule: 'route-intent-missing',
      detail: `route-intent: ${audienceCount}/${recipeCount} recipes declare an audience — every landing route must bind an ICP`,
    });
  }
  if (recipeCount === 0 || sectionOrderCount !== recipeCount) {
    findings.push({
      path: RECIPES_SOURCE,
      rule: 'section-job-missing',
      detail: `section-earns-place: ${sectionOrderCount}/${recipeCount} recipes declare a non-empty sectionOrder of named section jobs`,
    });
  }
  if (!/audience:\s*recipe\.audience/.test(grammar)) {
    findings.push({
      path: LANDING_GRAMMAR_SOURCE,
      rule: 'route-intent-missing',
      detail:
        'route-intent: LANDING_PAGE_ROUTE_TYPES no longer projects recipe.audience — route intent is diluted',
    });
  }
  const familyBlock = grammar.slice(
    grammar.indexOf('export const LANDING_PAGE_FAMILIES')
  );
  const familyCount = (familyBlock.match(/^\s+id: '/gm) ?? []).length;
  const contentSlotCount = (
    familyBlock.match(/contentSlots:\s*\[\s*[^\]\s]/g) ?? []
  ).length;
  const invariantCount = (
    familyBlock.match(/invariantIds:\s*\[\s*[^\]\s]/g) ?? []
  ).length;
  if (
    familyCount === 0 ||
    contentSlotCount !== familyCount ||
    invariantCount !== familyCount
  ) {
    findings.push({
      path: LANDING_GRAMMAR_SOURCE,
      rule: 'section-job-missing',
      detail: `section-earns-place: ${contentSlotCount} non-empty contentSlots / ${invariantCount} non-empty invariantIds across ${familyCount} families — every family must carry a user-facing job`,
    });
  }
  return findings;
}

export function scanTasteLocks(repoRoot = DEFAULT_ROOT, sources = {}) {
  const grammar =
    sources[LANDING_GRAMMAR_SOURCE] ??
    readRequired(repoRoot, LANDING_GRAMMAR_SOURCE);
  const homepage =
    sources[HOMEPAGE_COPY_SOURCE] ??
    readRequired(repoRoot, HOMEPAGE_COPY_SOURCE);
  const findings = [];

  const searchAction = /search\s*:\s*\{[\s\S]*?action\s*:\s*'([^']+)'/.exec(
    stripComments(homepage)
  );
  if (!searchAction || searchAction[1] !== 'Find me') {
    findings.push({
      path: HOMEPAGE_COPY_SOURCE,
      rule: 'homepage-cta-lock',
      detail: `homepage hero search action must stay "Find me" (founder lock), found "${searchAction?.[1] ?? '<missing>'}"`,
    });
  }
  if (!/primaryAction:\s*'Find me'/.test(grammar)) {
    findings.push({
      path: LANDING_GRAMMAR_SOURCE,
      rule: 'homepage-cta-lock',
      detail:
        'LANDING_PAGE_HOMEPAGE_LOCK.primaryAction must stay "Find me" — not "Get started"',
    });
  }
  for (const token of [
    'optical-grid:4px',
    'control:32/510',
    'control-compact:28/620',
  ]) {
    if (!grammar.includes(`'${token}'`)) {
      findings.push({
        path: LANDING_GRAMMAR_SOURCE,
        rule: 'locked-atom-drift',
        detail: `locked token ${token} missing from SHARED_TOKENS`,
      });
    }
  }
  return findings;
}

export function scanBlockingUiWiring(repoRoot = DEFAULT_ROOT, sources = {}) {
  const lanes =
    sources[CI_FAST_LANES_SOURCE] ??
    readRequired(repoRoot, CI_FAST_LANES_SOURCE);
  const packTest = existsSync(resolve(repoRoot, BLOCKING_UI_PACK_TEST));
  const findings = [];
  if (!packTest) {
    findings.push({
      path: BLOCKING_UI_PACK_TEST,
      rule: 'primary-action-detector-missing',
      detail:
        'one-primary-action-per-screen-v1 detector missing — the invariant is unproven, not green',
    });
  }
  if (!lanes.includes('one-primary-action-per-screen-v1.test.ts')) {
    findings.push({
      path: CI_FAST_LANES_SOURCE,
      rule: 'primary-action-detector-unwired',
      detail:
        'one-primary-action-per-screen-v1 is no longer wired into the structural web lane — hard invariant must block promotion',
    });
  }
  return findings;
}

export function scanRuntime(repoRoot = DEFAULT_ROOT, files = {}) {
  const findings = [];
  for (const relPath of collectCopySurfaceFiles(repoRoot, files)) {
    const source =
      files[relPath] ??
      (existsSync(resolve(repoRoot, relPath))
        ? readFileSync(resolve(repoRoot, relPath), 'utf8')
        : null);
    if (source == null) continue;
    findings.push(...scanScaffoldingCopy(relPath, source));
    if (relPath === NAVIGATION_SOURCE) {
      findings.push(...scanNavSemantics(relPath, source));
    }
  }
  findings.push(...scanRouteIntent(repoRoot, files));
  findings.push(...scanTasteLocks(repoRoot, files));
  findings.push(...scanBlockingUiWiring(repoRoot, files));
  return findings;
}

/**
 * Deliberate-red fixtures mirror the repo layout under
 * fixtures/design-surfaces/<case>/ (e.g. apps/web/data/...). Each file is
 * injected at its repo-relative path so the same detectors that scan real
 * surfaces evaluate it; every other source falls back to the real repo,
 * which stays green.
 */
export function scanFixture(name, repoRoot = DEFAULT_ROOT) {
  const fixtureDir = resolve(repoRoot, FIXTURE_ROOT, name);
  if (!existsSync(fixtureDir)) {
    throw new Error(
      `design-surfaces fixture missing (ENOENT is FAIL, not advisory): ${FIXTURE_ROOT}/${name}`
    );
  }
  const absFiles = [];
  walkFiles(fixtureDir, absFiles);
  const files = {};
  for (const abs of absFiles) {
    files[posixRel(fixtureDir, abs)] = readFileSync(abs, 'utf8');
  }
  return scanRuntime(repoRoot, files);
}

export function validateDesignSurfacesContract(registry) {
  const invariant = registry?.invariants?.find(
    item => item.id === DESIGN_SURFACES_INVARIANT_ID
  );
  if (!invariant) {
    return [`${DESIGN_SURFACES_INVARIANT_ID} is missing from the registry`];
  }
  const policy = invariant.policy?.value ?? {};
  const errors = [];
  if (policy.schema !== DESIGN_SURFACES_SCHEMA) {
    errors.push(`policy schema must be ${DESIGN_SURFACES_SCHEMA}`);
  }
  if (policy.certificationContract !== 'jovie.certification/v1') {
    errors.push('must compose with jovie.certification/v1, not a second silo');
  }
  if (policy.hardInvariantFailure !== 'blocks-promotion') {
    errors.push('a hard invariant failure must block promotion');
  }
  if (policy.gbrainSlug !== DESIGN_SURFACES_SLUG) {
    errors.push(`gbrain slug must be ${DESIGN_SURFACES_SLUG}`);
  }
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  for (const expected of FOUNDER_RULES) {
    const rule = rules.find(item => item.id === expected.id);
    if (!rule) {
      errors.push(`missing founder rule ${expected.id}`);
      continue;
    }
    if (rule.statement !== expected.statement) {
      errors.push(
        `${expected.id}: statement drifted from founder-approved wording — do not reinterpret taste`
      );
    }
    if (rule.classification !== expected.classification) {
      errors.push(
        `${expected.id}: classification must be ${expected.classification}`
      );
    }
    if (rule.blocking !== true) {
      errors.push(`${expected.id}: hard invariant must be blocking`);
    }
  }
  if (rules.length !== FOUNDER_RULES.length) {
    errors.push(
      `expected ${FOUNDER_RULES.length} founder rules, got ${rules.length}`
    );
  }
  const locks = policy.locks ?? {};
  if (locks.homepagePrimaryAction !== 'Find me') {
    errors.push('locks.homepagePrimaryAction must be "Find me"');
  }
  if (locks.opticalGrid !== 'optical-grid:4px') {
    errors.push('locks.opticalGrid must be "optical-grid:4px"');
  }
  for (const atom of ['control:32/510', 'control-compact:28/620']) {
    if (!locks.lockedAtoms?.includes(atom)) {
      errors.push(`locks.lockedAtoms must keep ${atom}`);
    }
  }
  if (locks.blockingUiPack !== 'one-primary-action-per-screen-v1') {
    errors.push(
      'must extend the existing one-primary-action-per-screen-v1 blocking-ui pack, not fork a second invariant set'
    );
  }
  return errors;
}

export function validateDesignSurfaces(
  repoRoot = DEFAULT_ROOT,
  { files = {}, registry = readInvariantRegistry(repoRoot) } = {}
) {
  const findings = scanRuntime(repoRoot, files);
  return [
    ...validateDesignSurfacesContract(registry),
    ...findings.map(item => `${item.rule}: ${item.path} — ${item.detail}`),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateDesignSurfaces();
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('design-surfaces-v1 founder invariants gate clean\n');
  }
}
