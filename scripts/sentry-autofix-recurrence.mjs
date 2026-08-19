#!/usr/bin/env node

const SENTRY_API = 'https://sentry.io/api/0';
const DEFAULT_SOAK_MS = 45 * 60 * 1000;

export function parseSentryIssueId(body) {
  return (
    String(body ?? '').match(/\*\*Issue ID:\*\*\s*([A-Za-z0-9_-]+)/)?.[1] ??
    null
  );
}

export function decideRecurrence({
  mergedAt,
  lastSeen,
  now = new Date(),
  soakMs = DEFAULT_SOAK_MS,
  issueStatus,
}) {
  const merged = mergedAt ? new Date(mergedAt) : null;
  if (!merged || Number.isNaN(merged.getTime())) {
    return { action: 'skip', reason: 'missing_merged_at' };
  }
  if (now.getTime() - merged.getTime() < soakMs) {
    return { action: 'skip', reason: 'soak_pending' };
  }
  if (issueStatus === 'ignored') {
    return { action: 'skip', reason: 'ignored' };
  }
  const seen = lastSeen ? new Date(lastSeen) : null;
  if (
    seen &&
    !Number.isNaN(seen.getTime()) &&
    seen.getTime() > merged.getTime()
  ) {
    return { action: 'reopen', reason: 'still_firing' };
  }
  return { action: 'resolve', reason: 'quiet_after_deploy' };
}

export function alreadyRecorded(comments, action, lastSeen) {
  const needle = `sentry-recurrence:${action}:${lastSeen ?? 'none'}`;
  return comments.some(comment => String(comment ?? '').includes(needle));
}

export function recurrenceComment({ action, lastSeen, issueId, sentryUrl }) {
  const seen = lastSeen ?? 'none';
  const verb = action === 'resolve' ? 'resolved' : 'reopened';
  return `<!-- sentry-recurrence:${verb}:${seen} -->
## Sentry recurrence ${verb}

- **Issue ID:** ${issueId}
- **Last seen:** ${seen}
- **Sentry:** ${sentryUrl}

${
  action === 'resolve'
    ? 'No post-deploy recurrence in the soak window. Marked resolved in Sentry.'
    : 'Sentry is still firing after the autofix merged. Reopened the Sentry issue.'
}`;
}

function headers(token, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: json ? 'application/json' : 'application/vnd.github+json',
    'User-Agent': 'jovie-sentry-autofix-recurrence',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, json: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, json: null, text };
  }
}

export async function runSentryAutofixRecurrence({
  githubToken = process.env.GH_TOKEN,
  sentryToken = process.env.SENTRY_AUTH_TOKEN,
  repository = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
  soakMs = DEFAULT_SOAK_MS,
  now = new Date(),
  fetchImpl = fetch,
}) {
  if (!githubToken) return { ok: false, reason: 'missing_github_token' };
  if (!sentryToken) return { ok: false, reason: 'missing_sentry_auth_token' };

  const [owner, repo] = repository.split('/');
  const gh = (path, init = {}) =>
    fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: { ...headers(githubToken), ...init.headers },
    });
  const sentry = (path, init = {}) =>
    fetchImpl(`${SENTRY_API}${path}`, {
      ...init,
      headers: { ...headers(sentryToken, true), ...init.headers },
    });

  const list = await readJson(
    await gh(
      `/search/issues?q=${encodeURIComponent(
        `repo:${owner}/${repo} is:pr is:merged "Sentry autofix" in:title`
      )}&per_page=30&sort=updated`
    )
  );
  if (!list.ok) return { ok: false, reason: `github_search_${list.status}` };

  const results = [];
  for (const item of list.json?.items ?? []) {
    const prNumber = item.number;
    const pr = await readJson(
      await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`)
    );
    if (!pr.ok) {
      results.push({
        pr: prNumber,
        action: 'skip',
        reason: `github_pr_${pr.status}`,
      });
      continue;
    }
    const issueId = parseSentryIssueId(pr.json?.body);
    if (!issueId) {
      results.push({
        pr: prNumber,
        action: 'skip',
        reason: 'missing_issue_id',
      });
      continue;
    }

    const issue = await readJson(await sentry(`/issues/${issueId}/`));
    if (!issue.ok) {
      results.push({
        pr: prNumber,
        issueId,
        action: 'skip',
        reason: `sentry_${issue.status}`,
      });
      continue;
    }

    const decision = decideRecurrence({
      mergedAt: pr.json?.merged_at,
      lastSeen: issue.json?.lastSeen,
      issueStatus: issue.json?.status,
      now,
      soakMs,
    });
    if (decision.action === 'skip') {
      results.push({ pr: prNumber, issueId, ...decision });
      continue;
    }

    const comments = await readJson(
      await gh(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`
      )
    );
    const bodies = (comments.json ?? []).map(comment => comment.body);
    const recordedAction =
      decision.action === 'resolve' ? 'resolved' : 'reopened';
    if (alreadyRecorded(bodies, recordedAction, issue.json?.lastSeen)) {
      results.push({
        pr: prNumber,
        issueId,
        action: 'skip',
        reason: 'already_recorded',
      });
      continue;
    }

    const update = await readJson(
      await sentry(`/issues/${issueId}/`, {
        method: 'PUT',
        body: JSON.stringify({
          status: decision.action === 'resolve' ? 'resolved' : 'unresolved',
        }),
      })
    );
    if (!update.ok) {
      results.push({
        pr: prNumber,
        issueId,
        action: 'skip',
        reason: `sentry_update_${update.status}`,
      });
      continue;
    }

    await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: recurrenceComment({
          action: decision.action,
          lastSeen: issue.json?.lastSeen,
          issueId,
          sentryUrl: issue.json?.permalink ?? item.html_url,
        }),
      }),
    });
    results.push({ pr: prNumber, issueId, ...decision });
  }

  return { ok: true, results };
}

async function main() {
  const result = await runSentryAutofixRecurrence({});
  if (!result.ok) throw new Error(result.reason);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
