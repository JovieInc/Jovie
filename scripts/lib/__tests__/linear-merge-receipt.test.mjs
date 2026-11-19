/**
 * Linear merge receipt writer coverage (JOV-13075): a standalone,
 * deterministic receipt hop for merged pull requests. Covers key-resolution
 * precedence (markers, title, branch, Refs line, empty template, non-team
 * keys), the idempotent receipt comment, the team merged-state move, the
 * visible skip without secrets, and the visible failure on a Linear outage.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractReceiptKey,
  hasMergeReceipt,
  mergeReceiptBody,
  readMergeEventPayload,
  writeLinearMergeReceipt,
} from '../linear-merge-receipt.mjs';

const MERGE_SHA = 'eb6a0a68c92750dca7cd378732abf71c24c5558e';

function eventPayload(overrides = {}) {
  return {
    action: 'closed',
    number: 101,
    pull_request: {
      number: 101,
      title: 'feat: thing',
      html_url: 'https://github.com/JovieInc/Jovie/pull/101',
      merge_commit_sha: MERGE_SHA,
      body: 'does something',
      head: { ref: 'feature/x' },
      ...overrides,
    },
  };
}

function writeEvent(dir, payload) {
  const path = join(dir, 'event.json');
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

const ok = body => ({
  ok: true,
  headers: { get: () => '' },
  json: async () => body,
});

/**
 * In-memory Linear double. Team states carry Merging for every team so the
 * state move is observable; mutations are recorded.
 */
function linearWorld({ teamKey = 'JOV', identifier = 'JOV-1' } = {}) {
  const world = {
    issue: {
      id: `uuid-${identifier}`,
      identifier,
      state: { id: 'state-inreview', name: 'In Review' },
      comments: { nodes: [] },
      team: {
        key: teamKey,
        states: {
          nodes: [
            { id: 'state-merging', name: 'Merging' },
            { id: 'state-validating', name: 'Validating' },
            { id: 'state-rework', name: 'Rework' },
            { id: 'state-inprogress', name: 'In Progress' },
            { id: 'state-done', name: 'Done' },
          ],
        },
      },
    },
    comments: [],
    stateUpdates: [],
  };
  /** @type {any} */
  const fetchImpl = async (_url, init) => {
    const { query, variables } = JSON.parse(String(init?.body ?? '{}'));
    if (query.includes('query MergeReceiptIssue')) {
      return ok({ data: { issue: world.issue } });
    }
    if (query.includes('mutation WriteMergeReceipt')) {
      const body = String(variables.body ?? '');
      world.issue.comments.nodes.push({ body });
      world.comments.push(`${world.issue.identifier}:${body.split('\n')[0]}`);
      return ok({ data: { commentCreate: { success: true } } });
    }
    if (query.includes('mutation MoveMergeReceiptState')) {
      const state = world.issue.team.states.nodes.find(
        entry => entry.id === variables.stateId
      );
      world.issue.state = { id: state.id, name: state.name };
      world.stateUpdates.push(state.name);
      return ok({
        data: {
          issueUpdate: {
            success: true,
            issue: { state: { name: state.name } },
          },
        },
      });
    }
    throw new Error(`unexpected query ${query.slice(0, 40)}`);
  };
  return { world, fetchImpl };
}

