import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDeprecationObservation } from '../deprecation-observation.mjs';
import {
  COMMISSIONING_PARENT_ALLOWLIST,
  extractMergeIssueRef,
  lifecycleHolds,
  listOpenPullRequests,
  parentHoldReason,
  pullRequestLinksIssue,
  recordValidationReceipt,
  syncLinearIssueOnMerge,
} from '../linear-sync-on-merge.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  intercept,
  json,
  MAIN,
  NO_UI_MATRIX,
  REPO,
  receiptComment,
} from './fixtures/validation-world.mjs';

const MERGE_URL = 'https://github.com/JovieInc/Jovie/pull/18275';
const MERGE_SHA = 'eb6a0a68c92750dca7cd378732abf71c24c5558e';

function stackPull(overrides) {
  return {
    number: 1,
    title: 'feat(symphony): example (JOV-6586)',
    body: '',
    state: 'open',
    draft: true,
    headRef: 'codex/jov-6586-example',
    ...overrides,
  };
}

/** 2026-09-25 foundation merge. #18293 was still an open draft. */
const JOV_6586_STACK = [
  stackPull({
    number: 18275,
    title:
      'feat(symphony): validate bounded Shipping Lead admission (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-lead-consumer',
    state: 'closed',
    draft: false,
  }),
  stackPull({
    number: 18277,
    title:
      'feat(symphony): bind shipping admission to verified runtime (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-runtime',
  }),
  stackPull({
    number: 18286,
    title:
      'feat(symphony): persist verified Shipping Lead acceptance (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-outcomes',
  }),
  stackPull({
    number: 18293,
    title:
      'feat(symphony): capture native Shipping Lead worker evidence (JOV-6586)',
    headRef: 'codex/jov-6586-shipping-terminal',
  }),
];

const JOV_6586_ISSUE = {
  id: 'issue-6586',
  identifier: 'JOV-6586',
  labels: [],
  children: [],
  hasChildren: false,
};

const MERGING_FOUNDATION = {
  number: 18275,
  url: MERGE_URL,
  sha: MERGE_SHA,
};

const BASE_ENV = {
  LINEAR_API_KEY: 'lin_test',
  GITHUB_TOKEN: 'gh_test',
  GITHUB_REPOSITORY: REPO,
};

function mergeEvent(fetchImpl, number, identifier = 'JOV-1', env = {}) {
  return syncLinearIssueOnMerge({
    env: {
      ...BASE_ENV,
      PR_NUMBER: String(number),
      PR_BODY: `<!-- linear-issue-identifier:${identifier} -->`,
      HEAD_REF: 'feature/no-ticket',
      ...env,
    },
    fetchImpl,
    harnessManifest: HARNESS_MANIFEST,
    assuranceMatrix: NO_UI_MATRIX,
    log: () => {},
  });
}

function sweep(fetchImpl) {
  return syncLinearIssueOnMerge({
    env: { ...BASE_ENV, LIFECYCLE_MODE: 'sweep' },
    fetchImpl,
    harnessManifest: HARNESS_MANIFEST,
    assuranceMatrix: NO_UI_MATRIX,
    log: () => {},
  });
}

