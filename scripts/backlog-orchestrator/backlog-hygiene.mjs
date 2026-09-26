export const BACKLOG_HYGIENE_SCHEMA = 'backlog-hygiene/v1';
export const AGED_DAYS = 30;
export const SENTRY_STALE_DAYS = 3;

// JOV-5555: recurring backlog hygiene loop. Dedup aged work and resolve stale
// Sentry-only issues only with source-backed evidence. This classifier is
// intentionally conservative: title similarity never proves a duplicate, and
// absence of Sentry events never proves resolution.
const PROTECTED_LABELS = new Set([
  'incident',
  'security',
  'blocked',
  'customer',
  'finance',
  'legal',
  'release',
]);
const ACTIVE_STATES = new Set(['In Progress', 'In Review']);
const SENSITIVE_DOMAIN = /customer|security|incident|finance|legal|release/i;
const SENTRY_SOURCE = /sentry/i;
const SUCCESSOR_MARKER =
  /(?:duplicate(?:\s+of)?|superseded|succeeded|resolved|closed)[\s-]*(?:by|in|of)?\s*:?\s*\b(JOV-\d+)\b/i;
const MERGED_PR_MARKER = /github\.com\/[^\s)]+\/pull\/\d+/i;
const RESOLUTION_WORDING = /resolv|fix|clos|ship|merg/i;
const NON_RECURRENCE_MARKER =
  /non[- ]?recurrence|no events since|resolved in sentry|no longer reproduces/i;

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function commentsOf(issue) {
  return (issue?.comments?.nodes || issue?.comments || []).map(comment =>
    String(typeof comment === 'string' ? comment : comment?.body || '')
  );
}

function corpusOf(issue) {
  return [issue?.title, issue?.description, ...commentsOf(issue)]
    .filter(Boolean)
    .join('\n');
}

function ageInDays(issue, now) {
  const created = Date.parse(issue?.createdAt || '');
  if (!Number.isFinite(created)) return 0;
  return (Date.parse(now) - created) / 86_400_000;
}

function hasOpenPullRequest(issue) {
  if (issue?.pullRequestUrl || issue?.githubPrUrl) return true;
  if (MERGED_PR_MARKER.test(issue?.description || '')) return true;
  return commentsOf(issue).some(comment => MERGED_PR_MARKER.test(comment));
}

function duplicateRelation(issue) {
  return (issue?.relations?.nodes || issue?.relations || []).find(
    relation =>
      ['duplicate', 'duplicate_of'].includes(
        String(relation?.type || '').toLowerCase()
      ) && relation?.relatedIssue?.identifier
  );
}

function successorIdentifier(issue) {
  const relation = duplicateRelation(issue);
  if (relation) return relation.relatedIssue.identifier;
  const match = corpusOf(issue).match(SUCCESSOR_MARKER);
  return match?.[1]?.toUpperCase() || null;
}

function verifiedResolutionEvidence(issue) {
  // A merged/resolved pull request linked in the issue is verified resolution.
  // A bare PR link is not enough — the corpus must carry resolution wording.
  for (const source of commentsOf(issue)) {
    if (MERGED_PR_MARKER.test(source) && RESOLUTION_WORDING.test(source)) {
      const pr = source.match(MERGED_PR_MARKER);
      return { kind: 'merged-pull-request', evidence: pr?.[0] };
    }
  }
  return null;
}

function isSentryOnly(issue) {
  const labels = labelsOf(issue);
  const sourced =
    labels.includes('sentry') || SENTRY_SOURCE.test(corpusOf(issue));
  if (!sourced) return false;
  // Any code owner surface (linked PR, successor, active work) means the issue
  // is no longer Sentry-only.
  return !hasOpenPullRequest(issue) && !duplicateRelation(issue);
}

function nonRecurrenceEvidence(issue) {
  for (const source of commentsOf(issue)) {
    if (
      NON_RECURRENCE_MARKER.test(source) &&
      (MERGED_PR_MARKER.test(source) || /\bJOV-\d+\b/i.test(source))
    ) {
      return source.slice(0, 200);
    }
  }
  return null;
}

/**
 * Classify one active Linear issue for the hygiene pass. Dispositions:
 * - `preserve` — active customer/security/finance/legal/release/incident
 *   surface, or actively owned; never auto-closed.
 * - `duplicate` — explicit duplicate relation or structured successor marker.
 * - `resolved` — verified resolution evidence (resolution-worded PR link).
 * - `sentry-close` — Sentry-only issue older than SENTRY_STALE_DAYS with
 *   current non-recurrence evidence plus a linked resolution outcome.
 * - `sentry-review` — Sentry-only and stale but missing non-recurrence
 *   evidence; absence alone is not resolution proof.
 * - `review-required` — aged past AGED_DAYS with no successor/resolution.
 * - `no-op` — below the age thresholds or missing identity.
 */
