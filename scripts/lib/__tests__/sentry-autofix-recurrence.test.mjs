import { describe, expect, it, vi } from 'vitest';
import {
  alreadyRecorded,
  correlateIncident,
  decideRecurrence,
  fetchWithRetry,
  isProductionEnvironment,
  isRetryableStatus,
  MAX_ATTEMPTS,
  MAX_PRS_PER_RUN,
  parseAutofixIncident,
  parseSentryIssueId,
  recurrenceComment,
  retryDelayMs,
  runSentryAutofixRecurrence,
} from '../../sentry-autofix-recurrence.mjs';

const MAIN_SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const AUTOFIX_BODY = `## Summary
- **Issue ID:** 1234567890
- **Root-cause fingerprint:** fp-chat-timeout
- **Environment:** vercel-production
- **Release:** ${MAIN_SHA}
- **Route:** /api/chat
`;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sentry autofix recurrence', () => {
  it('parses incident identity from the autofix PR body', () => {
    expect(parseAutofixIncident(AUTOFIX_BODY)).toEqual({
      issueId: '1234567890',
      fingerprint: 'fp-chat-timeout',
      environment: 'vercel-production',
      release: MAIN_SHA,
      route: '/api/chat',
    });
    expect(parseSentryIssueId('no id here')).toBeNull();
  });

  it('waits for soak then resolves quiet issues and reopens firing ones', () => {
    const mergedAt = '2026-08-19T00:00:00.000Z';
    const now = new Date('2026-08-19T01:00:00.000Z');
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-18T23:00:00.000Z',
        now,
      })
    ).toEqual({ action: 'resolve', reason: 'quiet_after_deploy' });
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-19T00:30:00.000Z',
        now,
      })
    ).toEqual({ action: 'reopen', reason: 'still_firing' });
    expect(
      decideRecurrence({
        mergedAt,
        lastSeen: '2026-08-19T00:30:00.000Z',
        now: new Date('2026-08-19T00:10:00.000Z'),
      })
    ).toEqual({ action: 'skip', reason: 'soak_pending' });
  });

  it('does not treat missing lastSeen as a green resolve', () => {
    const mergedAt = '2026-08-19T00:00:00.000Z';
    const now = new Date('2026-08-19T01:00:00.000Z');
    expect(decideRecurrence({ mergedAt, lastSeen: null, now })).toEqual({
      action: 'skip',
      reason: 'missing_last_seen',
    });
    expect(decideRecurrence({ mergedAt, lastSeen: 'not-a-date', now })).toEqual(
      { action: 'skip', reason: 'missing_last_seen' }
    );
  });

  it('does not double-comment the same lastSeen decision', () => {
    const comment = recurrenceComment({
      action: 'resolve',
      lastSeen: '2026-08-18T23:00:00.000Z',
      issueId: '1',
      sentryUrl: 'https://sentry.io/issues/1/',
      currentMainSha: MAIN_SHA,
      reason: 'quiet_after_deploy',
    });
    expect(comment).toContain(
      '<!-- sentry-recurrence:resolved:2026-08-18T23:00:00.000Z -->'
    );
    expect(comment).toContain(MAIN_SHA);
    expect(
      alreadyRecorded([comment], 'resolved', '2026-08-18T23:00:00.000Z')
    ).toBe(true);
    expect(
      alreadyRecorded([comment], 'reopened', '2026-08-18T23:00:00.000Z')
    ).toBe(false);
  });
});

describe('sentry autofix recurrence incident correlation', () => {
  const incident = parseAutofixIncident(AUTOFIX_BODY);

  it('requires production environment and current-main ancestry', () => {
    expect(
      correlateIncident({
        incident: { ...incident, environment: null },
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 0 },
      })
    ).toEqual({ action: 'skip', reason: 'missing_environment' });
    expect(
      correlateIncident({
        incident: { ...incident, environment: 'preview' },
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 0 },
      })
    ).toEqual({ action: 'skip', reason: 'non_production_environment' });
    expect(
      correlateIncident({
        incident,
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 2 },
      })
    ).toEqual({ action: 'skip', reason: 'not_on_current_main' });
    expect(
      correlateIncident({
        incident,
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 0 },
      })
    ).toEqual({ action: 'continue', reason: 'correlated' });
  });

  it('rejects fingerprint and environment mismatches from Sentry', () => {
    expect(isProductionEnvironment('vercel-production')).toBe(true);
    expect(
      correlateIncident({
        incident,
        sentryIssue: {
          tags: [{ key: 'environment', value: 'preview' }],
        },
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 0 },
      })
    ).toEqual({ action: 'skip', reason: 'environment_mismatch' });
    expect(
      correlateIncident({
        incident,
        sentryIssue: { metadata: { fingerprint: 'other-fp' } },
        currentMainSha: MAIN_SHA,
        compare: { behind_by: 0 },
      })
    ).toEqual({ action: 'skip', reason: 'fingerprint_mismatch' });
  });
});

