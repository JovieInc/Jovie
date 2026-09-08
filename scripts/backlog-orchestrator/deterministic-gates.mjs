// biome-ignore-all format: Preserve legacy formatting while adding bounded evidence.
/** No-model plan and admission gate orchestration. */

import {
  resolveOptimizationContract,
  validateOptimizationContract,
} from '../invariants/optimization-contract.mjs';
import { admissionGateReceipt } from './admission-gate.mjs';
import {
  hasProtectedAdmissionLabel,
  isFounderSteeringAssignee,
} from './admission-policy.mjs';
// JOV-INV-028: founder assignment carries steering, not a human hold.
import { resolveAdmissionTarget } from './ownership-inventory.mjs';

export const TEAM_ROUTES = Object.freeze({
  JOV: Object.freeze({
    key: 'JOV',
    name: 'Jovie',
    repo: 'JovieInc/Jovie',
  }),
  LYB: Object.freeze({
    key: 'LYB',
    name: 'LYB',
    repo: 'JovieInc/LogYourBody',
  }),
});
const PROHIBITED_TEXT =
  /credential|secret|password|api[ -]?key|access token|private key|billing|payment|checkout|database migration|schema migration|production deploy|publish externally|delete (?:customer|production|user) data|destructive|synthetic|bundle|workstream|batch|epic-only/i;
const MAX_CANDIDATE_AGE_DAYS = 60;

export function teamRouteForIssue(issue) {
  const key =
    issue?.team?.key ||
    /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(issue?.identifier || '')?.[1];
  return TEAM_ROUTES[String(key || '').toUpperCase()] || null;
}

function activePullRequestPattern(route) {
  return new RegExp(
    `github\\.com/${route.repo.replace('/', '\\/')}\\/pull\\/\\d+`,
    'i'
  );
}

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body || '';
}

function sectionHeader(line) {
  const markdown = /^#{2,3}\s+(.+?)\s*$/.exec(line);
  if (markdown) return { name: markdown[1].trim(), inline: '' };
  const bold = /^\s*\*\*([^*]+?)\*\*\s*(?:[—:-]\s*)?(.*)$/.exec(line);
  if (!bold) return null;
  return {
    name: bold[1].replace(/:\s*$/, '').trim(),
    inline: bold[2].trim(),
  };
}

function section(description, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const lines = String(description || '').split('\n');
  const start = lines.findIndex(line => {
    const header = sectionHeader(line);
    return header && wanted.has(header.name.toLowerCase());
  });
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => {
    if (index <= start) return false;
    return Boolean(sectionHeader(line));
  });
  const inline = sectionHeader(lines[start])?.inline;
  return [inline, ...lines.slice(start + 1, end < 0 ? undefined : end)]
    .filter(Boolean)
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

