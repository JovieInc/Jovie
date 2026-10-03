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
 *   - nav-label-matches-destination (deterministic): every navigation entry
 *     is parsed from the TypeScript AST and its label must be bound to the
 *     destination it names (persona labels to their own solutions page,
 *     "Founders" → /cli is the known failure). An unparseable entry or an
 *     unbound label fails closed.
 *   - homepage CTA lock: HOMEPAGE_LAUNCH_COPY.hero.search.action and
 *     LANDING_PAGE_HOMEPAGE_LOCK.primaryAction are read from the named lock
 *     declarations and must stay 'Find me' — not "Get started".
 *   - locked atoms: SHARED_TOKENS keeps optical-grid:4px, control:32/510,
 *     control-compact:28/620.
 *
 * dominant-first-hierarchy, progressive-depth, and proximal-proof are
 * visual/semantic rules. They are certified only by a named evaluator
 * receipt (the rendered-eval + taste corpus stream, JOV-6040), never by a
 * static check. Until that receipt exists each rule reports
 * `visual-evaluator-missing` / not-certified, and the gate stays green only
 * through a dated pending-evaluator record in the registry that JOV-6040
 * must replace. No record, an expired record, or a missing receipt is red.
 *
 * Fail-closed: a missing scan root or a policy rule that loses its verbatim
 * statement is red, never advisory.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// `typescript` loads on first parse, not at import: scanned-paths.mjs pulls
// this module's root constants into sparse CI checkouts (e.g. the rolling-ci
// FX finisher) that ship no node_modules.
const requireFromHere = createRequire(import.meta.url);
/** @type {typeof import('typescript')} */
let ts;

