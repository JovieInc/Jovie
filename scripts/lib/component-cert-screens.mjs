/**
 * Screen certification (jovie.cert-screens/v1).
 *
 * `docs/design-system/cert-screens.json` lists the screens a customer sees,
 * each by its App Router page. Every component a screen's page can render
 * (its static import closure, see component-import-closure.mjs) must pass the
 * registry's criteria. Components that failed when their screen was enrolled
 * sit in `debt` with the criteria they failed; the gate lets those stand and
 * blocks everything else:
 *
 * - a component on a screen failing a criterion not in its debt (a new
 *   component, or a regression) blocks the merge;
 * - a debt entry that now passes, or that no screen renders any more, blocks
 *   too, so the debt is rewritten smaller (`--refresh`) in the PR that paid it;
 * - against the base registry, debt may grow only for a screen being enrolled
 *   or for a criterion the base registry did not list yet; criteria never drop.
 *
 * A screen with no debt left is must-pass by construction. Enrollment and the
 * ranked list of failing components are machine-driven (`--enroll`, `--issues`)
 * so an agent loop can expand coverage without hand-editing this file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importClosure, routeEntries } from './component-import-closure.mjs';

export const SCREENS_SCHEMA = 'jovie.cert-screens/v1';
const CLEAR = new Set(['pass', 'na']);

/**
 * A debt entry is the criteria a component still owes, written as one
 * comma-separated string ("a11y,states,tests") so the registry stays one line
 * per component. Arrays are read too.
 */
export function owedCriteria(entry) {
  if (Array.isArray(entry)) return entry;
  if (typeof entry !== 'string') return [];
  return entry
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

export function debtEntry(criteria) {
  return [...new Set(criteria)].sort().join(',');
}

/**
 * Registry maps keyed by component path (screen debt, state waivers, gates)
 * are kept sorted by path, in plain code-unit order (the same as Python's
 * sorted()), so a new entry lands at its own place instead of where every PR
 * appends, and two PRs collide only when their components are neighbours.
 */
export const SORT_COMMAND = 'node scripts/component-certificate.mjs --sort';

export function comparePaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortByPath(map = {}) {
  return Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => comparePaths(a, b))
  );
}

/** One error when `map` is not sorted by path, naming the first key out of place. */
export function unsortedPathErrors(label, map = {}) {
  const keys = Object.keys(map);
  const at = keys.findIndex(
    (key, i) => i && comparePaths(keys[i - 1], key) > 0
  );
  return at < 0
    ? []
    : [
        `${label} is not sorted by component path (${keys[at]} comes after ${keys[at - 1]}); run ${SORT_COMMAND}`,
      ];
}

/** Roots whose .tsx files the certificate can judge as components. */
export const SCREEN_COMPONENT_ROOTS = Object.freeze([
  'apps/web/components/',
  'apps/web/app/',
  'packages/ui/',
]);

/** Stages a screen can sit at in the funnel, nearest revenue last. */
export const SCREEN_STAGES = Object.freeze([
  'internal',
  'reach',
  'waitlist',
  'start',
  'chat',
  'claim',
  'paid',
]);

/**
 * Files a screen imports that draw nothing a customer sees stay out of the
 * screen count, so its debt is UI a customer can see: dev-only tools, context
 * providers, pixel loaders, the analytics loaders under providers/, and
 * `*Context.tsx` files that create a React context. A name alone is not
 * enough for a context file (HeaderSearchSurfaceFromContext draws a surface),
 * so pass the file's source; without it the file counts as UI.
 */
const DEV_ONLY = /(^|\/)dev\//;
const PROVIDER_OR_PIXEL = /(Provider|Providers|Pixel)\.tsx$/;
const ANALYTICS_LOADER = /(^|\/)providers\/\w*Analytics\.tsx$/;
const CONTEXT_FILE = /Context\.tsx$/;

export function isCustomerUi(rel, source) {
  if (!SCREEN_COMPONENT_ROOTS.some(r => rel.startsWith(r))) return false;
  if (DEV_ONLY.test(rel) || PROVIDER_OR_PIXEL.test(rel)) return false;
  if (ANALYTICS_LOADER.test(rel)) return false;
  if (
    CONTEXT_FILE.test(rel) &&
    typeof source === 'string' &&
    /\bcreateContext\s*[<(]/.test(source)
  )
    return false;
  return true;
}

export function readScreens(
  root,
  rel = 'docs/design-system/cert-screens.json'
) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  return JSON.parse(readFileSync(abs, 'utf8'));
}

