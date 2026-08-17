import { createHash } from 'node:crypto';

import { hasProtectedAdmissionLabel } from './admission-policy.mjs';

export const INTAKE_READINESS_SCHEMA = 'intake-readiness/v1';
export const INTAKE_CONTROL_LOOP_SCHEMA = 'intake-control-loop/v1';

const INTAKE_STATES = new Set(['Triage', 'Backlog', 'Todo', 'To Do']);
const SENSITIVE_TEXT =
  /credential|secret|password|api[ -]?key|access token|private key|billing|payment|checkout|database migration|schema migration|production deploy|publish externally|delete (?:customer|production|user) data|destructive/i;
const SECTION_ALIASES = [
  'proposed fix',
  'implementation plan',
  'scope',
  'taste lock',
  'contract',
  'out of scope',
];
const PRIMARY_SCOPE_HEADERS = [
  'proposed fix',
  'implementation plan',
  'scope',
  'taste lock',
  'contract',
];
const ACCEPTANCE_HEADERS = ['acceptance', 'acceptance criteria'];

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase())
    .sort();
}

function sectionHeaders(description) {
  return String(description || '')
    .split('\n')
    .map(line => {
      const markdown = /^#{2,3}\s+(.+?)\s*$/.exec(line);
      const bold = /^\s*\*\*([^*]+?)\*\*/.exec(line);
      return (markdown?.[1] || bold?.[1] || '')
        .replace(/:\s*$/, '')
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);
}

function isTimOwned(issue) {
  const assignee = issue?.assignee;
  return Boolean(
    assignee &&
      /tim(?:\s|-|_)*white|itstimwhite|^tim$/i.test(
        `${assignee.id || ''} ${assignee.name || ''} ${assignee.email || ''}`
      )
  );
}

function hasActiveOwnership(issue, labels) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  const hasReceipt = comments.some(comment =>
    String(
      typeof comment === 'string' ? comment : comment?.body || ''
    ).startsWith('<!-- symphony-admission:v1 ')
  );
  return (
    labels.includes('symphony') ||
    hasReceipt ||
    ['In Progress', 'In Review'].includes(issue?.state?.name)
  );
}

function disposition(issue, status, reason, extra = {}) {
  const labels = labelsOf(issue);
  const headers = sectionHeaders(issue?.description);
  const fingerprint = digest({
    id: issue?.id,
    identifier: issue?.identifier,
    updatedAt: issue?.updatedAt,
    state: issue?.state?.name || issue?.state,
    labels,
    headers,
    status,
    reason,
  });
  return {
    schema: INTAKE_READINESS_SCHEMA,
    issue: issue?.identifier || null,
    observedAt: extra.observedAt || new Date().toISOString(),
    fingerprint,
    disposition: status,
    reason,
    evidence: {
      state: issue?.state?.name || issue?.state || null,
      labels,
      scopeHeaders: headers.filter(header => SECTION_ALIASES.includes(header)),
      acceptanceHeaders: headers.filter(header =>
        ACCEPTANCE_HEADERS.includes(header)
      ),
      ownership: hasActiveOwnership(issue, labels)
        ? 'active-or-ambiguous'
        : 'unowned',
    },
    permittedNextAction:
      status === 'mechanical-ready' ? 'propose-readiness-receipt' : 'none',
    requiresHumanDecision: status === 'decision-required',
  };
}

/** Classify one changed issue without any external mutation. */
export function classifyIntakeReadiness(issue, options = {}) {
  const labels = labelsOf(issue);
  const state = issue?.state?.name || issue?.state || '';
  if (!issue?.id || !issue?.identifier)
    return disposition(issue, 'invalid', 'missing-identity', options);
  if (!INTAKE_STATES.has(state))
    return disposition(issue, 'owned-active', 'non-intake-state', options);
  if (isTimOwned(issue))
    return disposition(issue, 'decision-required', 'tim-owned', options);
  if (issue.assignee)
    return disposition(issue, 'owned-active', 'already-assigned', options);
  if (hasActiveOwnership(issue, labels))
    return disposition(
      issue,
      'owned-active',
      'existing-symphony-or-active-state',
      options
    );
  if (hasProtectedAdmissionLabel(issue))
    return disposition(issue, 'decision-required', 'protected-policy', options);
  if ((issue?.children?.nodes || issue?.children || []).length > 0)
    return disposition(issue, 'decision-required', 'parent-or-bundle', options);
  const text = `${issue.title || ''}\n${issue.description || ''}`;
  if (SENSITIVE_TEXT.test(text))
    return disposition(
      issue,
      'decision-required',
      'sensitive-or-external-work',
      options
    );
  const headers = sectionHeaders(issue.description);
  if (!headers.some(header => PRIMARY_SCOPE_HEADERS.includes(header)))
    return disposition(issue, 'held', 'scope-evidence-missing', options);
  if (!headers.some(header => ACCEPTANCE_HEADERS.includes(header)))
    return disposition(issue, 'held', 'acceptance-evidence-missing', options);
  return disposition(
    issue,
    'mechanical-ready',
    'bounded-scope-and-acceptance',
    options
  );
}

export function changedIntakeIssues(issues, previousFingerprints = {}) {
  return issues.filter(issue => {
    const receipt = classifyIntakeReadiness(issue);
    return previousFingerprints[issue.identifier] !== receipt.fingerprint;
  });
}

/** Select at most four independent ordinary and one explicitly low-risk Sentry candidate. */
export function applyAdmissionThrottle(
  receipts,
  { normalLimit = 4, lowRiskIncidentLimit = 1 } = {}
) {
  const normal = receipts
    .filter(receipt => receipt.disposition === 'mechanical-ready')
    .sort((a, b) => String(a.issue).localeCompare(String(b.issue)))
    .slice(0, normalLimit);
  const lowRiskIncident = receipts
    .filter(
      receipt =>
        receipt.disposition === 'sentry-enrich' &&
        receipt.evidence?.risk === 'low'
    )
    .sort((a, b) => String(a.issue).localeCompare(String(b.issue)))
    .slice(0, lowRiskIncidentLimit);
  return { normal, lowRiskIncident, normalLimit, lowRiskIncidentLimit };
}

export function buildIntakeControlLoopReceipt(
  issues,
  { previousFingerprints = {}, now = undefined } = {}
) {
  const changed = changedIntakeIssues(issues, previousFingerprints);
  const receipts = changed.map(issue =>
    classifyIntakeReadiness(issue, { observedAt: now })
  );
  const dispositions = Object.fromEntries(
    [...new Set(receipts.map(receipt => receipt.disposition))]
      .sort()
      .map(kind => [
        kind,
        receipts.filter(receipt => receipt.disposition === kind).length,
      ])
  );
  return {
    schema: INTAKE_CONTROL_LOOP_SCHEMA,
    mode: 'dry-run',
    observedAt: now || new Date().toISOString(),
    scanned: issues.length,
    changed: changed.length,
    unchanged: issues.length - changed.length,
    dispositions,
    throttle: applyAdmissionThrottle(receipts),
    receipts,
    mutations: 0,
  };
}
