import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { recoverReviewFindings } from '../bot-finding-recovery.mjs';
import { runRemediationSweep } from '../remediation-sweep.mjs';

const NOW = Date.parse('2026-10-02T22:00:00.000Z');

describe('scheduled bot finding recovery', () => {
  it('wires the existing daily sweep and reports bounded merged PR recovery in dry-run', async () => {
    const workflow = readFileSync(
      new URL(
        '../../../.github/workflows/remediation-sweep.yml',
        import.meta.url
      ),
      'utf8'
    );
    expect(workflow).toContain('run_mode bot-findings');
    expect(workflow).toContain('name: bot-findings-cursor');
    expect(workflow).toContain('node scripts/lib/bot-finding-recovery.mjs');
    expect(workflow).toContain(
      'BOT_FINDINGS_CURSOR: ${{ runner.temp }}/bot-findings-cursor.json'
    );
    expect(workflow).toContain('cancel-in-progress: false');
    const ghRunner = vi.fn(async args =>
      args[1] === 'graphql'
        ? {
            code: 0,
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequest: {
                    state: 'MERGED',
                    headRefOid: 'a'.repeat(40),
                    reviewThreads: {
                      pageInfo: { hasNextPage: false },
                      nodes: [
                        {
                          id: 'resolved',
                          isResolved: true,
                          comments: {
                            nodes: [
                              {
                                author: { __typename: 'Bot', login: 'sentry' },
                                body: '**Bug:** Real bug<br><sub>Severity: HIGH</sub>',
                                url: 'https://github.com/comment/7',
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            }),
          }
        : {
            code: 0,
            stdout: JSON.stringify([
              {
                user: { type: 'Bot', login: 'sentry' },
                body: '<sub>Severity: HIGH</sub>',
                pull_request_url: '/repos/JovieInc/Jovie/pulls/7',
                created_at: new Date(NOW).toISOString(),
                html_url: 'https://github.com/comment/7',
              },
            ]),
          }
    );
    const recovered = await recoverReviewFindings({
      ghRunner,
      dryRun: true,
      nowMs: NOW,
      maxPulls: 1,
    });
    expect(recovered.issues).toHaveLength(1);
    expect(recovered.issues[0].dryRun).toBe(true);
    expect(recovered.warnings.join(' ')).toContain('backfill');
    const out = await runRemediationSweep({
      mode: 'bot-findings',
      dryRun: true,
      recoverFindings: async () => recovered,
    });
    expect(out.issues).toEqual(recovered.issues);
    expect(out.warnings).toEqual(recovered.warnings);
  });
});

it('advances the persisted snapshot beyond one bounded batch after merge', async () => {
  const comments = [1, 2, 3].map(pr => ({
    user: { type: 'Bot', login: 'sentry' },
    body: '<sub>Severity: HIGH</sub>',
    pull_request_url: `/repos/JovieInc/Jovie/pulls/${pr}`,
    html_url: `https://github.com/comment/${pr}`,
    created_at: new Date(NOW).toISOString(),
  }));
  const filed = new Set();
  const intake = {
    enabled: true,
    apiKey: 'test',
    findLabel: async () => ({ ok: true }),
    upsert: async issue => {
      filed.add(issue.fingerprint);
      return { ok: true, action: 'created', identifier: issue.fingerprint };
    },
  };
  const ghRunner = async args => {
    if (args[1] !== 'graphql')
      return { code: 0, stdout: JSON.stringify(comments) };
    const pr = args.find(arg => arg.startsWith('number=')).slice(7);
    return {
      code: 0,
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              state: 'MERGED',
              headRefOid: 'a'.repeat(40),
              reviewThreads: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    id: `original-${pr}`,
                    isResolved: true,
                    comments: {
                      nodes: [
                        {
                          author: { __typename: 'Bot', login: 'sentry' },
                          body: comments[0].body,
                          url: `https://github.com/comment/${pr}`,
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    };
  };
  let cursor;
  for (let run = 0; run < 3; run++) {
    const result = await recoverReviewFindings({
      ghRunner,
      intake,
      cursor,
      maxPulls: 1,
      nowMs: NOW + run,
    });
    cursor = result.nextCursor;
    expect(filed.size).toBe(run + 1);
    if (run < 2) {
      expect(result.complete).toBe(false);
      expect(cursor.until).toBe(new Date(NOW).toISOString());
      expect(cursor.offset).toBe(run + 1);
    } else expect(result.complete).toBe(true);
  }
});

it('retains the same pagination checkpoint through unavailable Linear intake', async () => {
  const cursor = {
    repo: 'JovieInc/Jovie',
    page: 2,
    offset: 0,
    until: new Date(NOW).toISOString(),
  };
  const ghRunner = async args =>
    args[1] === 'graphql'
      ? {
          code: 0,
          stdout: JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  state: 'MERGED',
                  headRefOid: 'a'.repeat(40),
                  reviewThreads: {
                    pageInfo: { hasNextPage: false },
                    nodes: [
                      {
                        id: 'retry',
                        isResolved: true,
                        comments: {
                          nodes: [
                            {
                              author: { __typename: 'Bot', login: 'sentry' },
                              body: '<sub>Severity: HIGH</sub>',
                              url: 'https://github.com/comment/7',
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          }),
        }
      : {
          code: 0,
          stdout: JSON.stringify([
            {
              user: { type: 'Bot', login: 'sentry' },
              body: '<sub>Severity: HIGH</sub>',
              pull_request_url: '/repos/JovieInc/Jovie/pulls/7',
              created_at: new Date(NOW).toISOString(),
              html_url: 'https://github.com/comment/7',
            },
          ]),
        };
  for (const intake of [
    { apiKey: '', enabled: true },
    {
      apiKey: 'test',
      enabled: true,
      findLabel: async () => ({ ok: true }),
      upsert: async () => ({ ok: false, reason: 'linear_rate_limited' }),
    },
  ]) {
    const result = await recoverReviewFindings({
      ghRunner,
      cursor,
      nowMs: NOW,
      intake,
    });
    expect(result.complete).toBe(false);
    expect(result.nextCursor).toEqual(cursor);
    expect(result.warnings.join(' ')).toContain('checkpoint retained');
  }
});

it('resumes past 300 threads without starving a later PR original', async () => {
  const originals = [7, 7, 8].map(pr => ({
    user: { type: 'Bot', login: 'sentry' },
    body: '<sub>Severity: HIGH</sub>',
    pull_request_url: `/repos/JovieInc/Jovie/pulls/${pr}`,
    html_url: `https://github.com/comment/${pr}`,
    created_at: new Date(NOW).toISOString(),
  }));
  originals[0].html_url = 'https://github.com/comment/first-7';
  const filed = new Set();
  const intake = {
    apiKey: 'test',
    enabled: true,
    findLabel: async () => ({ ok: true }),
    upsert: async issue => {
      filed.add(issue.fingerprint);
      return { ok: true, action: 'created', identifier: issue.fingerprint };
    },
  };
  const ghRunner = async args => {
    if (args[1] !== 'graphql')
      return { code: 0, stdout: JSON.stringify(originals) };
    const pr = args.find(arg => arg.startsWith('number=')).slice(7);
    const after = Number(
      args.find(arg => arg.startsWith('after='))?.slice(6) ?? 0
    );
    const more = pr === '7' && after < 300;
    const nodes = more
      ? Array.from({ length: 100 }, (_, index) => ({
          id: `low-${after + index}`,
          comments: {
            nodes: [
              {
                author: { __typename: 'Bot', login: 'sentry' },
                body:
                  after === 0 && index === 0
                    ? '<sub>Severity: HIGH</sub>'
                    : '<sub>Severity: LOW</sub>',
                url: 'https://github.com/comment/first-7',
              },
            ],
          },
        }))
      : [
          {
            id: `serious-${pr}`,
            comments: {
              nodes: [
                {
                  author: { __typename: 'Bot', login: 'sentry' },
                  body: '<sub>Severity: HIGH</sub>',
                  url: `https://github.com/comment/${pr}`,
                },
              ],
            },
          },
        ];
    return {
      code: 0,
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              state: 'MERGED',
              headRefOid: 'a'.repeat(40),
              reviewThreads: {
                nodes,
                pageInfo: {
                  hasNextPage: more,
                  endCursor: more ? String(after + 100) : null,
                },
              },
            },
          },
        },
      }),
    };
  };
  const partial = await recoverReviewFindings({ ghRunner, intake, nowMs: NOW });
  expect(partial.complete).toBe(false);
  expect(partial.nextCursor).toMatchObject({ offset: 1, threadCursor: '300' });
  expect(filed.size).toBe(1);
  const complete = await recoverReviewFindings({
    ghRunner,
    intake,
    nowMs: NOW + 1,
    cursor: partial.nextCursor,
  });
  expect(complete.complete).toBe(true);
  expect([...filed]).toEqual([
    'bot-review:JovieInc/Jovie#7:low-0',
    'bot-review:JovieInc/Jovie#7:serious-7',
    'bot-review:JovieInc/Jovie#8:serious-8',
  ]);
  expect(complete.nextCursor.threadCursor).toBeUndefined();
});

it.each([7, 8])(
  'restarts thread pagination when a deleted REST original shifts the checkpoint to PR %s',
  async nextPr => {
    const filed = [];
    const original = pr => ({
      user: { type: 'Bot', login: 'sentry' },
      body: '<sub>Severity: HIGH</sub>',
      pull_request_url: `/repos/JovieInc/Jovie/pulls/${pr}`,
      html_url: `https://github.com/comment/${pr}`,
      created_at: new Date(NOW).toISOString(),
    });
    let shifted = false;
    const ghRunner = async args => {
      if (args[1] !== 'graphql')
        return {
          code: 0,
          stdout: JSON.stringify([
            shifted
              ? {
                  ...original(nextPr),
                  html_url: 'https://github.com/comment/replacement',
                }
              : original(7),
          ]),
        };
      const after = args.find(arg => arg.startsWith('after='));
      if (shifted && after)
        return {
          code: 1,
          stdout: 'prior original cursor invalid for replacement',
        };
      return {
        code: 0,
        stdout: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                state: 'MERGED',
                headRefOid: 'a'.repeat(40),
                reviewThreads: {
                  nodes: shifted
                    ? [
                        {
                          id: 'replacement',
                          comments: {
                            nodes: [
                              {
                                author: { __typename: 'Bot', login: 'sentry' },
                                body: '<sub>Severity: HIGH</sub>',
                                url: 'https://github.com/comment/replacement',
                              },
                            ],
                          },
                        },
                      ]
                    : [],
                  pageInfo: shifted
                    ? { hasNextPage: false }
                    : {
                        hasNextPage: true,
                        endCursor: `${after ?? 'start'}-next`,
                      },
                },
              },
            },
          },
        }),
      };
    };
    const intake = {
      enabled: true,
      apiKey: 'test',
      findLabel: async () => ({ ok: true }),
      upsert: async issue => {
        filed.push(issue.fingerprint);
        return { ok: true, action: 'created', identifier: 'JOV-1' };
      },
    };
    const pending = await recoverReviewFindings({
      ghRunner,
      intake,
      nowMs: NOW,
    });
    expect(pending.complete).toBe(false);
    expect(pending.nextCursor.threadCursor).toBeTruthy();
    shifted = true;
    const resumed = await recoverReviewFindings({
      ghRunner,
      intake,
      nowMs: NOW + 1,
      cursor: pending.nextCursor,
    });
    expect(resumed.complete).toBe(true);
    expect(filed).toEqual([`bot-review:JovieInc/Jovie#${nextPr}:replacement`]);
    const repeated = await recoverReviewFindings({
      ghRunner,
      intake,
      nowMs: NOW + 2,
      cursor: resumed.nextCursor,
    });
    expect(repeated.complete).toBe(true);
  }
);