/**
 * The registry at the merge base with the base ref, so the gate can refuse debt growth.
 * Null when the ref or the file is not there (a shallow checkout, or the
 * registry's first PR), which skips only the growth check.
 */
export function readBaseScreens(root, rel, ref) {
  if (!ref) return null;
  const git = args =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  // Compare with the commit this branch grew from, so debt paid on main after
  // the branch point is not read as this branch growing it back.
  let base = ref;
  try {
    base = git(['merge-base', ref, 'HEAD']) || ref;
  } catch {}
  try {
    return JSON.parse(git(['show', `${base}:${rel}`]));
  } catch {
    return null;
  }
}

/** @returns {Map<string, string[]>} screen id -> component paths it renders */
export function screenComponents(root, screens) {
  const out = new Map();
  const source = rel => {
    try {
      return readFileSync(join(root, rel), 'utf8');
    } catch {
      return undefined;
    }
  };
  for (const [id, screen] of Object.entries(screens.screens ?? {})) {
    // A screen whose page is gone renders nothing; the gate reports it.
    if (!screen.page || !existsSync(join(root, screen.page))) {
      out.set(id, []);
      continue;
    }
    const { components } = importClosure(root, routeEntries(root, screen.page));
    out.set(
      id,
      components.filter(rel => isCustomerUi(rel, source(rel)))
    );
  }
  return out;
}

/** Criteria a certificate fails, of those the registry gates. */
export function failingCriteria(cert, criteria) {
  if (!cert) return [...criteria];
  return criteria.filter(id => {
    const status = cert.criteria.find(k => k.id === id)?.status ?? 'unknown';
    return !CLEAR.has(status);
  });
}

/** State names whose certificate row failed. Empty when states is not recorded. */
export function failedStateNames(cert) {
  const states = cert?.criteria?.find(entry => entry.id === 'states')?.states;
  if (!states || typeof states !== 'object') return [];
  return Object.entries(states)
    .filter(([, row]) => row?.status === 'fail')
    .map(([name]) => name);
}

/**
 * @param {{certificates: any[]}} report
 * @param {any} screens registry
 * @param {Map<string, string[]>} byScreen
 * @param {any} [base] registry on the base branch, when readable
 */
export function evaluateScreenGates(report, screens, byScreen, base = null) {
  const errors = [];
  const failures = [];
  const stale = [];
  const criteria = screens.criteria ?? [];
  if (screens.schema !== SCREENS_SCHEMA)
    errors.push(`cert-screens: schema must be ${SCREENS_SCHEMA}`);
  if (!criteria.length) errors.push('cert-screens: needs a criteria list');
  errors.push(...unsortedPathErrors('cert-screens: debt', screens.debt));
  const certs = new Map(report.certificates.map(c => [c.component, c]));
  const debt = screens.debt ?? {};
  const rendered = new Map(); // component -> screens
  for (const [id, screen] of Object.entries(screens.screens ?? {}))
    if (screen.stage && !SCREEN_STAGES.includes(screen.stage))
      errors.push(
        `screen ${id}: stage must be one of ${SCREEN_STAGES.join(', ')}`
      );
  for (const [id, list] of byScreen) {
    if (!list.length)
      errors.push(
        `screen ${id}: page ${screens.screens?.[id]?.page ?? '(none)'} is missing or renders no component`
      );
    for (const c of list) rendered.set(c, [...(rendered.get(c) ?? []), id]);
  }
  for (const [component, ids] of rendered) {
    const failing = failingCriteria(certs.get(component), criteria);
    const allowed = new Set(owedCriteria(debt[component]));
    const fresh = failing.filter(id => !allowed.has(id));
    if (fresh.length) {
      const failure = { component, screens: ids, criteria: fresh };
      if (fresh.includes('states')) {
        const missingStates = failedStateNames(certs.get(component));
        if (missingStates.length) failure.missingStates = missingStates;
      }
      failures.push(failure);
    }
  }
  for (const [component, entry] of Object.entries(debt)) {
    const owed = owedCriteria(entry);
    if (!rendered.has(component)) {
      stale.push({ component, reason: 'no enrolled screen renders it' });
      continue;
    }
    const failing = new Set(failingCriteria(certs.get(component), criteria));
    const paid = owed.filter(id => !failing.has(id));
    if (paid.length)
      stale.push({ component, reason: `now passes ${paid.join(', ')}` });
  }
  if (base?.debt) {
    const enrolledNow = new Set(
      Object.keys(screens.screens ?? {}).filter(id => !base.screens?.[id])
    );
    const newScreenComponents = new Set(
      [...enrolledNow].flatMap(id => byScreen.get(id) ?? [])
    );
    // A criterion the base registry did not have yet starts as debt for
    // every component that fails it; after it lands, its debt only shrinks.
    const newCriteria = new Set(
      criteria.filter(id => !(base.criteria ?? []).includes(id))
    );
    for (const [component, entry] of Object.entries(debt)) {
      const before = new Set(owedCriteria(base.debt[component]));
      const added = owedCriteria(entry).filter(
        id => !before.has(id) && !newCriteria.has(id)
      );
      if (added.length && !newScreenComponents.has(component))
        errors.push(
          `debt for ${component} grew (${added.join(', ')}); debt only shrinks, except for a screen being enrolled or a criterion being added`
        );
    }
    for (const id of base.criteria ?? [])
      if (!criteria.includes(id))
        errors.push(
          `cert-screens: criterion ${id} was removed; screen criteria only grow`
        );
  }
  const perScreen = [...byScreen].map(([id, list]) => {
    const owing = list.filter(
      c => failingCriteria(certs.get(c), criteria).length
    );
    const screen = screens.screens?.[id] ?? {};
    return {
      id,
      route: screen.route ?? null,
      stage: screen.stage ?? null,
      components: list.length,
      passing: list.length - owing.length,
      gate: owing.length ? 'debt' : 'must-pass',
    };
  });
  return {
    ok: !errors.length && !failures.length && !stale.length,
    errors,
    failures,
    stale,
    perScreen,
  };
}