describe('merge receipt key resolution (JOV-13075)', () => {
  it('reads explicit markers before everything', () => {
    expect(
      extractReceiptKey({
        body: '<!-- linear-issue-identifier:JOV-1 -->\nRefs JOV-2',
        title: 'fix: (JOV-3)',
        headRef: 'fix/lyb-4',
      })
    ).toBe('JOV-1');
    expect(
      extractReceiptKey({
        body: '<!-- summer-issue-bind --> JOV-5',
        title: 'fix: (JOV-3)',
      })
    ).toBe('JOV-5');
  });

  it('reads the title before the branch and the branch before the Refs line', () => {
    expect(
      extractReceiptKey({
        body: 'Refs JOV-9',
        title: 'fix: (JOV-7)',
        headRef: 'fix/sym-8-x',
      })
    ).toBe('JOV-7');
    expect(
      extractReceiptKey({ body: 'Refs JOV-9', headRef: 'fix/lyb-8-x' })
    ).toBe('LYB-8');
    expect(extractReceiptKey({ body: 'Refs SYM-9', headRef: 'x' })).toBe(
      'SYM-9'
    );
  });

  it('gives an empty Refs template no link', () => {
    expect(
      extractReceiptKey({
        body: 'summary\n\nRefs JOV-\n',
        title: 'no key here',
      })
    ).toBe('');
  });

  it('gives non-team keys nothing', () => {
    expect(
      extractReceiptKey({
        body: 'Refs ABC-5',
        title: 'fix: (ABC-5)',
        headRef: 'fix/abc-5',
      })
    ).toBe('');
  });

  it('parses the merged event payload defensively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-payload-'));
    try {
      const path = join(dir, 'event.json');
      writeFileSync(path, JSON.stringify(eventPayload()));
      expect(readMergeEventPayload(path)).toEqual({
        number: 101,
        title: 'feat: thing',
        headRef: 'feature/x',
        url: 'https://github.com/JovieInc/Jovie/pull/101',
        body: 'does something',
        sha: MERGE_SHA,
      });
      writeFileSync(path, '{broken');
      expect(readMergeEventPayload(path)).toBe(null);
      writeFileSync(
        path,
        JSON.stringify({
          pull_request: { number: 101, merge_commit_sha: 'nope' },
        })
      );
      expect(readMergeEventPayload(path)).toBe(null);
      expect(readMergeEventPayload(undefined)).toBe(null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('merge receipt writes (JOV-13075)', () => {
  it('writes one comment with PR, URL and SHA and moves to the team merged state', async () => {
    const { world, fetchImpl } = linearWorld();
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-run-'));
    try {
      const summary = join(dir, 'summary');
      const result = await writeLinearMergeReceipt({
        env: {
          LINEAR_API_KEY: 'lin_test',
          GITHUB_EVENT_PATH: writeEvent(
            dir,
            eventPayload({ body: 'Refs JOV-1' })
          ),
          GITHUB_STEP_SUMMARY: summary,
        },
        fetchImpl,
        log: () => {},
      });
      expect(result.action).toBe('receipt');
      expect(result.key).toBe('JOV-1');
      expect(result.stateTarget).toBe('Validating');
      expect(world.comments).toHaveLength(1);
      expect(world.comments[0]).toContain('linear-merge-receipt/v1 pr=101');
      const receiptBody = world.issue.comments.nodes[0].body;
      expect(receiptBody).toContain(MERGE_SHA);
      expect(receiptBody).toContain('pull/101');
      expect(world.stateUpdates).toEqual(['Validating']);
      expect(readFileSync(summary, 'utf8')).toContain('receipted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent on replay: no second comment, no second state move', async () => {
    const { world, fetchImpl } = linearWorld();
    const env = {
      LINEAR_API_KEY: 'lin_test',
      GITHUB_EVENT_PATH: writeEvent(
        mkdtempSync(join(tmpdir(), 'merge-receipt-replay-')),
        eventPayload({ body: '<!-- linear-issue-identifier:JOV-1 -->' })
      ),
    };
    const run = () =>
      writeLinearMergeReceipt({ env, fetchImpl, log: () => {} });
    await run();
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual(['Validating']);
    const result = await run();
    expect(result.action).toBe('already');
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual(['Validating']);
  });

  it('receipts LYB and SYM team keys', async () => {
    for (const teamKey of ['LYB', 'SYM']) {
      const { world, fetchImpl } = linearWorld({
        teamKey,
        identifier: `${teamKey}-42`,
      });
      const result = await writeLinearMergeReceipt({
        env: {
          LINEAR_API_KEY: 'lin_test',
          GITHUB_EVENT_PATH: writeEvent(
            mkdtempSync(join(tmpdir(), `merge-receipt-${teamKey}-`)),
            eventPayload({
              title: `fix: thing (${teamKey}-42)`,
              head: { ref: `fix/${teamKey.toLowerCase()}-42-x` },
            })
          ),
        },
        fetchImpl,
        log: () => {},
      });
      expect(result.key).toBe(`${teamKey}-42`);
      expect(result.action).toBe('receipt');
      expect(world.comments).toHaveLength(1);
      expect(world.stateUpdates).toEqual(['Validating']);
    }
  });

  it('moves a revert merge to Rework for JOV and SYM, and In Progress for LYB', async () => {
    for (const [teamKey, identifier, target] of [
      ['JOV', 'JOV-1', 'Rework'],
      ['SYM', 'SYM-7', 'Rework'],
      ['LYB', 'LYB-42', 'In Progress'],
    ]) {
      const { world, fetchImpl } = linearWorld({ teamKey, identifier });
      const dir = mkdtempSync(
        join(tmpdir(), `merge-receipt-revert-${teamKey}-`)
      );
      try {
        const result = await writeLinearMergeReceipt({
          env: {
            LINEAR_API_KEY: 'lin_test',
            GITHUB_EVENT_PATH: writeEvent(
              dir,
              eventPayload({
                title: `Revert "feat: thing (${identifier})"`,
                head: { ref: 'revert/x' },
              })
            ),
          },
          fetchImpl,
          log: () => {},
        });
        expect(result.action).toBe('receipt');
        expect(result.key).toBe(identifier);
        expect(result.stateTarget).toBe(target);
        expect(world.stateUpdates).toEqual([target]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('fails loudly when the team is missing the receipt state name', async () => {
    const { world, fetchImpl } = linearWorld();
    world.issue.team.states.nodes = world.issue.team.states.nodes.filter(
      state => state.name !== 'Validating'
    );
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-missing-'));
    try {
      await expect(
        writeLinearMergeReceipt({
          env: {
            LINEAR_API_KEY: 'lin_test',
            GITHUB_EVENT_PATH: writeEvent(
              dir,
              eventPayload({ body: 'Refs JOV-1' })
            ),
          },
          fetchImpl,
          log: () => {},
        })
      ).rejects.toThrow(/no 'Validating' state/);
      // The receipt already landed (durable evidence); the state move is the
      // loud failure, and the run exits non-zero with an annotation.
      expect(world.comments).toHaveLength(1);
      expect(world.stateUpdates).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips visibly without secrets (fork pull request)', async () => {
    const { world, fetchImpl } = linearWorld();
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-fork-'));
    try {
      const summary = join(dir, 'summary');
      const result = await writeLinearMergeReceipt({
        env: {
          GITHUB_EVENT_PATH: writeEvent(
            dir,
            eventPayload({ body: 'Refs JOV-1' })
          ),
          GITHUB_STEP_SUMMARY: summary,
        },
        fetchImpl,
        log: () => {},
      });
      expect(result.action).toBe('skip');
      expect(world.comments).toEqual([]);
      expect(readFileSync(summary, 'utf8')).toContain('LINEAR_API_KEY not set');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips visibly when the PR links no team issue', async () => {
    const { world, fetchImpl } = linearWorld();
    const result = await writeLinearMergeReceipt({
      env: {
        LINEAR_API_KEY: 'lin_test',
        GITHUB_EVENT_PATH: writeEvent(
          mkdtempSync(join(tmpdir(), 'merge-receipt-unlinked-')),
          eventPayload({ title: 'no key anywhere', body: 'nothing' })
        ),
      },
      fetchImpl,
      log: () => {},
    });
    expect(result.action).toBe('skip');
    expect(world.comments).toEqual([]);
  });

  it('fails visibly on a Linear outage: bounded retries then a clear annotation', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: false,
        status: 502,
        headers: { get: () => null },
        json: async () => ({}),
      };
    };
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-down-'));
    try {
      const sleeps = [];
      await expect(
        writeLinearMergeReceipt({
          env: {
            LINEAR_API_KEY: 'lin_test',
            GITHUB_EVENT_PATH: writeEvent(
              dir,
              eventPayload({ body: 'Refs JOV-1' })
            ),
          },
          fetchImpl,
          sleep: async ms => {
            sleeps.push(ms);
          },
          log: () => {},
        })
      ).rejects.toThrow(/Linear HTTP 502/);
      expect(calls).toBe(4);
      expect(sleeps).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