function valueQualification(description) {
  const entries = Object.fromEntries(
    section(description, ['Value', 'Value justification'])
      .split('\n')
      .map(line =>
        /^\s*[-*]?\s*([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/.exec(line)
      )
      .filter(Boolean)
      .map(match => [
        match[1].replace(/-([a-z])/g, (_all, char) => char.toUpperCase()),
        match[2],
      ])
  );
  const value = Object.fromEntries(
    [
      'authority',
      'decisionId',
      'rationale',
      'expectedBenefit',
      'validation',
      'customerSignal',
      'dependencies',
      'cost',
      'timebox',
    ]
      .filter(field => entries[field])
      .map(field => [field, entries[field]])
  );
  const stages = String(entries.criticalPath || '')
    .split(',')
    .map(item => /^\s*([^=]+)=([0-9]+)\s*$/.exec(item))
    .filter(Boolean)
    .map(match => ({ stage: match[1].trim(), durationMs: Number(match[2]) }));
  value.sanity = {
    basis: entries.basis,
    concurrency: Number(entries.concurrency),
    demandPerDay: Number(entries.demandPerDay),
    criticalPath: stages,
    bottleneck: entries.bottleneck,
    simplification: entries.simplification,
    owner: entries.owner,
  };
  return value;
}

export function validateDeterministicPlanCandidate(
  issue,
  { now = new Date().toISOString() } = {}
) {
  if (!issue?.id || !teamRouteForIssue(issue))
    return 'not-concrete-routed-issue';
  if (!['Triage', 'Backlog', 'Todo'].includes(issue.state?.name || issue.state))
    return 'inactive-or-active-state';
  if (issue.assignee && !isFounderSteeringAssignee(issue))
    return 'already-assigned';
  // Ordinary complete, unowned, non-sensitive work is machine-authorized by
  // this deterministic policy. Readiness, plan, and admission labels are
  // durable evidence written by the control plane, not a human prerequisite.
  // Explicit opt-out, ownership, and security labels remain fail-closed below.
  if (hasProtectedAdmissionLabel(issue)) return 'protected-policy';
  if (admissionGateReceipt(issue)) return 'already-admitted';
  if ((issue.children?.nodes || []).length > 0) return 'parent-or-bundle';

  const text = `${issue.title || ''}\n${issue.description || ''}`;
  if (PROHIBITED_TEXT.test(text)) return 'sensitive-or-external-work';
  const route = teamRouteForIssue(issue);
  if (
    commentsOf(issue).some(comment =>
      activePullRequestPattern(route).test(commentBody(comment))
    )
  )
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

  if (
    !section(issue.description, [
      'Proposed fix',
      'Implementation plan',
      'Scope',
    ])
  )
    return 'scope-section-missing';
  if (!section(issue.description, ['Acceptance', 'Acceptance criteria']))
    return 'acceptance-section-missing';
  if (!section(issue.description, ['Value', 'Value justification']))
    return 'value-justification-section-missing';
  const targeting = resolveAdmissionTarget(issue);
  if (targeting.decision !== 'admit')
    return targeting.reason || 'no-jovie-artifact';
  return null;
}

export function buildDeterministicPlanEvidence(issue) {
  const reason = validateDeterministicPlanCandidate(issue);
  if (reason) return { evidence: null, reason };
  const targeting = resolveAdmissionTarget(issue);
  if (targeting.decision !== 'admit') {
    return {
      evidence: null,
      reason: targeting.reason || 'no-jovie-artifact',
      target: targeting.target,
      reroute: targeting.reroute || targeting.target,
    };
  }
  const scope = section(issue.description, [
    'Implementation plan',
    'Proposed fix',
    'Scope',
  ]);
  const acceptance = cleanList(
    section(issue.description, ['Acceptance', 'Acceptance criteria'])
  );
  const route = teamRouteForIssue(issue);
  const target = targeting.target;
  const optimization = resolveOptimizationContract(issue);
  const optimizationReason = validateOptimizationContract(optimization);
  if (optimizationReason) return { evidence: null, reason: optimizationReason };
  return {
    reason: null,
    evidence: {
      verified: true,
      concrete: true,
      bounded: true,
      repo: target.target_repo || route.repo,
      project: issue.project?.name || route.name,
      owners: {
        implementation: 'Symphony',
        verification: 'Gem',
      },
      scope: scope.slice(0, 1800),
      acceptance,
      test: [
        'Run focused tests for the touched paths and the repository-prescribed validation; do not weaken CI gates.',
      ],
      rollback:
        'Revert the single issue-scoped commit or pull request. This gate does not merge or deploy.',
      value: valueQualification(issue.description),
      target,
      optimization,
    },
  };
}

function priorityValue(priority) {
  return { 1: 100, 2: 80, 3: 50, 4: 20, 0: 10 }[priority] || 0;
}

export function selectDeterministicPlanCandidate(
  issues,
  {
    issueIdentifier = null,
    now = new Date().toISOString(),
    excludeIdentifiers = [],
  } = {}
) {
  const excluded = new Set(excludeIdentifiers);
  const decisions = issues.map(issue => ({
    issue,
    reason: excluded.has(issue.identifier)
      ? 'issue-specific-hold'
      : validateDeterministicPlanCandidate(issue, { now }),
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

export function admissionIntentLoad(issues) {
  const active = issues.filter(issue => {
    if (!['Todo', 'In Progress', 'In Review'].includes(issue.state?.name))
      return false;
    if (hasProtectedAdmissionLabel(issue)) return false;
    return Boolean(admissionGateReceipt(issue));
  });
  return { count: active.length, identifiers: active.map(x => x.identifier) };
}

export function assertNoTeamControllerErrors(results) {
  if (results.some(result => result.stage === 'team-error')) {
    throw new Error('gate-next failed: one or more team controllers errored');
  }
}
