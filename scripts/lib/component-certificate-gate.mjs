/**
 * Component certificate gate (jovie.component-certificate/v1).
 *
 * `docs/design-system/component-certification.json` `gates` maps a source path
 * prefix to the criteria every component under it must pass. A gated
 * criterion that is `fail` or `unknown` blocks; `pass` and `na` clear it.
 * The gate only ratchets up: add a prefix once a layer is clean, and add a
 * criterion once its evidence producer exists, so certification can't regress.
 */
import { CRITERIA } from './component-certificate.mjs';

const CLEAR = new Set(['pass', 'na']);

/**
 * @param {{certificates: any[]}} report
 * @param {Record<string, string[]>} gates
 * @returns {{ok: boolean, errors: string[], gated: number, failures: {component: string, criterion: string, status: string, detail?: string}[]}}
 */
export function evaluateCertificateGates(report, gates = {}) {
  const errors = [];
  const failures = [];
  let gated = 0;
  for (const [prefix, criteria] of Object.entries(gates)) {
    if (!Array.isArray(criteria) || !criteria.length) {
      errors.push(`gate ${prefix}: needs a non-empty criteria list`);
      continue;
    }
    for (const id of criteria)
      if (!CRITERIA.includes(id))
        errors.push(`gate ${prefix}: unknown criterion ${id}`);
    const scoped = report.certificates.filter(c =>
      c.component.startsWith(prefix)
    );
    if (!scoped.length) {
      errors.push(`gate ${prefix}: matches no component`);
      continue;
    }
    gated += scoped.length;
    for (const cert of scoped)
      for (const id of criteria) {
        const row = cert.criteria.find(k => k.id === id);
        const status = row?.status ?? 'unknown';
        if (!CLEAR.has(status))
          failures.push({
            component: cert.component,
            criterion: id,
            status,
            detail:
              id === 'states'
                ? Object.entries(row?.states ?? {})
                    .filter(([, v]) => v.status === 'fail')
                    .map(([s]) => s)
                    .join(', ')
                : row?.detail,
          });
      }
  }
  return { ok: !errors.length && !failures.length, errors, gated, failures };
}

export function formatGateResult(result) {
  if (result.ok)
    return `component certificate gate: ${result.gated} gated component(s) pass`;
  return [
    'component certificate gate failed:',
    ...result.errors.map(e => `  config: ${e}`),
    ...result.failures.map(
      f =>
        `  ${f.component} [${f.criterion}] ${f.status}${f.detail ? `: ${f.detail}` : ''}`
    ),
    'Fix the component, or for a state the component cannot reach, add a written waiver in docs/design-system/component-certification.json.',
  ].join('\n');
}
