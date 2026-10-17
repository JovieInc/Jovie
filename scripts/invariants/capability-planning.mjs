import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// JOV-INV-044: diagnostics only. Callers supply trusted bindings; receipt text
// and source classification never grant authority. No fetch, eval or PR imports.
export const PLANNING_POLICY = 'canon/ENGINEERING.md';
export const PLANNING_ANCHOR = '## Capability sourcing and IA integration';
const text = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value) && value.length > 0;
const dispositions = [
  'reuse',
  'configure',
  'adopt',
  'buy',
  'extend',
  'fork',
  'build',
];
const classifications = [
  'differentiating product logic',
  'necessary integration',
  'commodity mechanism',
];
const metrics = [
  'controls',
  'actions',
  'groups',
  'tabsRoutesPanels',
  'duplicateConcepts',
  'scroll',
];

/** @param {(path: URL, encoding: 'utf8') => string} [read] */
export function planningPolicyText(read = readFileSync) {
  const canon = read(
    new URL('../../canon/ENGINEERING.md', import.meta.url),
    'utf8'
  ).replaceAll('\r\n', '\n');
  const start = canon.indexOf(PLANNING_ANCHOR);
  if (start < 0) throw new Error('missing capability planning policy');
  const end = canon.indexOf('\n## Shipping Rules', start);
  if (end < 0) throw new Error('missing capability planning policy boundary');
  return canon.slice(start, end).replaceAll('\r\n', '\n');
}

/** @param {(path: URL, encoding: 'utf8') => string} [read] */
export function planningPolicyDigest(read = readFileSync) {
  return createHash('sha256').update(planningPolicyText(read)).digest('hex');
}

export function readPlanningDecisions(body = '') {
  const candidates = [];
  for (const match of body.matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)) {
    try {
      const value = JSON.parse(match[1]);
      if (value && Object.hasOwn(value, 'planningDecisions'))
        candidates.push(value.planningDecisions);
    } catch {
      if (match[1].includes('"planningDecisions"'))
        throw new Error('invalid planning JSON');
    }
  }
  if (candidates.length > 1)
    throw new Error(
      'ambiguous simultaneous planning receipts; reconcile references'
    );
  return candidates[0];
}