describe('linear sync on merge', () => {
  it('enters the validation lifecycle for a Summer-bound bot merge', async () => {
    const body = '<!-- summer-issue-bind -->\nJOV-1\ntaskKey:abc';
    expect(
      extractMergeIssueRef({
        body,
        headRef: 'bot/coverage-audit-37652202419-1',
      })
    ).toEqual({ identifier: 'JOV-1', issueId: 'JOV-1' });
    expect(
      pullRequestLinksIssue(
        { body, title: 'Coverage report', headRef: 'bot/report' },
        { identifier: 'JOV-1', issueId: 'uuid-1' }
      )
    ).toBe(true);
    expect(
      extractMergeIssueRef({ body: 'Related: JOV-1', headRef: 'bot/report' })
    ).toEqual({ identifier: '', issueId: '' });
    expect(
      extractMergeIssueRef({
        body: '<!-- summer-issue-bind -->\nJOV-12',
        headRef: 'bot/report',
      })
    ).toEqual({ identifier: 'JOV-12', issueId: 'JOV-12' });
    const { world, fetchImpl } = createWorld();
    const result = await mergeEvent(fetchImpl, 101, 'JOV-1', { PR_BODY: body });
    expect(result.identifier).toBe('JOV-1');
    expect(world.updates.length).toBeGreaterThan(0);
  });
  it('reads the JOV-6586 branch the way the merge workflow did', () => {
    expect(
      extractMergeIssueRef({
        body: 'Integrator: commissioning task (JOV-6586). Related: JOV-6586.',
        headRef: 'codex/jov-6586-shipping-lead-consumer',
      })
    ).toEqual({
      identifier: 'JOV-6586',
      issueId: 'JOV-6586',
    });
    expect(
      extractMergeIssueRef({
        body: '<!-- linear-issue-id:9b1c -->\n<!-- linear-issue-identifier:JOV-6586 -->',
        headRef: 'codex/jov-1-other',
      })
    ).toEqual({ identifier: 'JOV-6586', issueId: '9b1c' });
  });

  it('links markers, branch names, and titles, and ignores prose-only mentions', () => {
    const issue = { identifier: 'JOV-6586', issueId: 'uuid-6586' };
    expect(
      pullRequestLinksIssue(
        {
          title: 'unrelated',
          body: '<!-- linear-issue-id:uuid-6586 -->',
          headRef: 'feature/no-ticket',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'no identifier',
          body: '',
          headRef: 'codex/jov-6586-shipping-terminal',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'capture evidence (JOV-6586)',
          body: '',
          headRef: 'feature/no-ticket',
        },
        issue
      )
    ).toBe(true);
    expect(
      pullRequestLinksIssue(
        {
          title: 'mention only',
          body: 'See JOV-6586 for context.',
          headRef: 'codex/jov-65860-other',
        },
        issue
      )
    ).toBe(false);
  });

  it('holds JOV-6586 while later stack layers are open, ignoring the merging PR', () => {
    const issue = JOV_6586_ISSUE;
    const held = lifecycleHolds({
      issue,
      pullRequests: JOV_6586_STACK,
      mergingNumber: MERGING_FOUNDATION.number,
    });
    expect(held.blockingNumbers).toEqual([18277, 18286, 18293]);
    expect(held.holds[0]).toContain('#18293 (draft)');
    expect(
      lifecycleHolds({
        issue: { ...issue, labels: ['remediation:golden-path-nightly'] },
        pullRequests: [],
        scanComplete: false,
      }).holds.join('\n')
    ).toMatch(/stopped before the last page[\s\S]*while the check is red/);
  });

  it('keeps commissioning parents as outcome acceptance, not a merge hold', () => {
    expect(COMMISSIONING_PARENT_ALLOWLIST.has('JOV-5853')).toBe(true);
    expect(COMMISSIONING_PARENT_ALLOWLIST.has('JOV-6004')).toBe(true);
    expect(parentHoldReason({ identifier: 'JOV-5853' })).toContain('allowlist');
    expect(
      parentHoldReason(
        { identifier: 'JOV-7000', labels: ['commissioning'] },
        new Set()
      )
    ).toContain('label commissioning');
  });

  it('moves a merge to Merging, then Done after the deploy sweep', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    expect((await mergeEvent(fetchImpl, 101)).action).toBe('moved');
    expect(world.issues['JOV-1'].state).toBe('Merging');
    world.served = MAIN[2].slice(0, 7);
    let pages = 0;
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (!body?.query?.includes('LifecycleSweep')) return null;
      pages += 1;
      if (pages > 1) return next();
      return json({
        data: {
          issues: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: 'p1' },
          },
        },
      });
    });
    await sweep(paged);
    expect(pages).toBe(2);
    expect(world.updates).toEqual(['JOV-1:Merging', 'JOV-1:Done']);
  });

  it('recovers a missed merge from In Progress while preserving unmerged and unlinked writers', async () => {
    const { world, fetchImpl } = createWorld({ served: MAIN[0].slice(0, 7) });
    world.issues['JOV-1'].state = 'In Progress';
    world.issues['JOV-2'] = {
      ...world.issues['JOV-1'],
      id: 'uuid-2',
      identifier: 'JOV-2',
      attachments: [],
    };
    world.issues['JOV-3'] = {
      ...world.issues['JOV-1'],
      id: 'uuid-3',
      identifier: 'JOV-3',
      attachments: ['https://github.com/JovieInc/Jovie/pull/102'],
    };
    world.pulls[102] = {
      ...world.pulls[101],
      mergedAt: null,
      headRef: 'codex/jov-3-active',
    };
    await sweep(fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Merging');
    expect(world.issues['JOV-2'].state).toBe('In Progress');
    expect(world.issues['JOV-3'].state).toBe('In Progress');
    expect(world.updates).toEqual(['JOV-1:Merging']);
  });

  it('moves the real escaped-defect merge path to Validating and never Done', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].labels = ['escaped-defect'];
    await mergeEvent(fetchImpl, 101);
    await sweep(fetchImpl);
    expect(world.issues['JOV-1'].state).toBe('Validating');
    expect(world.updates).toEqual(['JOV-1:Validating']);
    expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
      'escaped-defect-dual-closure'
    );
  });

  it('reads every comment page, bounded, so the latest receipt wins', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].description = 'validation-required: outcome';
    world.issues['JOV-1'].comments.push(
      receiptComment('JOV-1', { status: 'fail' }, '2026-10-03T11:00:00Z'),
      receiptComment('JOV-1', {}, '2026-10-03T11:30:00Z')
    );
    const page = (nodes, hasNextPage) => ({
      nodes,
      pageInfo: { hasNextPage, endCursor: 'c' },
    });
    const paged = intercept(fetchImpl, async (_url, body, next) => {
      if (body?.query?.includes('IssueLifecycleComments')) {
        return json({
          data: {
            issue: {
              comments: page(world.issues['JOV-1'].comments.slice(1), false),
            },
          },
        });
      }
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      const response = await (await next()).json();
      response.data.issue.comments = page(
        response.data.issue.comments.nodes.slice(0, 1),
        true
      );
      return json(response);
    });
    await mergeEvent(paged, 101);
    expect(world.issues['JOV-1'].state).toBe('Done');

    world.issues['JOV-1'].state = 'Validating';
    const endless = intercept(paged, async (_url, body) =>
      body?.query?.includes('IssueLifecycleComments')
        ? json({ data: { issue: { comments: page([], true) } } })
        : null
    );
    await expect(mergeEvent(endless, 101)).rejects.toThrow(
      /exceeds the read bound/
    );
  });

  it('holds a parent with open sub-issues and a reopened issue needs an outcome', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].children = [['JOV-2', 'started']];
    expect((await mergeEvent(fetchImpl, 101)).action).toBe('hold');
    world.issues['JOV-1'].children = [['JOV-2', 'completed']];
    world.issues['JOV-1'].history = [
      { fromState: { type: 'completed' }, toState: { type: 'started' } },
    ];
    await mergeEvent(fetchImpl, 101);
    expect(world.issues['JOV-1'].state).toBe('Validating');
  });

  it('isolates a failing issue in the sweep and still evaluates the rest', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      attachments: [`https://github.com/${REPO}/pull/999`],
    };
    await expect(sweep(fetchImpl)).rejects.toThrow(/JOV-2: GitHub HTTP 404/);
    expect(world.issues['JOV-1'].state).toBe('Done');
  });

  it('comments and fails closed when the open pull request scan errors', async () => {
    const { world, fetchImpl } = createWorld();
    const failing = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? { ok: false, status: 503, json: async () => ({}) }
        : null
    );
    await expect(mergeEvent(failing, 101)).rejects.toThrow(
      /open pull request scan failed/
    );
    expect(world.updates).toEqual([]);
    expect(world.issues['JOV-1'].comments[0].body).toContain(
      'stopped before the last page'
    );
  });

  it('fails a sweep on a scan error and keeps per-issue failures in the message', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-1'].attachments = [`https://github.com/${REPO}/pull/999`];
    const failing = intercept(fetchImpl, async url =>
      url.includes('pulls?state=open')
        ? { ok: false, status: 503, json: async () => ({}) }
        : null
    );
    await expect(sweep(failing)).rejects.toThrow(
      /open pull request scan failed, so issues were left in place; JOV-1: GitHub HTTP 404/
    );
    expect(world.updates).toEqual([]);
  });

  it('stops a sweep at the Linear rate limit, oldest issue first, and defers the rest', async () => {
    const { world, fetchImpl } = createWorld();
    world.issues['JOV-1'].state = 'Merging';
    world.issues['JOV-1'].updatedAt = '2026-10-03T13:00:00Z';
    world.issues['JOV-2'] = {
      ...structuredClone(world.issues['JOV-1']),
      id: 'uuid-2',
      identifier: 'JOV-2',
      updatedAt: '2026-10-03T09:00:00Z',
    };
    const asked = [];
    const limited = intercept(fetchImpl, async (_url, body) => {
      if (!body?.query?.includes('IssueLifecycle(')) return null;
      asked.push(body.variables.issueId);
      return {
        ok: false,
        status: 400,
        json: async () => ({
          errors: [
            {
              message: 'Rate limit exceeded',
              extensions: { code: 'RATELIMITED' },
            },
          ],
        }),
      };
    });
    await expect(sweep(limited)).rejects.toThrow(
      /JOV-2: Linear rate limited \(HTTP 400\); 1 issue\(s\) deferred to the next sweep/
    );
    expect(asked).toEqual(['JOV-2']);
  });

  it('surfaces Linear HTTP and GraphQL errors, and skips unknown issues', async () => {
    for (const [response, error] of [
      [{ ok: false, status: 500, json: async () => ({}) }, /Linear HTTP 500/],
      [
        {
          ok: false,
          status: 400,
          json: async () => ({ errors: [{ message: 'Query too complex' }] }),
        },
        /Linear HTTP 400: Query too complex/,
      ],
      [
        json({ errors: [{ message: 'rate limited' }, 'x'] }),
        /rate limited; Linear request failed/,
      ],
    ]) {
      const { fetchImpl } = createWorld();
      const failing = intercept(fetchImpl, async (_url, body) =>
        body?.query?.includes('IssueLifecycle(') ? response : null
      );
      await expect(mergeEvent(failing, 101)).rejects.toThrow(error);
    }
    const { fetchImpl } = createWorld();
    expect((await mergeEvent(fetchImpl, 101, 'JOV-404')).action).toBe('skip');
  });

  it('skips without a marker or Linear key and requires GitHub credentials', async () => {
    const { fetchImpl } = createWorld();
    const run = env =>
      syncLinearIssueOnMerge({ env, fetchImpl, log: () => {} });
    expect(
      (await run({ ...BASE_ENV, PR_BODY: '', HEAD_REF: 'x' })).action
    ).toBe('skip');
    const marker = { PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->' };
    expect((await run(marker)).action).toBe('skip');
    await expect(run({ ...marker, LINEAR_API_KEY: 'k' })).rejects.toThrow(
      /GITHUB_TOKEN are required/
    );
  });

  it('loads the harness manifest and assurance matrix from the workspace; missing ones are unknown', async () => {
    const repoRoot = resolve(import.meta.dirname, '../../..');
    /** @type {[string, string[], string, string][]} */
    const cases = [
      [repoRoot, ['docs/README.md'], 'Done', ''],
      [
        repoRoot,
        ['apps/web/components/atoms/RailToggleButton.tsx'],
        'Validating',
        'screen-audit',
      ],
      [
        '/nonexistent-workspace',
        ['docs/README.md'],
        'Validating',
        'human-certification',
      ],
    ];
    for (const [workspace, files, expected, missing] of cases) {
      const { world, fetchImpl } = createWorld();
      world.pulls[101].files = files;
      await syncLinearIssueOnMerge({
        env: {
          ...BASE_ENV,
          GITHUB_WORKSPACE: workspace,
          LIFECYCLE_DRY_RUN: '',
          PR_NUMBER: '101',
          PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->',
        },
        fetchImpl,
        log: () => {},
      });
      expect(world.issues['JOV-1'].state).toBe(expected);
      if (missing) {
        expect(world.issues['JOV-1'].comments.at(-1).body).toContain(
          `Next missing receipt: ${missing}.`
        );
      }
    }
  });

  it('follows GitHub pagination and reports an incomplete scan', async () => {
    const listed = await listOpenPullRequests({
      token: 'gh_test',
      repository: REPO,
      maxPages: 1,
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => '<https://api.github.com/x?page=2>; rel="next"' },
        json: async () => [{ number: 18293, state: 'open', draft: true }],
      }),
    });
    expect(listed.complete).toBe(false);
    expect(listed.pulls[0].draft).toBe(true);
  });

  it('records an owner receipt through the CLI and refuses what it cannot record', async () => {
    const args = [
      '--issue',
      'JOV-1',
      '--kind',
      'outcome',
      '--status',
      'pass',
      '--sha',
      MAIN[2],
      '--evidence',
      'https://example.test/outcome/1',
    ];
    const respond = data => async () => json({ data });
    const env = { LINEAR_API_KEY: 'k' };
    const body = await recordValidationReceipt(args, {
      env,
      fetchImpl: respond({
        issue: { id: 'uuid-1' },
        commentCreate: { success: true },
      }),
    });
    expect(body).toContain('validation-receipt:v1');
    await expect(recordValidationReceipt(args, { env: {} })).rejects.toThrow(
      /LINEAR_API_KEY is required/
    );
    await expect(
      recordValidationReceipt(args, {
        env,
        fetchImpl: respond({ issue: null }),
      })
    ).rejects.toThrow(/Could not resolve JOV-1/);
    await expect(
      recordValidationReceipt(args, {
        env,
        fetchImpl: respond({
          issue: { id: 'uuid-1' },
          commentCreate: { success: false },
        }),
      })
    ).rejects.toThrow(/refused the validation receipt/);
    await expect(
      recordValidationReceipt(['--issue', 'JOV-1'], { env })
    ).rejects.toThrow(/kind must be/);
  });

  it('delegates every lifecycle event to the script with its dependencies', () => {
    const workflow = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/linear-sync-on-merge.yml'
      ),
      'utf8'
    );
    expect(workflow).toContain('node scripts/lib/linear-sync-on-merge.mjs');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('issueUpdate');
    for (const trigger of [
      'pull_request:',
      'workflow_run:',
      'schedule:',
      'workflow_dispatch:',
      'Production Controller',
      'actions: read',
      '.github/ci-harness/manifest.json',
    ]) {
      expect(workflow).toContain(trigger);
    }
    const modules = ['linear-sync-on-merge.mjs', 'validation-sync.mjs'].map(
      name => readFileSync(resolve(import.meta.dirname, '..', name), 'utf8')
    );
    for (const script of modules) {
      for (const match of script.matchAll(/from '\.\/([a-z0-9-]+\.mjs)'/g)) {
        expect(workflow).toContain(`scripts/lib/${match[1]}`);
      }
    }
  });
});