export function classifyHygieneCandidate(
  issue,
  { now = new Date().toISOString() } = {}
) {
  if (!issue?.id || !issue?.identifier)
    return { disposition: 'no-op', reason: 'missing-identity' };
  const labels = labelsOf(issue);
  // Verified resolution and an explicit successor outrank ownership/protection:
  // the spec preserves active and sensitive work only when no receipt proves
  // the issue is already done.
  const successor = successorIdentifier(issue);
  if (successor && successor !== issue.identifier) {
    return {
      disposition: 'duplicate',
      reason: 'explicit-successor',
      successor,
      rationale: `Duplicate/superseded by ${successor} via explicit relation or structured marker.`,
    };
  }

  const resolution = verifiedResolutionEvidence(issue);
  if (resolution) {
    return {
      disposition: 'resolved',
      reason: 'verified-resolution',
      evidence: resolution.evidence,
      rationale: `Verified resolution evidence: ${resolution.evidence}.`,
    };
  }

  if (
    ACTIVE_STATES.has(issue?.state?.name) ||
    issue.assignee ||
    hasOpenPullRequest(issue)
  )
    return { disposition: 'preserve', reason: 'actively-owned' };
  if (labels.some(label => PROTECTED_LABELS.has(label)))
    return { disposition: 'preserve', reason: 'protected-domain' };
  if (SENSITIVE_DOMAIN.test(`${issue.title || ''}\n${issue.description || ''}`))
    return { disposition: 'preserve', reason: 'sensitive-domain' };

  const ageDays = ageInDays(issue, now);
  if (isSentryOnly(issue)) {
    if (ageDays <= SENTRY_STALE_DAYS)
      return { disposition: 'no-op', reason: 'below-age-threshold', ageDays };
    const evidence = nonRecurrenceEvidence(issue);
    if (evidence) {
      return {
        disposition: 'sentry-close',
        reason: 'non-recurrence-with-resolution',
        evidence,
        ageDays,
        rationale:
          'Sentry-only, stale past threshold, with current non-recurrence evidence and a linked resolution outcome.',
      };
    }
    return {
      disposition: 'sentry-review',
      reason: 'missing-non-recurrence-evidence',
      ageDays,
      rationale:
        'Sentry-only and stale, but absence of events is not resolution proof.',
    };
  }

  if (ageDays < AGED_DAYS)
    return { disposition: 'no-op', reason: 'below-age-threshold', ageDays };

  return {
    disposition: 'review-required',
    reason: 'aged-no-successor-or-resolution',
    ageDays,
  };
}

export function buildBacklogHygieneReceipt(
  issues,
  { now = new Date().toISOString() } = {}
) {
  const decisions = issues.map(issue => ({
    issue: issue.identifier,
    state: issue?.state?.name || null,
    ...classifyHygieneCandidate(issue, { now }),
  }));
  const countBy = key =>
    Object.fromEntries(
      [...new Set(decisions.map(decision => decision[key]))]
        .filter(Boolean)
        .sort()
        .map(value => [value, decisions.filter(d => d[key] === value).length])
    );
  const proposed = decisions.filter(decision =>
    ['duplicate', 'resolved', 'sentry-close'].includes(decision.disposition)
  );
  return {
    schema: BACKLOG_HYGIENE_SCHEMA,
    mode: 'dry-run',
    observedAt: now,
    scanned: issues.length,
    inventoryBefore: countBy('state'),
    inventoryAfter: {
      proposedClosures: proposed.length,
      remaining: issues.length - proposed.length,
    },
    summary: {
      candidatesInspected: decisions.filter(
        decision => decision.disposition !== 'no-op'
      ).length,
      duplicatesCollapsed: decisions.filter(
        decision => decision.disposition === 'duplicate'
      ).length,
      resolvedClosed: decisions.filter(
        decision => decision.disposition === 'resolved'
      ).length,
      sentryCloseCandidates: decisions.filter(
        decision => decision.disposition === 'sentry-close'
      ).length,
      incidentsAndProtectedPreserved: decisions.filter(
        decision => decision.disposition === 'preserve'
      ).length,
      reviewRequired: decisions.filter(decision =>
        ['review-required', 'sentry-review'].includes(decision.disposition)
      ).length,
    },
    counts: countBy('disposition'),
    decisions,
    mutations: 0,
  };
}