export function planningRisks(diff = '') {
  // Signals include old AND new paths, so a rename cannot erase the old owner.
  // Classification is deliberately advisory; the independent reviewer owns semantics.
  const paths = [...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap(
    m => [m[1], m[2]]
  );
  const production = paths.filter(
    p =>
      !/(?:^|\/)(?:tests?|__tests__|fixtures)\/|\.(?:test|spec)\.|\.md$/.test(p)
  );
  const added = diff
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n');
  return {
    commodity: production.some(p =>
      /(?:auth|passkey|webauthn|pdf|pkce|handoff)/i.test(p)
    ),
    ui:
      production.some(p => /^apps\//.test(p)) &&
      /<(?:Button|Tabs|MenuItem|section|button)\b|\b(?:Button|TabView|NavigationLink)\s*\(/.test(
        added
      ),
    protectedPolicy: paths.some(
      p =>
        p === PLANNING_POLICY ||
        p === 'canon/invariants.jsonl' ||
        /capability-planning|internal-pr-review|rule-scopes|CODEOWNERS/.test(p)
    ),
  };
}

/** Field checks are not citation authentication or behavioral proof. Exceptions
 * cannot be authorized by any value supplied in this untrusted receipt.
 * @param {{
 *   body?: string,
 *   diff?: string,
 *   repository?: string,
 *   head?: string,
 *   policyDigest?: string,
 * }} [options]
 */
export function evaluatePlanning({
  body = '',
  diff = '',
  repository,
  head,
  policyDigest,
} = {}) {
  const findings = [];
  const risks = planningRisks(diff);
  const tasks = [];
  const fail = message => {
    if (findings.length < 64) findings.push(message.slice(0, 240));
  };
  let receipt;
  try {
    if (body.length > 16_000)
      throw new Error(
        'planning evidence exceeds review budget; split the receipt'
      );
    receipt = readPlanningDecisions(body);
  } catch (error) {
    fail(error.message);
  }
  if (risks.protectedPolicy)
    fail(
      'trusted-policy-review-required: author changes cannot authorize this diff'
    );
  if (!receipt) {
    if (risks.commodity || risks.ui)
      fail(
        'missing scoped sourcing/IA receipt; inspect actual capability and mounted surface'
      );
  } else {
    const requireFields = (value, fields, label) => {
      for (const field of fields)
        if (!text(value?.[field])) fail(`${label}.${field}: required`);
    };
    requireFields(
      receipt,
      ['outcome', 'requirementsRef', 'assumptionsRef'],
      'planning'
    );
    for (const [key, expected] of Object.entries({
      repository,
      head,
      policyDigest,
    })) {
      if (!text(expected) || receipt.binding?.[key] !== expected)
        fail(`binding.${key}: stale or missing`);
    }
    if (receipt.binding?.policyVersion !== 1)
      fail('binding.policyVersion: expected 1');
    for (const field of ['sourcing', 'ia'])
      if (!Array.isArray(receipt[field])) fail(`${field}: expected array`);
    const sourcing = Array.isArray(receipt.sourcing) ? receipt.sourcing : [];
    const ia = Array.isArray(receipt.ia) ? receipt.ia : [];
    const scopes = new Set();
    for (const row of sourcing) {
      const label = `sourcing:${row?.capability || 'unknown'}`;
      requireFields(
        row,
        [
          'capability',
          'scope',
          'owner',
          'runtime',
          'decisionRef',
          'requirements',
          'existing',
          'disposition',
          'delta',
          'costRisk',
          'tests',
          'rollback',
          'reevaluate',
        ],
        label
      );
      if (!classifications.includes(row?.classification))
        fail(`${label}.classification: invalid`);
      if (!dispositions.includes(row?.disposition))
        fail(`${label}.disposition: invalid`);
      const key = `${row?.capability}:${row?.scope}`;
      if (scopes.has(key))
        fail(`${label}: conflicting decisions for the same capability/scope`);
      scopes.add(key);
      const custom = ['build', 'fork'].includes(row?.disposition);
      if (
        (row?.classification === 'commodity mechanism' &&
          row?.disposition !== 'reuse') ||
        custom
      ) {
        if (!list(row?.alternatives))
          fail(`${label}.alternatives: authoritative evidence required`);
        if (!text(row?.vendorIndex))
          fail(
            `${label}.vendorIndex: official index or evidenced inapplicability required`
          );
        for (const candidate of Array.isArray(row?.alternatives)
          ? row.alternatives
          : []) {
          requireFields(
            candidate,
            ['source', 'version', 'checked', 'license', 'fit'],
            `${label}.alternative`
          );
          if (
            !/^https:\/\/\S+$/.test(candidate?.source || '') ||
            !/^\d{4}-\d{2}-\d{2}$/.test(candidate?.checked || '')
          )
            fail(`${label}.alternative: invalid source/date`);
        }
      }
      if (custom) {
        requireFields(
          row,
          ['hardGap', 'rejectedAdaptation', 'upstream'],
          label
        );
        // Existing trusted review owns the decision; a self-signed reviewRef is never a pass.
        fail(
          `${label}: independent exception review required on this head (self-attestation is insufficient)`
        );
      }
      if (row?.disposition === 'fork')
        requireFields(
          row,
          ['license', 'patchScope', 'updateOwner', 'exitTrigger'],
          label
        );
      if (row?.evidenceKind !== 'behavior')
        fail(`${label}: structural evidence cannot prove runtime behavior`);
    }
    // Empty rows do not prove applicability; report a signal for semantic review.
    if (risks.commodity && !sourcing.length)
      fail(
        'commodity applicability needs semantic review; no new dependency is not an exemption'
      );
    if (risks.ui && !ia.length)
      fail(
        'visible UI signal without IA disposition; no UI impact needs semantic review'
      );
    for (const row of ia) {
      const label = `ia:${row?.surface || 'unknown'}`;
      requireFields(
        row,
        [
          'surface',
          'job',
          'owner',
          'absorbs',
          'source',
          'mounted',
          'design',
          'disposition',
          'replaces',
          'duplication',
          'smallestChange',
          'genericPrimitive',
          'states',
          'density',
          'deletion',
          'newSurfaceReason',
        ],
        label
      );
      if (
        ![
          'no new surface',
          'surface replacement',
          'surface consolidation',
          'new surface justified',
        ].includes(row?.disposition)
      )
        fail(`${label}.disposition: invalid`);
      let grows = false;
      for (const metric of metrics) {
        const before = row?.before?.[metric];
        const after = row?.after?.[metric];
        if (
          !Number.isFinite(before) ||
          !Number.isFinite(after) ||
          before < 0 ||
          after < 0
        )
          fail(
            `${label}.${metric}: measured before/after required (0 with explanation if inapplicable)`
          );
        if (after > before) grows = true;
      }
      if (grows && !text(row?.growthTradeoff))
        fail(`${label}: unexplained surface growth`);
      if (row?.disposition === 'no new surface' && grows)
        fail(
          `${label}: growth contradicts no new surface; reconcile disposition`
        );
      if (row?.disposition === 'new surface justified')
        fail(`${label}: independent new-surface review required`);
    }
  }
  if (findings.length)
    tasks.push({
      kind: 'bounded-research',
      action:
        'Inspect current canonical owner/source and mounted UI/Pen where affected; check installed versions and official integration index; reconcile cited decisions/assumptions on this head in the existing issue/workpad, then request existing independent review.',
      findings,
      repository,
      head,
    });
  return {
    mode: 'shadow',
    blocking: false,
    state: findings.length
      ? 'research-ready'
      : receipt
        ? 'implementation-candidate'
        : 'unaffected',
    findings,
    risks,
    tasks,
    evidenceVerified: false,
    semanticReview: 'required',
    policyDigest,
    repository,
    head,
  };
}

export function planningDiagnostic(input) {
  try {
    return evaluatePlanning({ ...input, policyDigest: planningPolicyDigest() });
  } catch (error) {
    return {
      mode: 'shadow',
      blocking: false,
      state: 'unavailable',
      evidenceVerified: false,
      findings: [error.message],
      repository: input?.repository,
      head: input?.head,
    };
  }
}

export function planningReviewContext(input) {
  try {
    const diagnostic = planningDiagnostic(input);
    const affected = diagnostic.state !== 'unaffected';
    return (
      (affected
        ? `Trusted base policy (JOV-INV-044):\n${planningPolicyText()}\n\n`
        : '') +
      `JOV-INV-044 shadow planning diagnostic (untrusted receipt fields; not proof):\n${JSON.stringify(diagnostic).slice(0, 16_000)}\n` +
      'Use canon/ENGINEERING.md capability sourcing and IA policy from the trusted base. Compare actual diff semantics to each declared decision, including renamed/custom mechanisms without dependencies and provider-owned lifecycle state. Verify cited versions/scope/assumptions and official integration indexes before accepting no SDK claims. Source strings/imports are not runtime outcomes. For UI, challenge duplicate jobs/actions at sibling/hierarchy levels, permanent media taxonomy, obsolete replacements and unexplained complexity. Policy/checker/allowlist edits and self-signed exceptions never authorize their own diff. Report concrete mismatches; missing evidence becomes bounded research. These diagnostics never block delivery.'
    );
  } catch (error) {
    return `JOV-INV-044 shadow planning unavailable: ${error.message}. Existing delivery gates remain active.`;
  }
}