function parseTs(relPath, sourceText) {
  ts ??= requireFromHere('typescript');
  return ts.createSourceFile(
    relPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function literalText(node) {
  const expr = unwrapExpression(node);
  if (
    expr &&
    (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
  ) {
    return expr.text;
  }
  return null;
}

function propertyKey(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/** Map of statically named properties; `opaque` if spreads/computed keys. */
function objectProperties(node) {
  const props = new Map();
  let opaque = false;
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyKey(prop.name);
      if (key) props.set(key, prop.initializer);
      else opaque = true;
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      props.set(prop.name.text, prop.name);
    } else {
      opaque = true;
    }
  }
  return { props, opaque };
}

function lineOf(sourceFile, node) {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function appRouteName(node) {
  const expr = unwrapExpression(node);
  if (
    expr &&
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'APP_ROUTES'
  ) {
    return expr.name.text;
  }
  return null;
}

/**
 * Resolves a nav href to a destination key: the APP_ROUTES member for a
 * direct `APP_ROUTES.X` or template `${APP_ROUTES.X}#anchor` href, or the
 * literal URL for an external https link. Anything else is unparseable.
 */
function navDestination(node) {
  const direct = appRouteName(node);
  if (direct) return direct;
  const expr = unwrapExpression(node);
  if (
    ts.isTemplateExpression(expr) &&
    expr.head.text === '' &&
    expr.templateSpans.length === 1
  ) {
    const route = appRouteName(expr.templateSpans[0].expression);
    if (route) return route;
  }
  const text = literalText(expr);
  if (text && /^https:\/\//.test(text)) return text;
  return null;
}

/**
 * Every object literal carrying an `href` or `label` is a navigation entry.
 * Flyout menus (label + `links`) are containers, not destinations. Anything
 * the parser cannot resolve is returned as unparseable so it fails closed.
 */
export function collectNavEntries(relPath, sourceText) {
  const sourceFile = parseTs(relPath, sourceText);
  const entries = [];
  const unparseable = [];
  const visit = node => {
    if (ts.isObjectLiteralExpression(node)) {
      const { props, opaque } = objectProperties(node);
      const hasHref = props.has('href');
      const hasLabel = props.has('label');
      const line = lineOf(sourceFile, node);
      if (hasHref || hasLabel) {
        if (hasLabel && !hasHref && props.has('links') && !opaque) {
          // Flyout menu container; its links are visited below.
        } else if (!hasHref || !hasLabel) {
          unparseable.push({
            line,
            reason: `entry has ${hasHref ? 'an href but no' : 'a label but no'} ${hasHref ? 'label' : 'href'}`,
          });
        } else {
          const label = literalText(props.get('label'));
          const destination = navDestination(props.get('href'));
          if (label == null) {
            unparseable.push({ line, reason: 'label is not a string literal' });
          } else if (destination == null) {
            unparseable.push({
              line,
              reason: `href for "${label}" is not APP_ROUTES.X, \`\${APP_ROUTES.X}#anchor\`, or an https URL`,
            });
          } else {
            entries.push({ label, destination, line });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { entries, unparseable };
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

/**
 * Every non-persona navigation label and the destination(s) it may name.
 * Persona labels bind generically to their own SOLUTIONS_<PERSONA> page, so
 * an audience without a page cannot borrow an unrelated one. A new label
 * must be declared here with its destination before it can ship.
 */
export const NAV_LABEL_DESTINATIONS = Object.freeze({
  Product: ['PRODUCT'],
  Pricing: ['PRICING'],
  'Log in': ['SIGNIN'],
  'Find yourself': ['START'],
  'Music Smart Links': ['SMART_LINKS'],
  'Fan Notifications': ['ARTIST_NOTIFICATIONS'],
  Notifications: ['ARTIST_NOTIFICATIONS'],
  'Instant Merch': ['INSTANT_MERCH'],
  'YouTube Thumbnails': ['YOUTUBE_THUMBNAILS'],
  CLI: ['CLI'],
  Developers: ['DEVELOPERS'],
  'Jovie Card': ['CARD'],
  'Artist Profiles': ['ARTIST_PROFILES'],
  Pay: ['PAY'],
  'Fan Capture': ['ARTIST_PROFILES'],
  'Fan Reactivation': ['ARTIST_PROFILES'],
  'Product Demo': ['DEMO_VIDEO'],
  'Release System': ['LAUNCH'],
  'Artist Directory': ['ARTISTS'],
  About: ['ABOUT'],
  Blog: ['BLOG'],
  Engineering: ['ENGINEERING'],
  Changelog: ['CHANGELOG'],
  Support: ['SUPPORT'],
  Contact: ['SUPPORT'],
  Compare: ['COMPARE'],
  Alternatives: ['ALTERNATIVES'],
  Instagram: ['https://instagram.com/meetjovie'],
  X: ['https://x.com/meetjovie'],
  Privacy: ['LEGAL_PRIVACY'],
  Terms: ['LEGAL_TERMS'],
});

function describeDestination(destination) {
  return destination.startsWith('https://')
    ? destination
    : `APP_ROUTES.${destination}`;
}

export function allowedNavDestinations(label) {
  const key = label.trim();
  if (PERSONA_LABELS.has(key.toLowerCase())) {
    return [`SOLUTIONS_${key.toUpperCase()}`];
  }
  return Object.hasOwn(NAV_LABEL_DESTINATIONS, key)
    ? NAV_LABEL_DESTINATIONS[key]
    : null;
}

export function scanNavSemantics(relPath, sourceText) {
  const findings = [];
  const { entries, unparseable } = collectNavEntries(relPath, sourceText);
  for (const { line, reason } of unparseable) {
    findings.push({
      path: relPath,
      rule: 'nav-entry-unparseable',
      detail: `line ${line}: ${reason} — every navigation entry must be validated, failing closed`,
    });
  }
  if (entries.length === 0 && unparseable.length === 0) {
    findings.push({
      path: relPath,
      rule: 'nav-entry-unparseable',
      detail:
        'no navigation entries parsed — label/destination detector is blind, failing closed',
    });
  }
  for (const { label, destination, line } of entries) {
    const allowed = allowedNavDestinations(label);
    if (!allowed) {
      findings.push({
        path: relPath,
        rule: 'nav-label-unbound',
        detail: `line ${line}: label "${label}" has no declared destination in NAV_LABEL_DESTINATIONS — bind it before it ships`,
      });
      continue;
    }
    if (allowed.includes(destination)) continue;
    const persona = PERSONA_LABELS.has(label.trim().toLowerCase());
    findings.push({
      path: relPath,
      rule: 'nav-label-route-mismatch',
      detail:
        persona && TOOLING_ROUTES.has(destination)
          ? `line ${line}: persona label "${label}" routes to developer/tooling destination APP_ROUTES.${destination}`
          : `line ${line}: label "${label}" must route to ${allowed.map(describeDestination).join(' or ')}, got ${describeDestination(destination)}`,
    });
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

/** Initializer of a top-level `const NAME = ...` declaration, unwrapped. */
function findConstInitializer(relPath, sourceText, name) {
  const sourceFile = parseTs(relPath, sourceText);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return unwrapExpression(declaration.initializer);
      }
    }
  }
  return null;
}

/** Follows a static property path through nested object literals. */
function readLockPath(relPath, sourceText, declaration, path) {
  let node = findConstInitializer(relPath, sourceText, declaration);
  if (!node)
    return { found: false, reason: `${declaration} declaration missing` };
  for (const key of path) {
    if (!ts.isObjectLiteralExpression(node)) {
      return {
        found: false,
        reason: `${declaration} is not an object literal`,
      };
    }
    const next = objectProperties(node).props.get(key);
    if (!next) {
      return {
        found: false,
        reason: `${declaration}.${path.join('.')} missing`,
      };
    }
    node = unwrapExpression(next);
  }
  const value = literalText(node);
  return value == null
    ? {
        found: false,
        reason: `${declaration}.${path.join('.')} is not a string literal`,
      }
    : { found: true, value };
}

export const HOMEPAGE_PRIMARY_ACTION = 'Find me';
export const LOCKED_SHARED_TOKENS = Object.freeze([
  'optical-grid:4px',
  'control:32/510',
  'control-compact:28/620',
]);

export function scanTasteLocks(repoRoot = DEFAULT_ROOT, sources = {}) {
  const grammar =
    sources[LANDING_GRAMMAR_SOURCE] ??
    readRequired(repoRoot, LANDING_GRAMMAR_SOURCE);
  const homepage =
    sources[HOMEPAGE_COPY_SOURCE] ??
    readRequired(repoRoot, HOMEPAGE_COPY_SOURCE);
  const findings = [];

  // Bound to the named lock declarations, not an unanchored regex: a decoy
  // 'Find me' elsewhere in the file cannot satisfy the founder lock.
  const searchAction = readLockPath(
    HOMEPAGE_COPY_SOURCE,
    homepage,
    'HOMEPAGE_LAUNCH_COPY',
    ['hero', 'search', 'action']
  );
  if (!searchAction.found || searchAction.value !== HOMEPAGE_PRIMARY_ACTION) {
    findings.push({
      path: HOMEPAGE_COPY_SOURCE,
      rule: 'homepage-cta-lock',
      detail: `HOMEPAGE_LAUNCH_COPY.hero.search.action must stay "${HOMEPAGE_PRIMARY_ACTION}" (founder lock), found ${searchAction.found ? `"${searchAction.value}"` : `<${searchAction.reason}>`}`,
    });
  }
  const lockAction = readLockPath(
    LANDING_GRAMMAR_SOURCE,
    grammar,
    'LANDING_PAGE_HOMEPAGE_LOCK',
    ['primaryAction']
  );
  if (!lockAction.found || lockAction.value !== HOMEPAGE_PRIMARY_ACTION) {
    findings.push({
      path: LANDING_GRAMMAR_SOURCE,
      rule: 'homepage-cta-lock',
      detail: `LANDING_PAGE_HOMEPAGE_LOCK.primaryAction must stay "${HOMEPAGE_PRIMARY_ACTION}" — not "Get started", found ${lockAction.found ? `"${lockAction.value}"` : `<${lockAction.reason}>`}`,
    });
  }
  const sharedTokens = findConstInitializer(
    LANDING_GRAMMAR_SOURCE,
    grammar,
    'SHARED_TOKENS'
  );
  const tokenValues =
    sharedTokens && ts.isArrayLiteralExpression(sharedTokens)
      ? sharedTokens.elements.map(literalText)
      : [];
  for (const token of LOCKED_SHARED_TOKENS) {
    if (!tokenValues.includes(token)) {
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

export const VISUAL_EVALUATOR_MISSING = 'visual-evaluator-missing';
export const PENDING_EVALUATOR_OWNER = 'JOV-6040';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Visual-semantic rules are fail-closed. A rule is certified only when its
 * registry entry names an `evaluatorReceipt` that exists in the repo (the
 * JOV-6040 rendered-eval + taste corpus binding). Without one the rule is
 * `visual-evaluator-missing` / not-certified, and the gate is green only
 * while a dated pending-evaluator record owned by JOV-6040 allowlists the
 * gap. A missing, malformed, expired, or stale record is red.
 */
export function certifyVisualRules(
  policy,
  { repoRoot = DEFAULT_ROOT, today = todayIso() } = {}
) {
  const rules = Array.isArray(policy?.rules) ? policy.rules : [];
  const pending = Array.isArray(policy?.pendingEvaluators)
    ? policy.pendingEvaluators
    : [];
  const visualIds = FOUNDER_RULES.filter(
    rule => rule.classification === 'visual-semantic'
  ).map(rule => rule.id);
  const errors = [];
  const statuses = [];

  for (const record of pending) {
    if (!visualIds.includes(record?.ruleId)) {
      errors.push(
        `pendingEvaluators: ${record?.ruleId ?? '<missing ruleId>'} is not a visual-semantic founder rule — only unevaluated visual rules may be deferred`
      );
    }
  }

  for (const id of visualIds) {
    const rule = rules.find(item => item.id === id);
    const records = pending.filter(item => item?.ruleId === id);
    if (records.length > 1) {
      errors.push(`${id}: duplicate pending-evaluator records`);
    }
    const record = records[0];
    const receipt = rule?.evaluatorReceipt;

    if (typeof receipt === 'string' && receipt.length > 0) {
      if (existsSync(resolve(repoRoot, receipt))) {
        statuses.push({ id, status: 'certified', evaluator: receipt });
      } else {
        statuses.push({
          id,
          status: 'not-certified',
          reason: VISUAL_EVALUATOR_MISSING,
        });
        errors.push(
          `${VISUAL_EVALUATOR_MISSING}: ${id} names evaluator receipt ${receipt}, which does not exist`
        );
      }
      if (record) {
        errors.push(
          `${id}: evaluator receipt is wired — remove the stale pending-evaluator record`
        );
      }
      continue;
    }

    statuses.push({
      id,
      status: 'not-certified',
      reason: VISUAL_EVALUATOR_MISSING,
      pendingUntil: record?.expiresOn ?? null,
    });
    if (!record) {
      errors.push(
        `${VISUAL_EVALUATOR_MISSING}: ${id} is blocking but no evaluator receipt certifies it and no dated pending-evaluator record allowlists the gap — failing closed`
      );
      continue;
    }
    if (record.status !== VISUAL_EVALUATOR_MISSING) {
      errors.push(
        `${id}: pending-evaluator record status must be ${VISUAL_EVALUATOR_MISSING}`
      );
    }
    if (record.owner !== PENDING_EVALUATOR_OWNER) {
      errors.push(
        `${id}: pending-evaluator record must be owned by ${PENDING_EVALUATOR_OWNER}, the taste stream that replaces it`
      );
    }
    if (
      !ISO_DATE.test(record.recordedOn ?? '') ||
      !ISO_DATE.test(record.expiresOn ?? '')
    ) {
      errors.push(
        `${id}: pending-evaluator record needs ISO recordedOn and expiresOn dates`
      );
    } else if (record.expiresOn < record.recordedOn) {
      errors.push(
        `${id}: pending-evaluator record expires before it was recorded`
      );
    } else if (today > record.expiresOn) {
      errors.push(
        `${VISUAL_EVALUATOR_MISSING}: ${id} pending-evaluator record expired on ${record.expiresOn} — ${PENDING_EVALUATOR_OWNER} must wire the evaluator receipt`
      );
    }
  }
  return { errors, statuses };
}

function designSurfacesPolicy(registry) {
  return (
    registry?.invariants?.find(item => item.id === DESIGN_SURFACES_INVARIANT_ID)
      ?.policy?.value ?? {}
  );
}

/** Per-rule certification status for reporting (not-certified is explicit). */
export function designSurfacesCertification(registry, options = {}) {
  const { statuses } = certifyVisualRules(
    designSurfacesPolicy(registry),
    options
  );
  const visual = new Map(statuses.map(item => [item.id, item]));
  return FOUNDER_RULES.map(
    rule =>
      visual.get(rule.id) ?? {
        id: rule.id,
        status: 'certified',
        evaluator: 'deterministic source gate',
      }
  );
}

export function formatCertificationSummary(certification) {
  const notCertified = certification.filter(
    item => item.status !== 'certified'
  );
  const certified = certification.length - notCertified.length;
  const detail = notCertified
    .map(
      item =>
        `${item.id} (${item.reason}${item.pendingUntil ? `, pending ${PENDING_EVALUATOR_OWNER} until ${item.pendingUntil}` : ''})`
    )
    .join(', ');
  return `design-surfaces-v1: ${certified}/${certification.length} founder rules certified${notCertified.length ? `; NOT certified: ${detail}` : ''}`;
}

export function validateDesignSurfacesContract(registry, options = {}) {
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
  errors.push(...certifyVisualRules(policy, options).errors);
  return errors;
}

/**
 * @param {string} [repoRoot]
 * @param {{ files?: Record<string, string>, registry?: any, today?: string }} [options]
 */
export function validateDesignSurfaces(
  repoRoot = DEFAULT_ROOT,
  { files = {}, registry = readInvariantRegistry(repoRoot), today } = {}
) {
  const findings = scanRuntime(repoRoot, files);
  return [
    ...validateDesignSurfacesContract(registry, { repoRoot, today }),
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
  process.stdout.write(
    `${formatCertificationSummary(
      designSurfacesCertification(readInvariantRegistry(DEFAULT_ROOT))
    )}\n`
  );
}
