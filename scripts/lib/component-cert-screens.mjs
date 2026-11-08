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
 * - against the base registry, debt may grow only for a screen being enrolled.
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

/** Roots whose .tsx files the certificate can judge as components. */
export const SCREEN_COMPONENT_ROOTS = Object.freeze([
  'apps/web/components/',
  'apps/web/app/',
  'packages/ui/',
]);

/**
 * Files a screen imports that draw nothing a customer sees: context providers,
 * analytics and pixel loaders, and dev-only tools. They stay out of the screen
 * count so its debt is UI a customer can see.
 */
const NOT_CUSTOMER_UI =
  /(^|\/)(providers|dev)\/|(Provider|Context|Pixel|Analytics)\.tsx$/;

export function isCustomerUi(rel) {
  return (
    SCREEN_COMPONENT_ROOTS.some(r => rel.startsWith(r)) &&
    !NOT_CUSTOMER_UI.test(rel)
  );
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
 * The registry as the base ref has it, so the gate can refuse debt growth.
 * Null when the ref or the file is not there (a shallow checkout, or the
 * registry's first PR), which skips only the growth check.
 */
export function readBaseScreens(root, rel, ref) {
  if (!ref) return null;
  try {
    const text = execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @returns {Map<string, string[]>} screen id -> component paths it renders */
export function screenComponents(root, screens) {
  const out = new Map();
  for (const [id, screen] of Object.entries(screens.screens ?? {})) {
    const { components } = importClosure(root, routeEntries(root, screen.page));
    out.set(id, components.filter(isCustomerUi));
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
  const certs = new Map(report.certificates.map(c => [c.component, c]));
  const debt = screens.debt ?? {};
  const rendered = new Map(); // component -> screens
  for (const [id, list] of byScreen) {
    if (!list.length) errors.push(`screen ${id}: page renders no component`);
    for (const c of list) rendered.set(c, [...(rendered.get(c) ?? []), id]);
  }
  for (const [component, ids] of rendered) {
    const failing = failingCriteria(certs.get(component), criteria);
    const allowed = new Set(owedCriteria(debt[component]));
    const fresh = failing.filter(id => !allowed.has(id));
    if (fresh.length)
      failures.push({ component, screens: ids, criteria: fresh });
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
    for (const [component, entry] of Object.entries(debt)) {
      const before = new Set(owedCriteria(base.debt[component]));
      const added = owedCriteria(entry).filter(id => !before.has(id));
      if (added.length && !newScreenComponents.has(component))
        errors.push(
          `debt for ${component} grew (${added.join(', ')}); debt only shrinks, except for a screen being enrolled`
        );
    }
  }
  const perScreen = [...byScreen].map(([id, list]) => {
    const owing = list.filter(
      c => failingCriteria(certs.get(c), criteria).length
    );
    return { id, components: list.length, passing: list.length - owing.length };
  });
  return {
    ok: !errors.length && !failures.length && !stale.length,
    errors,
    failures,
    stale,
    perScreen,
  };
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
        `  ${f.component} [${f.criteria.join(', ')}] on ${f.screens.join(', ')}`
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
                ? Object.entries(crit?.states ?? {})
                    .filter(([, v]) => v.status === 'fail')
                    .map(([s]) => s)
                    .join(', ')
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
  return Object.fromEntries(
    Object.entries(debt).sort(([a], [b]) => a.localeCompare(b))
  );
}
