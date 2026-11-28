import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import {
  extractReceiptKey,
  hasMergeReceipt,
  mergeReceiptBody,
  readMergeEventPayload,
  runMergeReceiptCli,
  writeLinearMergeReceipt as writeReceipt,
} from '../linear-merge-receipt.mjs';
import { decideValidationTransition } from '../validation-lifecycle.mjs';

const MERGE_SHA = 'eb6a0a68c92750dca7cd378732abf71c24c5558e';
const MERGED_AT = '2026-11-19T18:00:00Z';

function eventPayload(overrides = {}) {
  return {
    action: 'closed',
    number: 101,
    pull_request: {
      number: 101,
      title: 'feat: thing',
      merged: true,
      merged_at: MERGED_AT,
      base: { ref: 'main' },
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

const ok = body => Response.json(body);

const clientOptions = () => ({
  store: new MemoryLedgerStore(),
  legacyStateRoot: null,
});

const writeLinearMergeReceipt = options =>
  writeReceipt({ ...clientOptions(), ...options });

function linearWorld({ teamKey = 'JOV', identifier = 'JOV-1' } = {}) {
  const world = {
    issue: {
      id: `uuid-${identifier}`,
      identifier,
      updatedAt: '2026-11-19T17:30:00Z',
      state: { id: 'state-inreview', name: 'In Review', type: 'started' },
      comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: '' } },
      history: { nodes: [], pageInfo: { hasNextPage: false } },
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
    if (
      query.includes('query MergeReceiptIssue') ||
      query.includes('query MergeReceiptPreimage')
    ) {
      return ok({ data: { issue: structuredClone(world.issue) } });
    }
    if (query.includes('mutation WriteMergeReceipt')) {
      const body = String(variables.body ?? '');
      world.issue.comments.nodes.push({ body });
      world.issue.updatedAt = '2026-11-19T18:30:00Z';
      world.comments.push(`${world.issue.identifier}:${body.split('\n')[0]}`);
      return ok({ data: { commentCreate: { success: true } } });
    }
    if (query.includes('mutation MoveMergeReceiptState')) {
      const state = world.issue.team.states.nodes.find(
        entry => entry.id === variables.stateId
      );
      world.issue.state = { id: state.id, name: state.name, type: 'started' };
      world.stateUpdates.push(state.name);
      return ok({
        data: {
          issueUpdate: {
            success: true,
            issue: { state: { id: state.id, name: state.name } },
          },
        },
      });
    }
    throw new Error(`unexpected query ${query.slice(0, 40)}`);
  };
  return { world, fetchImpl };
}

const temporaryDirs = [];
afterEach(() => {
  for (const dir of temporaryDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixtureEnv(pull = { body: 'Refs JOV-1' }) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-fixture-'));
  temporaryDirs.push(dir);
  return {
    LINEAR_API_KEY: 'lin_test',
    GITHUB_EVENT_PATH: writeEvent(dir, eventPayload(pull)),
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
  };
}

function runFixture(fetchImpl, pull) {
  return writeLinearMergeReceipt({
    env: fixtureEnv(pull),
    fetchImpl,
    log: () => {},
  });
}

function respondTo(fetchImpl, operation, response) {
  return (url, init) =>
    String(init?.body).includes(operation)
      ? Promise.resolve(response)
      : fetchImpl(url, init);
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

  it.each([
    { body: 'summary\n\nRefs JOV-\n', title: 'no key here' },
    { body: 'Refs ABC-5', title: 'fix: (ABC-5)', headRef: 'fix/abc-5' },
  ])('ignores empty templates and foreign issue keys (%j)', input => {
    expect(extractReceiptKey(input)).toBe('');
  });

  it('recognizes only a complete, exact receipt marker', () => {
    const body = mergeReceiptBody(101, '', MERGE_SHA);
    expect(hasMergeReceipt([body], 101, MERGE_SHA)).toBe(true);
    expect(hasMergeReceipt([{ body }], 102, MERGE_SHA)).toBe(false);
    expect(hasMergeReceipt([`example: ${body}`], 101, MERGE_SHA)).toBe(false);
  });

  it('parses the merged event payload defensively', () => {
    const { GITHUB_EVENT_PATH: path } = fixtureEnv({ body: 'does something' });
    expect(readMergeEventPayload(path)).toEqual({
      number: 101,
      title: 'feat: thing',
      headRef: 'feature/x',
      baseRef: 'main',
      url: 'https://github.com/JovieInc/Jovie/pull/101',
      body: 'does something',
      sha: MERGE_SHA,
      mergedAt: Date.parse(MERGED_AT),
    });
    for (const pull of [{ merge_commit_sha: 'nope' }, { merged: false }]) {
      writeFileSync(path, JSON.stringify(eventPayload(pull)));
      expect(readMergeEventPayload(path)).toBeNull();
    }
    writeFileSync(path, '{broken');
    expect(readMergeEventPayload(path)).toBeNull();
    expect(readMergeEventPayload(undefined)).toBeNull();
  });
});

describe('merge receipt writes (JOV-13075)', () => {
  it('records a plain merge and waits in Merging for deployment evidence', async () => {
    const { world, fetchImpl } = linearWorld();
    const env = fixtureEnv();
    const result = await writeLinearMergeReceipt({
      env,
      fetchImpl,
      log: () => {},
    });
    const key = 'JOV-1';
    const exactUrl = 'https://github.com/JovieInc/Jovie/pull/101';
    expect(result).toEqual({ action: 'receipt', key, stateTarget: 'Merging' });
    expect(world.issue.comments.nodes).toEqual([
      { body: mergeReceiptBody(101, exactUrl, MERGE_SHA) },
    ]);
    expect(world.stateUpdates).toEqual(['Merging']);
    expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      'receipted'
    );
  });

  it('is idempotent after both writes complete', async () => {
    const { world, fetchImpl } = linearWorld();
    await runFixture(fetchImpl);
    expect((await runFixture(fetchImpl)).action).toBe('already');
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual(['Merging']);
  });

  it('retries the missing state projection after writing the receipt', async () => {
    const { world, fetchImpl } = linearWorld();
    const failUpdate = respondTo(
      fetchImpl,
      'mutation MoveMergeReceiptState',
      new Response(null, { status: 403 })
    );
    await expect(runFixture(failUpdate)).rejects.toThrow('Linear HTTP 403');
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual([]);

    expect(await runFixture(fetchImpl)).toMatchObject({
      stateTarget: 'Merging',
    });
    expect((await runFixture(fetchImpl)).action).toBe('already');
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual(['Merging']);
  });

  it('rejects an unacknowledged update even when Linear returns HTTP 200', async () => {
    const { world, fetchImpl } = linearWorld();
    const refuseUpdate = respondTo(
      fetchImpl,
      'mutation MoveMergeReceiptState',
      ok({ data: { issueUpdate: { success: false } } })
    );
    await expect(runFixture(refuseUpdate)).rejects.toThrow(/refused/);
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual([]);
  });

  it('uses a fresh read after Linear commits a comment but loses the response', async () => {
    const { world, fetchImpl } = linearWorld();
    const loseCommentResponse = async (url, init) => {
      const response = await fetchImpl(url, init);
      if (String(init?.body).includes('mutation WriteMergeReceipt'))
        throw new Error('lost reply');
      return response;
    };
    await expect(runFixture(loseCommentResponse)).rejects.toThrow(
      /transient after 1 attempt/
    );
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual([]);
    expect((await runFixture(fetchImpl)).stateTarget).toBe('Merging');
    expect(world.comments).toHaveLength(1);
  });

  it('reports a GraphQL error from Linear without inventing acknowledgment', async () => {
    await expect(
      runFixture(async () =>
        ok({
          errors: [{ message: 'Linear rejected the read' }],
        })
      )
    ).rejects.toThrow('Linear rejected the read');
  });

  it('keeps a newer Linear episode on replay even when the state name matches', async () => {
    const { world, fetchImpl } = linearWorld();
    world.issue.comments.nodes.push({
      body: mergeReceiptBody(101, '', MERGE_SHA),
    });
    world.issue.history.nodes.push({
      createdAt: '2026-11-20T18:00:00Z',
      fromState: { id: 'state-done' },
      toState: { id: 'state-inreview' },
    });
    expect((await runFixture(fetchImpl)).action).toBe('already');
    expect(world.stateUpdates).toEqual([]);
  });

  it('locates an older receipt and finishes a missing projection once', async () => {
    const { world, fetchImpl } = linearWorld();
    world.issue.comments.pageInfo = { hasNextPage: true, endCursor: 'next' };
    const comments = {
      nodes: [{ body: mergeReceiptBody(101, '', MERGE_SHA) }],
      pageInfo: { hasNextPage: false },
    };
    const readPage = respondTo(
      fetchImpl,
      'query MergeReceiptPage',
      ok({ data: { issue: { comments } } })
    );
    expect((await runFixture(readPage)).stateTarget).toBe('Merging');
    expect(world.comments).toEqual([]);
    expect(world.stateUpdates).toEqual(['Merging']);
  });

  it('holds an unreadable comment page before any issue mutation', async () => {
    const { world, fetchImpl } = linearWorld();
    world.issue.comments.pageInfo.hasNextPage = true;
    await expect(runFixture(fetchImpl)).rejects.toThrow(
      /Incomplete Linear comments/
    );
    expect(world.comments).toEqual([]);
    expect(world.stateUpdates).toEqual([]);
  });

  it('reports a changed preimage and resumes from a fresh snapshot', async () => {
    const { world, fetchImpl } = linearWorld();
    const issue = { ...world.issue, updatedAt: '2026-11-19T19:00:00Z' };
    const changed = respondTo(
      fetchImpl,
      'query MergeReceiptPreimage',
      ok({ data: { issue } })
    );
    await expect(runFixture(changed)).rejects.toThrow(
      /changed before state projection/
    );
    expect(world.stateUpdates).toEqual([]);
    expect((await runFixture(fetchImpl)).stateTarget).toBe('Merging');
    expect(world.comments).toHaveLength(1);
  });

  it('keeps later or unrelated delivery states intact', async () => {
    const { world, fetchImpl } = linearWorld();
    await runFixture(fetchImpl, {
      body: 'Refs JOV-1',
      base: { ref: 'staging' },
    });
    expect(world.stateUpdates).toEqual([]);
    world.issue.state = {
      id: 'state-validating',
      name: 'Validating',
      type: 'started',
    };
    expect((await runFixture(fetchImpl)).action).toBe('already');
    expect(world.stateUpdates).toEqual([]);
  });

  it('leaves Validating to the deployment evaluator after the merge receipt', async () => {
    const { world, fetchImpl } = linearWorld();
    await runFixture(fetchImpl);
    const input = {
      state: world.issue.state,
      manifest: {
        schema: 'jovie.validation-manifest/v1',
        issue: 'JOV-1',
        bindingSha: MERGE_SHA,
        bindingPull: eventPayload().pull_request.html_url,
        mergedPulls: [eventPayload().pull_request.html_url],
        riskLevel: 'low',
        required: [
          { kind: 'deployment', reason: 'verified build' },
          { kind: 'outcome', reason: 'acceptance pending' },
        ],
      },
      holds: [],
      receipts: [],
    };
    expect(
      decideValidationTransition({
        ...input,
        deployment: { status: 'pending', containsBinding: false },
      }).target
    ).toBe('Merging');
    expect(
      decideValidationTransition({
        ...input,
        deployment: {
          status: 'verified',
          containsBinding: true,
          sha: MERGE_SHA,
        },
      }).target
    ).toBe('Validating');
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual(['Merging']);
  });

  it.each(['LYB', 'SYM'])('receipts ordinary %s merges', async teamKey => {
    const key = `${teamKey}-42`;
    const { world, fetchImpl } = linearWorld({ teamKey, identifier: key });
    const result = await runFixture(fetchImpl, {
      title: `fix: thing (${key})`,
    });
    expect(result).toEqual({ key, action: 'receipt', stateTarget: 'Merging' });
    expect(world.comments).toHaveLength(1);
  });

  it.each([
    ['JOV', 'Rework'],
    ['SYM', 'Rework'],
    ['LYB', 'In Progress'],
  ])('uses the established %s revert state', async (teamKey, stateTarget) => {
    const key = `${teamKey}-42`;
    const { world, fetchImpl } = linearWorld({ teamKey, identifier: key });
    const result = await runFixture(fetchImpl, {
      title: `Revert "feat: thing (${key})"`,
    });
    expect(result).toEqual({ key, action: 'receipt', stateTarget });
    expect(world.stateUpdates).toEqual([stateTarget]);
  });

  it('fails loudly when the team is missing the receipt state', async () => {
    const { world, fetchImpl } = linearWorld();
    world.issue.team.states.nodes = world.issue.team.states.nodes.filter(
      state => state.name !== 'Merging'
    );
    await expect(runFixture(fetchImpl)).rejects.toThrow(/no 'Merging' state/);
    expect(world.comments).toHaveLength(1);
    expect(world.stateUpdates).toEqual([]);
  });

  it('skips visibly without secrets (fork pull request)', async () => {
    const { world, fetchImpl } = linearWorld();
    const env = fixtureEnv();
    env.LINEAR_API_KEY = '';
    expect(
      (await writeLinearMergeReceipt({ env, fetchImpl, log: () => {} })).action
    ).toBe('skip');
    expect(world.comments).toEqual([]);
    expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(
      'LINEAR_API_KEY not set'
    );
  });

  it('skips when the PR links no team issue or the issue is missing', async () => {
    const { world, fetchImpl } = linearWorld();
    expect((await runFixture(fetchImpl, { body: 'nothing' })).action).toBe(
      'skip'
    );
    expect(
      (await runFixture(async () => ok({ data: { issue: null } }))).action
    ).toBe('skip');
    expect(world.comments).toEqual([]);
  });

  it('fails visibly on a Linear outage: bounded retries then a clear annotation', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return Response.json({}, { status: 502 });
    };
    const sleeps = [];
    const env = fixtureEnv();
    const errors = [];
    const exitCode = await runMergeReceiptCli(
      {
        ...clientOptions(),
        env,
        fetchImpl,
        sleep: async ms => {
          sleeps.push(ms);
        },
        log: () => {},
      },
      message => errors.push(message)
    );
    expect(exitCode).toBe(1);
    expect(errors[0]).toMatch(/^::error::.*Linear HTTP 502/);
    expect(readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(errors[0]);
    expect(calls).toBe(4);
    expect(sleeps).toHaveLength(3);
  });
});