it('loads every transitive dependency from the workflow sparse checkout', () => {
  const repository = resolve(import.meta.dirname, '../../..');
  const workflow = readFileSync(
    join(repository, '.github/workflows/linear-sync-on-merge.yml'),
    'utf8'
  );
  const sparse = workflow.match(/sparse-checkout: \|\n((?: {12}.+\n)+)/);
  if (!sparse) throw new Error('workflow must declare its sparse checkout');
  const paths = sparse[1]
    .trim()
    .split('\n')
    .map(path => path.trim());
  const root = mkdtempSync(join(tmpdir(), 'linear-sync-checkout-'));
  try {
    for (const path of paths) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(repository, path), target);
    }
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `globalThis.fetch = () => { throw new Error('unexpected network call'); };
         const entry = await import(process.argv[1]);
         if (typeof entry.syncLinearIssueOnMerge !== 'function') process.exit(1);`,
        pathToFileURL(join(root, 'scripts/lib/linear-sync-on-merge.mjs')).href,
      ],
      { cwd: root, encoding: 'utf8', env: {}, timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('a recurring warning retains the remediation hold after a previous green observation', async () => {
  const { world, fetchImpl } = createWorld();
  const issue = world.issues['JOV-1'];
  issue.title = '[deprecation-ec4e6e5b9ffb] Resolve warning';
  issue.labels = ['remediation:deprecation-ec4e6e5b9ffb'];
  issue.comments = ['green', 'red'].map((status, index) => ({
    body: formatDeprecationObservation({
      schema: 'jovie.deprecation-observation/v1',
      issue: 'JOV-1',
      fingerprint: 'deprecation-ec4e6e5b9ffb',
      status,
      headSha: MAIN[2],
      runUrl: `https://github.com/JovieInc/Jovie/actions/runs/${123 + index}`,
      observedAt: `2026-10-07T${12 + index}:00:00Z`,
    }),
    createdAt: `2026-10-07T${12 + index}:00:00Z`,
  }));
  const result = await mergeEvent(fetchImpl, 101);
  expect(result.action).toBe('hold');
  expect(result.comment).toContain(
    'Fingerprinted remediation issues stay open'
  );
  expect(world.updates).toEqual([]);
});