describe('sentry autofix recurrence retry bounds', () => {
  it('retries only transient statuses up to MAX_ATTEMPTS', async () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(retryDelayMs(1)).toBe(1000);
    expect(MAX_ATTEMPTS).toBe(3);
    expect(MAX_PRS_PER_RUN).toBe(20);

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleepImpl = vi.fn(async () => {});
    const response = await fetchWithRetry(
      'https://example.test',
      {},
      { fetchImpl, sleepImpl }
    );
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a fourth time after the bound', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const sleepImpl = vi.fn(async () => {});
    const response = await fetchWithRetry(
      'https://example.test',
      {},
      { fetchImpl, sleepImpl, maxAttempts: MAX_ATTEMPTS }
    );
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(sleepImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
  });
});

describe('sentry autofix recurrence runner', () => {
  it('fails closed without tokens and on a malformed search payload', async () => {
    await expect(
      runSentryAutofixRecurrence({ githubToken: '' })
    ).resolves.toEqual({ ok: false, reason: 'missing_github_token' });
    await expect(
      runSentryAutofixRecurrence({
        githubToken: 'gh',
        sentryToken: '',
      })
    ).resolves.toEqual({ ok: false, reason: 'missing_sentry_auth_token' });

    const fetchImpl = vi.fn(async url => {
      const path = String(url);
      if (path.includes('/commits/main')) {
        return jsonResponse(200, { sha: MAIN_SHA });
      }
      if (path.includes('/search/issues')) {
        return jsonResponse(200, { items: null });
      }
      return jsonResponse(500, {});
    });
    await expect(
      runSentryAutofixRecurrence({
        githubToken: 'gh',
        sentryToken: 'sentry',
        fetchImpl,
        sleepImpl: async () => {},
      })
    ).resolves.toEqual({ ok: false, reason: 'github_search_malformed' });
  });

  it('resolves a quiet current-main incident and skips false-green holes', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      const path = String(url);
      const method = String(init?.method ?? 'GET');
      if (path.includes('/commits/main')) {
        return jsonResponse(200, { sha: MAIN_SHA });
      }
      if (path.includes('/search/issues')) {
        return jsonResponse(200, {
          items: [
            {
              number: 11,
              html_url: 'https://github.com/JovieInc/Jovie/pull/11',
            },
            {
              number: 12,
              html_url: 'https://github.com/JovieInc/Jovie/pull/12',
            },
          ],
        });
      }
      if (path.endsWith('/pulls/11')) {
        return jsonResponse(200, {
          body: AUTOFIX_BODY,
          merged_at: '2026-08-19T00:00:00.000Z',
          merge_commit_sha: MERGE_SHA,
        });
      }
      if (path.endsWith('/pulls/12')) {
        return jsonResponse(200, {
          body: AUTOFIX_BODY.replace('1234567890', '999'),
          merged_at: '2026-08-19T00:00:00.000Z',
          merge_commit_sha: MERGE_SHA,
        });
      }
      if (path.includes('/compare/')) {
        return jsonResponse(200, { behind_by: 0, status: 'ahead' });
      }
      if (path.endsWith('/issues/1234567890/') && method === 'GET') {
        return jsonResponse(200, {
          status: 'unresolved',
          lastSeen: '2026-08-18T23:00:00.000Z',
          permalink: 'https://sentry.io/issues/1234567890/',
          tags: [{ key: 'environment', value: 'vercel-production' }],
          metadata: { fingerprint: 'fp-chat-timeout' },
        });
      }
      if (path.endsWith('/issues/999/') && method === 'GET') {
        return jsonResponse(200, {
          status: 'unresolved',
          lastSeen: null,
          permalink: 'https://sentry.io/issues/999/',
          tags: [{ key: 'environment', value: 'vercel-production' }],
        });
      }
      if (path.includes('/issues/11/comments') && method === 'GET') {
        return jsonResponse(200, []);
      }
      if (path.endsWith('/issues/1234567890/') && method === 'PUT') {
        return jsonResponse(200, { status: 'resolved' });
      }
      if (path.includes('/issues/11/comments') && method === 'POST') {
        return jsonResponse(201, { id: 1 });
      }
      return jsonResponse(404, {});
    });

    const result = await runSentryAutofixRecurrence({
      githubToken: 'gh',
      sentryToken: 'sentry',
      now: new Date('2026-08-19T01:00:00.000Z'),
      fetchImpl,
      sleepImpl: async () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.currentMainSha).toBe(MAIN_SHA);
    expect(result.results).toEqual([
      {
        pr: 11,
        issueId: '1234567890',
        action: 'resolve',
        reason: 'quiet_after_deploy',
      },
      {
        pr: 12,
        issueId: '999',
        action: 'skip',
        reason: 'missing_last_seen',
      },
    ]);
    const put = fetchImpl.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/issues/1234567890/') &&
        String(init?.method) === 'PUT'
    );
    expect(JSON.parse(String(put[1].body))).toEqual({ status: 'resolved' });
  });
});
