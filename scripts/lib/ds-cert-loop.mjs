/**
 * Design-system certification fix loop (jovie.ds-cert-loop/v1).
 *
 * Find: the static certifier lists every component that fails a static
 * criterion or has no gate entry. Plan: those components become fixed-size
 * work orders in path order. Fix: any worker (Claude, Codex, Summer) takes
 * an order. Verify: an order is done only when every component in it passes
 * every static criterion and has an exact gate entry, so the shrink-only
 * gate keeps it certified. Repeat until nothing is left, then stand down.
 *
 * Pure functions here; the CLI is scripts/ds-cert-loop.mjs.
 */

export const LOOP_SCHEMA = 'jovie.ds-cert-loop/v1';

/** Criteria the certifier decides from source alone. */
export const STATIC_CRITERIA = Object.freeze([
  'ds-owner',
  'tokens',
  'states',
  'tests',
  'a11y',
  'frontend-rules',
  'forced-caps',
]);

/** Criteria that need a source change, not only new evidence files. */
export const SOURCE_CRITERIA = Object.freeze([
  'ds-owner',
  'tokens',
  'frontend-rules',
  'forced-caps',
]);

const CLEAR = new Set(['pass', 'na']);

/**
 * Gate prefixes that cover a component with every static criterion.
 * @param {string} component
 * @param {Record<string, string[]>} gates
 */
export function staticGateFor(component, gates = {}) {
  return Object.entries(gates)
    .filter(([prefix]) => component.startsWith(prefix))
    .some(([, criteria]) =>
      STATIC_CRITERIA.every(id => (criteria ?? []).includes(id))
    );
}

/**
 * What still stands between one certificate and done.
 * @param {{component: string, criteria: {id: string, status: string}[]}} cert
 * @param {Record<string, string[]>} gates
 * @returns {{component: string, failing: string[], gated: boolean, done: boolean, source: boolean}}
 */
export function assessCertificate(cert, gates = {}) {
  const status = new Map(cert.criteria.map(row => [row.id, row.status]));
  const failing = STATIC_CRITERIA.filter(
    id => !CLEAR.has(status.get(id) ?? 'unknown')
  );
  const gated = staticGateFor(cert.component, gates);
  return {
    component: cert.component,
    failing,
    gated,
    done: !failing.length && gated,
    source: failing.some(id => SOURCE_CRITERIA.includes(id)),
  };
}

/**
 * Every component that is not done, in path order.
 * @param {{certificates: any[]}} report
 * @param {Record<string, string[]>} gates
 */
export function remaining(report, gates = {}) {
  return report.certificates
    .map(cert => assessCertificate(cert, gates))
    .filter(row => !row.done)
    .sort((a, b) => a.component.localeCompare(b.component));
}

/**
 * Split the remaining components into work orders of at most `size`.
 * Path order keeps each order inside a few directories, so orders rarely
 * touch the same files. The id is stable for the same remaining set.
 * @param {ReturnType<typeof remaining>} rows
 * @param {{size?: number, headSha?: string}} [options]
 */
export function planOrders(rows, { size = 30, headSha = 'unknown' } = {}) {
  if (!Number.isInteger(size) || size < 1)
    throw new Error(`order size must be a positive integer, got ${size}`);
  const orders = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const n = String(orders.length + 1).padStart(2, '0');
    orders.push({
      schema: LOOP_SCHEMA,
      id: `dsc-${n}`,
      headSha,
      components: slice.map(row => row.component),
      sourceFixes: slice.filter(row => row.source).length,
      failing: Object.fromEntries(
        slice.map(row => [row.component, row.failing])
      ),
      verify: `node scripts/ds-cert-loop.mjs verify --order <this file>`,
    });
  }
  return orders;
}

/**
 * Strict verification of one order: every component passes every static
 * criterion and is gated. Anything else is listed so the worker iterates.
 * @param {string[]} components
 * @param {{certificates: any[]}} report
 * @param {Record<string, string[]>} gates
 * @param {Record<string, string>} [skipped] component -> reason the worker skipped it
 */
export function verifyOrder(components, report, gates = {}, skipped = {}) {
  const byPath = new Map(report.certificates.map(c => [c.component, c]));
  const problems = [];
  let done = 0;
  for (const component of components) {
    const cert = byPath.get(component);
    if (skipped[component]) {
      // A skipped component that a gate still holds fails the certificate
      // gate in CI, so a revert must take its gate entry with it.
      const row = cert && assessCertificate(cert, gates);
      if (row?.gated && row.failing.length)
        problems.push(
          `${component}: skipped but still gated while it fails ${row.failing.join(', ')}; remove its gate entry`
        );
      continue;
    }
    if (!cert) {
      problems.push(`${component}: not found by the certifier`);
      continue;
    }
    const row = assessCertificate(cert, gates);
    if (row.done) {
      done += 1;
      continue;
    }
    if (row.failing.length)
      problems.push(`${component}: fails ${row.failing.join(', ')}`);
    if (!row.gated)
      problems.push(
        `${component}: no gate entry with all ${STATIC_CRITERIA.length} static criteria`
      );
  }
  const skippedCount = components.filter(c => skipped[c]).length;
  return {
    ok: !problems.length,
    done,
    skipped: skippedCount,
    total: components.length,
    problems,
  };
}

/**
 * Exact gate entries for every component that passes every static
 * criterion but no gate holds yet. Writing them is the ratchet step: once
 * gated, the certificate gate fails any PR that breaks the component.
 * @param {{certificates: any[]}} report
 * @param {Record<string, string[]>} gates
 * @param {string[]} [only] limit to these components (an order)
 * @returns {Record<string, string[]>} sorted by path
 */
export function newGates(report, gates = {}, only) {
  const keep = only ? new Set(only) : null;
  const entries = report.certificates
    .filter(cert => !keep || keep.has(cert.component))
    .map(cert => assessCertificate(cert, gates))
    .filter(row => !row.failing.length && !row.gated)
    .map(row => row.component)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map(component => [component, [...STATIC_CRITERIA]]);
  return Object.fromEntries(entries);
}

/** One line a person or Summer can read. */
export function formatStatus(rows) {
  if (!rows.length)
    return 'ds-cert-loop: 0 components left. The loop is done: stand down.';
  const source = rows.filter(row => row.source).length;
  return `ds-cert-loop: ${rows.length} components left (${source} need a source fix, ${rows.length - source} need evidence only).`;
}