function formatCriterion(failure, id) {
  if (id === 'states' && failure.missingStates?.length)
    return `states missing ${failure.missingStates.join(', ')}`;
  return id;
}

export function formatScreenGate(result) {
  const lines = result.perScreen.map(
    s =>
      `  ${s.id.padEnd(30)} ${String(s.passing).padStart(4)}/${s.components} pass${s.passing === s.components ? ' (must-pass)' : ''}`
  );
  if (result.ok) return ['screen certificate gate: pass', ...lines].join('\n');
  return [
    'screen certificate gate failed:',
    ...result.errors.map(e => `  config: ${e}`),
    ...result.failures.map(
      f =>
        `  ${f.component} [${f.criteria.map(id => formatCriterion(f, id)).join(', ')}] on ${f.screens.join(', ')}`
    ),
    ...result.stale.map(
      s =>
        `  stale debt ${s.component}: ${s.reason} (run node scripts/component-cert-screens.mjs --refresh)`
    ),
    ...lines,
    'A component a screen renders must pass every criterion in docs/design-system/cert-screens.json.',
    'Fix it (node scripts/component-certificate.mjs --component <path> --spec prints what to fix), or render a certified component instead.',
  ].join('\n');
}

/**
 * Ranked work list for an agent loop: one row per failing component, the
 * components on the most screens first, then the fewest failing criteria.
 */
export function screenIssues(report, screens, byScreen) {
  const criteria = screens.criteria ?? [];
  const certs = new Map(report.certificates.map(c => [c.component, c]));
  const rows = new Map();
  for (const [id, list] of byScreen)
    for (const component of list) {
      const failing = failingCriteria(certs.get(component), criteria);
      if (!failing.length) continue;
      const row = rows.get(component) ?? {
        component,
        screens: [],
        criteria: failing,
        details: Object.fromEntries(
          failing.map(k => {
            const crit = certs.get(component)?.criteria.find(x => x.id === k);
            const states =
              k === 'states'
                ? failedStateNames(certs.get(component)).join(', ')
                : null;
            return [k, states || crit?.detail || crit?.status || 'unknown'];
          })
        ),
        spec: `node scripts/component-certificate.mjs --component ${component} --spec`,
      };
      row.screens.push(id);
      rows.set(component, row);
    }
  return [...rows.values()].sort(
    (a, b) =>
      b.screens.length - a.screens.length ||
      a.criteria.length - b.criteria.length ||
      a.component.localeCompare(b.component)
  );
}

/** Debt that matches the current report: only components that still fail. */
export function currentDebt(report, screens, byScreen) {
  const debt = {};
  for (const row of screenIssues(report, screens, byScreen))
    debt[row.component] = debtEntry(row.criteria);
  return sortByPath(debt);
}
