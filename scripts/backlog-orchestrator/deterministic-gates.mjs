/** No-model plan and admission gate orchestration. */

import { ADMISSION_APPROVED_LABEL } from './admission-gate.mjs';
import { ADMISSION_RECEIPT_PREFIX, SYMPHONY_LABEL } from './admitter.mjs';
import { PLAN_APPROVED_LABEL } from './plan-gate.mjs';

const READY_LABELS = new Set(['ready-for-intake', 'agent-ready']);
const REQUIRED_EXECUTION_LABELS = new Set(['automated', 'testing']);
const PROTECTED_LABELS = new Set([
  'blocked',
  'codex-blocked',
  'codex-in-progress',
  'founder-fast-track',
  'human-review-required',
  'incident',
  'launch-blocker',
  'missed-work',
  'needs-human',
  'no-auto',
  'protected',
  'risk:high',
  'symphony',
  'tim-approved',
  'tim-owned',
  'type:epic',
]);
export const SYMPHONY_PROJECT = {
  name: 'Infra & CI/CD',
  slugId: '82c6fbd42405',
};
const PROHIBITED_TEXT =
  /credential|secret|password|api[ -]?key|access token|private key|billing|payment|checkout|database migration|schema migration|production deploy|publish externally|delete (?:customer|production|user) data|destructive|synthetic|bundle|workstream|batch|epic-only/i;
const ACTIVE_PR = /github\.com\/JovieInc\/Jovie\/pull\/\d+/i;
const MAX_CANDIDATE_AGE_DAYS = 60;

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body || '';
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

function section(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const lines = String(description || '').split('\n');
  const start = lines.findIndex(line => {
    const match = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    return match && wanted.has(match[1].toLowerCase());
  });
  if (start < 0) return '';
  const end = lines.findIndex(
    (line, index) => index > start && /^#{2,3}\s+/.test(line)
  );
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

function cleanList(value) {
  return value
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function validateDeterministicPlanCandidate(
  issue,
  { now = new Date().toISOString() } = {}
) {
  if (!issue?.id || !/^JOV-\d+$/.test(issue.identifier || ''))
    return 'not-concrete-jovie-issue';
  if (!['Triage', 'Backlog', 'Todo'].includes(issue.state?.name || issue.state))
    return 'inactive-or-active-state';
  if (isTimOwned(issue)) return 'tim-owned';
  if (issue.assignee) return 'already-assigned';
  if (
    issue.project?.name !== SYMPHONY_PROJECT.name ||
    issue.project?.slugId !== SYMPHONY_PROJECT.slugId
  )
    return 'project-not-allowlisted';

  const labels = labelsOf(issue);
  if (!labels.some(label => READY_LABELS.has(label)))
    return 'readiness-label-missing';
  if (!labels.some(label => REQUIRED_EXECUTION_LABELS.has(label)))
    return 'execution-evidence-label-missing';
  if (labels.some(label => PROTECTED_LABELS.has(label)))
    return 'protected-or-human-review';
  if ((issue.children?.nodes || []).length > 0) return 'parent-or-bundle';

  const text = `${issue.title || ''}\n${issue.description || ''}`;
  if (PROHIBITED_TEXT.test(text)) return 'sensitive-or-external-work';
  if (commentsOf(issue).some(comment => ACTIVE_PR.test(commentBody(comment))))
    return 'active-pull-request';

  const createdAt = new Date(issue.createdAt || 0).getTime();
  const current = new Date(now).getTime();
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(current) ||
    current < createdAt ||
    (current - createdAt) / 86_400_000 > MAX_CANDIDATE_AGE_DAYS
  )
    return 'stale-or-invalid-created-at';

  if (!section(issue.description, ['Proposed fix', 'Implementation plan']))
    return 'scope-section-missing';
  if (!section(issue.description, ['Acceptance criteria']))
    return 'acceptance-section-missing';
  return null;
}

export function buildDeterministicPlanEvidence(issue) {
  const reason = validateDeterministicPlanCandidate(issue);
  if (reason) return { evidence: null, reason };
  const scope = section(issue.description, [
    'Implementation plan',
    'Proposed fix',
  ]);
  const acceptance = cleanList(
    section(issue.description, ['Acceptance criteria'])
  );
  return {
    reason: null,
    evidence: {
      verified: true,
      concrete: true,
      bounded: true,
      repo: 'JovieInc/Jovie',
      project: issue.project.name,
      owner: 'Gem',
      scope: scope.slice(0, 1800),
      acceptance,
      test: [
        'Run focused tests for the touched paths and the repository-prescribed validation; do not weaken CI gates.',
      ],
      rollback:
        'Revert the single issue-scoped commit or pull request. This gate does not merge or deploy.',
    },
  };
}

function priorityValue(priority) {
  return { 1: 100, 2: 80, 3: 50, 4: 20, 0: 10 }[priority] || 0;
}

export function selectDeterministicPlanCandidate(
  issues,
  { issueIdentifier = null, now = new Date().toISOString() } = {}
) {
  const decisions = issues.map(issue => ({
    issue,
    reason: validateDeterministicPlanCandidate(issue, { now }),
  }));
  const eligible = decisions
    .filter(decision => !decision.reason)
    .map(decision => decision.issue)
    .filter(issue => !issueIdentifier || issue.identifier === issueIdentifier)
    .sort(
      (a, b) =>
        priorityValue(b.priority) - priorityValue(a.priority) ||
        (a.estimate ?? 99) - (b.estimate ?? 99) ||
        b.identifier.localeCompare(a.identifier)
    );
  return {
    selected: eligible[0] || null,
    decisions: decisions.map(({ issue, reason }) => ({
      identifier: issue.identifier,
      reason: reason || 'eligible',
    })),
  };
}

function hasLabels(issue, names) {
  const labels = new Set(labelsOf(issue));
  return names.every(name => labels.has(name));
}

export function admissionIntentLoad(issues) {
  const active = issues.filter(issue => {
    if (!['Todo', 'In Progress', 'In Review'].includes(issue.state?.name))
      return false;
    if (
      !hasLabels(issue, [
        PLAN_APPROVED_LABEL,
        ADMISSION_APPROVED_LABEL,
        SYMPHONY_LABEL,
      ])
    )
      return false;
    return commentsOf(issue).some(comment => {
      const body = commentBody(comment);
      return (
        body.startsWith('<!-- admission-gate/v1 -->') ||
        body.startsWith(ADMISSION_RECEIPT_PREFIX)
      );
    });
  });
  return { count: active.length, identifiers: active.map(x => x.identifier) };
}
