import { createHash } from 'node:crypto';

export const CONVERSATION_RECONCILIATION_SCHEMA =
  'conversation-issue-reconciliation/v1';
export const SAFE_MERGE_THRESHOLD = 0.82;
export const REVIEW_THRESHOLD = 0.55;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'miss',
  'never',
  'of',
  'on',
  'please',
  'request',
  'requested',
  'stale',
  'the',
  'this',
  'to',
  'with',
  'complet',
  'despite',
]);

function stem(token) {
  if (token.endsWith('ive')) return token.slice(0, -1);
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

/** Stable, deliberately conservative normalization for pre-create matching. */
export function normalizeIntent(value) {
  return [
    ...new Set(
      String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(token => Boolean(token) && /[a-z]/.test(token))
        .filter(token => !STOP_WORDS.has(token))
        .map(stem)
        .filter(token => !STOP_WORDS.has(token))
    ),
  ].sort();
}

export function intentSimilarity(left, right) {
  const a = normalizeIntent(left);
  const b = normalizeIntent(right);
  if (a.length === 0 || b.length === 0) return 0;
  const rightTokens = new Set(b);
  const overlap = a.filter(token => rightTokens.has(token)).length;
  const containment = overlap / Math.min(a.length, b.length);
  const jaccard = overlap / new Set([...a, ...b]).size;
  return Number((containment * 0.7 + jaccard * 0.3).toFixed(4));
}

function urlsIn(value) {
  return String(value || '').match(/https?:\/\/[^\s)\]>]+/g) || [];
}

export function extractEvidenceLinks(request) {
  const links = [
    request.conversationReceipt?.url,
    ...(request.evidence || []).map(item =>
      typeof item === 'string' ? item : item?.url
    ),
    ...urlsIn(request.description),
  ].filter(Boolean);
  return [...new Set(links)];
}

function receiptKey(request) {
  const identity =
    request.conversationReceipt?.id ||
    request.conversationReceipt?.url ||
    JSON.stringify(extractEvidenceLinks(request));
  return createHash('sha256')
    .update(String(identity))
    .digest('hex')
    .slice(0, 16);
}

function evidenceComment(request, key) {
  const links = extractEvidenceLinks(request);
  return [
    `<!-- conversation-receipt:${key} -->`,
    '## New conversation evidence',
    '',
    request.summary || request.title,
    '',
    ...links.map(link => `- ${link}`),
  ].join('\n');
}

function issueDescription(request, key) {
  const links = extractEvidenceLinks(request);
  return [
    request.description || request.summary || request.title,
    '',
    '## Conversation receipts',
    `<!-- conversation-receipt:${key} -->`,
    ...links.map(link => `- ${link}`),
  ].join('\n');
}

function rankedMatches(request, issues) {
  const source = request.intent || request.title;
  return issues
    .map(issue => ({
      issue,
      score: Math.max(
        intentSimilarity(source, issue.title),
        intentSimilarity(source, `${issue.title} ${issue.description || ''}`)
      ),
    }))
    .sort((left, right) => right.score - left.score);
}

/**
 * Reconcile one conversation request before any issue creation. Ambiguous
 * matches fail closed for human review; only a materially different intent is
 * allowed to create a new issue.
 */
export async function reconcileConversationRequest({
  request,
  teamId,
  stateId,
  client,
  dryRun = false,
}) {
  if (!request?.title?.trim())
    throw new Error('conversation request title is required');
  if (!request?.conversationReceipt?.url)
    throw new Error('conversation receipt URL is required');

  const snapshot = await client.fetchTeamActiveIssueSnapshot(teamId);
  if (snapshot?.coverage?.complete !== true)
    throw new Error('active issue snapshot is incomplete');

  const matches = rankedMatches(request, snapshot.issues || []);
  const best = matches[0];
  const key = receiptKey(request);
  const links = extractEvidenceLinks(request);
  const base = {
    schema: CONVERSATION_RECONCILIATION_SCHEMA,
    normalizedIntent: normalizeIntent(request.intent || request.title).join(
      ' '
    ),
    receiptKey: key,
    evidenceLinks: links,
    searchedOpenIssues: snapshot.issues.length,
    counts: {
      canonicalMatches: 0,
      reviewCandidates: 0,
      issuesCreated: 0,
      receiptsLinked: 0,
    },
  };

  if (best?.score >= SAFE_MERGE_THRESHOLD) {
    const marker = `<!-- conversation-receipt:${key} -->`;
    const alreadyLinked = (best.issue.comments?.nodes || []).some(comment =>
      comment.body?.includes(marker)
    );
    if (!dryRun && !alreadyLinked) {
      const result = await client.addComment(
        best.issue.id,
        evidenceComment(request, key)
      );
      if (!result?.commentCreate?.success && !result?.success)
        throw new Error('conversation receipt link failed');
    }
    return {
      ...base,
      disposition: 'existing_issue',
      canonicalIssue: {
        identifier: best.issue.identifier,
        url: best.issue.url,
        state: best.issue.state?.name,
        confidence: best.score,
      },
      counts: {
        ...base.counts,
        canonicalMatches: 1,
        receiptsLinked: alreadyLinked ? 0 : 1,
      },
      mutation: dryRun
        ? 'would_link_receipt'
        : alreadyLinked
          ? 'already_linked'
          : 'linked_receipt',
    };
  }

  if (best?.score >= REVIEW_THRESHOLD) {
    const reviewCandidates = matches
      .filter(match => match.score >= REVIEW_THRESHOLD)
      .map(match => ({
        identifier: match.issue.identifier,
        url: match.issue.url,
        state: match.issue.state?.name,
        confidence: match.score,
      }));
    return {
      ...base,
      disposition: 'human_review',
      reviewCandidates,
      counts: { ...base.counts, reviewCandidates: reviewCandidates.length },
      mutation: 'none',
    };
  }

  if (dryRun) {
    return {
      ...base,
      disposition: 'new_issue',
      counts: { ...base.counts, issuesCreated: 1, receiptsLinked: 1 },
      mutation: 'would_create_issue',
    };
  }

  const result = await client.createIssue({
    teamId,
    stateId,
    title: request.title.trim(),
    description: issueDescription(request, key),
  });
  const issue = result?.issueCreate?.issue;
  if (!issue?.id || !issue?.identifier || !issue?.url)
    throw new Error('conversation issue creation failed');
  return {
    ...base,
    disposition: 'new_issue',
    canonicalIssue: {
      identifier: issue.identifier,
      url: issue.url,
      state: issue.state?.name,
      confidence: 1,
    },
    counts: { ...base.counts, issuesCreated: 1, receiptsLinked: 1 },
    mutation: 'created_issue',
  };
}
