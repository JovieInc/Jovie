import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runAdd } from '../commands/add.mjs';
import {
  buildAgentBriefFromIssue,
  runAgentBrief,
} from '../commands/agent-brief.mjs';
import { runApproved } from '../commands/approved.mjs';
import { runExpand } from '../commands/expand.mjs';
import { buildBacklogSnapshot, runSync } from '../commands/sync.mjs';
import { runToday } from '../commands/today.mjs';
import { runRoadmap } from '../roadmap.mjs';

function makeMockClient(overrides = {}) {
  const created = [];
  return {
    created,
    fetchInitiative: async () =>
      overrides.initiative ?? {
        id: 'init-1',
        name: 'AgentOS',
        url: 'https://linear.app/jovie/initiative/agentos',
        projects: {
          nodes: [
            {
              id: 'proj-1',
              name: 'Roadmap System',
              url: 'https://linear.app/jovie/project/roadmap',
              status: { name: 'started' },
            },
          ],
        },
      },
    fetchAgentOsIssues: async () =>
      overrides.issues ?? [
        {
          id: 'uuid-1930',
          identifier: 'JOV-1930',
          title: 'Define sync model',
          description: 'See agentos/roadmap/SYNC_MODEL.md',
          url: 'https://linear.app/jovie/issue/JOV-1930',
          priority: 2,
          assignee: { id: 'u1', name: 'Tim' },
          labels: { nodes: [{ name: 'agentos' }] },
          parent: null,
          project: { id: 'proj-1', name: 'Roadmap System' },
          state: { name: 'In Progress', type: 'started' },
          relations: { nodes: [] },
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T01:00:00.000Z',
        },
        {
          id: 'uuid-1932',
          identifier: 'JOV-1932',
          title: 'Build roadmap parser',
          description: '## Acceptance criteria\n- [ ] CLI\n- [ ] Tests',
          url: 'https://linear.app/jovie/issue/JOV-1932',
          priority: 2,
          assignee: null,
          labels: {
            nodes: [{ name: 'agentos' }, { name: 'human-review-required' }],
          },
          parent: null,
          project: { id: 'proj-1' },
          state: { name: 'Todo', type: 'unstarted' },
          relations: { nodes: [] },
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T01:00:00.000Z',
        },
        {
          id: 'uuid-1933',
          identifier: 'JOV-1933',
          title: 'Brief generator',
          description: '',
          url: 'https://linear.app/jovie/issue/JOV-1933',
          priority: 3,
          assignee: null,
          labels: { nodes: [{ name: 'agentos' }] },
          parent: null,
          project: { id: 'proj-1' },
          state: { name: 'Todo', type: 'unstarted' },
          relations: { nodes: [] },
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T01:00:00.000Z',
        },
      ],
    fetchIssueByIdentifier: async id => {
      if (overrides.fetchIssueByIdentifier) {
        return overrides.fetchIssueByIdentifier(id);
      }
      const issues = await makeMockClient(overrides).fetchAgentOsIssues();
      const want = String(id).toUpperCase().replace(/^JOV-/, 'JOV-');
      return (
        issues.find(
          i =>
            i.identifier.toUpperCase() === want.toUpperCase() ||
            i.identifier === `JOV-${String(id).replace(/^JOV-/i, '')}`
        ) ?? null
      );
    },
    resolveProjectId: async ref =>
      overrides.resolveProjectId
        ? overrides.resolveProjectId(ref)
        : ref
          ? 'proj-1'
          : null,
    createIssue: async input => {
      const issue = {
        id: `uuid-new-${created.length + 1}`,
        identifier: `JOV-${9000 + created.length}`,
        title: input.title,
        url: `https://linear.app/jovie/issue/JOV-${9000 + created.length}`,
      };
      created.push({ input, issue });
      return issue;
    },
  };
}

const sampleBacklog = {
  syncedAt: '2026-05-08T12:00:00.000Z',
  sourceRevision: null,
  initiative: {
    id: 'init-1',
    name: 'AgentOS',
    url: 'https://linear.app/jovie/initiative/agentos',
  },
  projects: [
    {
      id: 'proj-1',
      name: 'Roadmap System',
      slug: 'roadmap-system',
      status: 'started',
      url: 'https://linear.app/jovie/project/roadmap',
      specPath: 'agentos/roadmap/roadmap-system.md',
    },
  ],
  issues: [
    {
      id: 'JOV-1930',
      uuid: 'uuid-1930',
      title: 'Define sync model',
      url: 'https://linear.app/jovie/issue/JOV-1930',
      state: { name: 'In Progress', type: 'started' },
      priority: 2,
      assignee: { id: 'u1', name: 'Tim' },
      delegate: null,
      labels: ['agentos'],
      projectId: 'proj-1',
      parentId: null,
      blockedBy: [],
      blocks: ['JOV-1932'],
      agentOwned: true,
      humanReviewRequired: false,
      repoFileRefs: ['agentos/roadmap/SYNC_MODEL.md'],
      pullRequestUrl: null,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T01:00:00.000Z',
      lastSyncedAt: '2026-05-08T12:00:00.000Z',
    },
    {
      id: 'JOV-1932',
      uuid: 'uuid-1932',
      title: 'Build roadmap parser',
      url: 'https://linear.app/jovie/issue/JOV-1932',
      state: { name: 'Todo', type: 'unstarted' },
      priority: 2,
      assignee: null,
      delegate: null,
      labels: ['agentos', 'human-review-required'],
      projectId: 'proj-1',
      parentId: null,
      blockedBy: ['JOV-1930'],
      blocks: [],
      agentOwned: false,
      humanReviewRequired: true,
      repoFileRefs: [],
      pullRequestUrl: null,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T01:00:00.000Z',
      lastSyncedAt: '2026-05-08T12:00:00.000Z',
    },
    {
      id: 'JOV-1933',
      uuid: 'uuid-1933',
      title: 'Brief generator',
      url: 'https://linear.app/jovie/issue/JOV-1933',
      state: { name: 'Todo', type: 'unstarted' },
      priority: 3,
      assignee: null,
      delegate: null,
      labels: ['agentos'],
      projectId: 'proj-1',
      parentId: null,
      blockedBy: [],
      blocks: [],
      agentOwned: true,
      humanReviewRequired: false,
      repoFileRefs: [],
      pullRequestUrl: null,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T01:00:00.000Z',
      lastSyncedAt: '2026-05-08T12:00:00.000Z',
    },
  ],
};

describe('runAdd', () => {
  it('dry-runs without calling createIssue', async () => {
    const client = makeMockClient();
    const result = await runAdd({
      client,
      positionals: ['Ship', 'roadmap', 'parser'],
      flags: { 'dry-run': true, description: 'body', priority: '1' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.planned.title, 'Ship roadmap parser');
    assert.equal(client.created.length, 0);
  });

  it('creates an issue with agentos label path', async () => {
    const client = makeMockClient();
    const result = await runAdd({
      client,
      positionals: ['New issue'],
      flags: { description: 'hi' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.issue.id, 'JOV-9000');
    assert.equal(client.created.length, 1);
    assert.equal(client.created[0].input.title, 'New issue');
  });

  it('errors without a title', async () => {
    const result = await runAdd({
      client: makeMockClient(),
      positionals: [],
      flags: {},
    });
    assert.equal(result.ok, false);
  });
});

describe('runExpand', () => {
  it('parses epic bullets and dry-runs sub-issues', async () => {
    const client = makeMockClient({
      fetchIssueByIdentifier: async () => ({
        id: 'uuid-epic',
        identifier: 'JOV-1000',
        title: 'Epic',
        description: '## Sub-issues\n- [ ] First child\n- [ ] Second child',
        url: 'https://linear.app/jovie/issue/JOV-1000',
        project: { id: 'proj-1' },
      }),
    });
    const result = await runExpand({
      client,
      positionals: ['JOV-1000'],
      flags: { 'dry-run': true },
    });
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.planned.map(p => p.title),
      ['First child', 'Second child']
    );
    assert.equal(client.created.length, 0);
  });

  it('creates sub-issues when not dry-run', async () => {
    const client = makeMockClient({
      fetchIssueByIdentifier: async () => ({
        id: 'uuid-epic',
        identifier: 'JOV-1000',
        title: 'Epic',
        description: '## Acceptance criteria\n- [ ] Only one',
        url: 'https://linear.app/jovie/issue/JOV-1000',
        project: { id: 'proj-1' },
      }),
    });
    const result = await runExpand({
      client,
      positionals: ['JOV-1000'],
      flags: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.created.length, 1);
    assert.equal(client.created[0].input.parentId, 'uuid-epic');
  });

  it('reads titles from --from file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roadmap-expand-'));
    const file = join(dir, 'titles.txt');
    await writeFile(file, 'Alpha\nBeta\n', 'utf8');
    const client = makeMockClient({
      fetchIssueByIdentifier: async () => ({
        id: 'uuid-epic',
        identifier: 'JOV-1000',
        title: 'Epic',
        description: '',
        url: 'https://linear.app/jovie/issue/JOV-1000',
        project: { id: 'proj-1' },
      }),
    });
    const result = await runExpand({
      client,
      positionals: ['JOV-1000'],
      flags: { from: file, 'dry-run': true },
      cwd: dir,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.planned.map(p => p.title),
      ['Alpha', 'Beta']
    );
  });
});

describe('runSync', () => {
  it('builds a backlog snapshot from Linear nodes', () => {
    const snap = buildBacklogSnapshot({
      initiative: {
        id: 'init-1',
        name: 'AgentOS',
        url: 'https://example',
        projects: {
          nodes: [
            {
              id: 'p1',
              name: 'Roadmap System',
              url: 'https://p',
              status: { name: 'started' },
            },
          ],
        },
      },
      issues: [
        {
          id: 'u1',
          identifier: 'JOV-1',
          title: 'T',
          url: 'https://i',
          priority: 0,
          labels: { nodes: [{ name: 'agentos' }] },
          state: { name: 'Todo', type: 'unstarted' },
          relations: { nodes: [] },
        },
      ],
      syncedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(snap.issues.length, 1);
    assert.equal(snap.projects[0].slug, 'roadmap-system');
    assert.equal(snap.syncedAt, '2026-01-01T00:00:00.000Z');
  });

  it('writes backlog.json and supports --check drift', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roadmap-sync-'));
    const out = join(dir, 'backlog.json');
    const client = makeMockClient();

    const wrote = await runSync({
      client,
      flags: { force: true, out },
      cwd: dir,
      now: () => '2026-05-08T12:00:00.000Z',
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.mode, 'wrote');
    const onDisk = JSON.parse(await readFile(out, 'utf8'));
    assert.ok(onDisk.issues.length >= 1);

    const checkClean = await runSync({
      client,
      flags: { check: true, out },
      cwd: dir,
      now: () => '2026-05-08T12:00:00.000Z',
    });
    assert.equal(checkClean.ok, true);
    assert.equal(checkClean.drifted, false);

    // Mutate disk to force drift
    onDisk.issues[0].state = { name: 'Done', type: 'completed' };
    await writeFile(out, JSON.stringify(onDisk), 'utf8');
    const checkDrift = await runSync({
      client,
      flags: { check: true, out },
      cwd: dir,
      now: () => '2026-05-08T12:00:00.000Z',
    });
    assert.equal(checkDrift.ok, false);
    assert.equal(checkDrift.drifted, true);
  });
});

describe('runToday', () => {
  it('lists active non-gated issues from backlog', async () => {
    const result = await runToday({ backlog: sampleBacklog, flags: {} });
    assert.equal(result.ok, true);
    const ids = result.issues.map(i => i.id);
    assert.ok(ids.includes('JOV-1930'));
    assert.ok(ids.includes('JOV-1933'));
    assert.ok(!ids.includes('JOV-1932')); // human-review-required
  });

  it('emits briefs when --json', async () => {
    const result = await runToday({
      backlog: sampleBacklog,
      flags: { json: true },
    });
    assert.equal(result.ok, true);
    assert.ok(result.briefs.length >= 1);
    assert.equal(result.briefs[0].schemaVersion, 1);
  });
});

describe('runApproved', () => {
  it('returns only agent-owned cleared issues', async () => {
    const result = await runApproved({ backlog: sampleBacklog, flags: {} });
    assert.equal(result.ok, true);
    const ids = result.issues.map(i => i.id);
    assert.deepEqual(ids.sort(), ['JOV-1930', 'JOV-1933']);
  });
});

describe('runAgentBrief / buildAgentBriefFromIssue', () => {
  it('builds a structured brief with forbidden actions', () => {
    const brief = buildAgentBriefFromIssue({
      issue: sampleBacklog.issues[0],
      backlog: sampleBacklog,
      description: '## Acceptance criteria\n- [ ] Spec lands\n',
      generatedAt: '2026-05-08T12:00:00.000Z',
    });
    assert.equal(brief.schemaVersion, 1);
    assert.equal(brief.currentIssue.id, 'JOV-1930');
    assert.ok(brief.forbiddenActions.includes('change_billing'));
    assert.deepEqual(brief.successCriteria, ['Spec lands']);
    assert.equal(brief.humanApprovalRequired, false);
    assert.ok(brief.dependencies.blocks.some(b => b.id === 'JOV-1932'));
  });

  it('clears forbidden minimums when human review required', () => {
    const brief = buildAgentBriefFromIssue({
      issue: sampleBacklog.issues[1],
      backlog: sampleBacklog,
      description: '',
    });
    assert.equal(brief.humanApprovalRequired, true);
    assert.deepEqual(brief.forbiddenActions, []);
  });

  it('loads from backlog offline without client', async () => {
    const result = await runAgentBrief({
      positionals: ['JOV-1930'],
      backlog: sampleBacklog,
      flags: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.brief.currentIssue.id, 'JOV-1930');
  });

  it('prefers live Linear description when client present', async () => {
    const client = makeMockClient({
      fetchIssueByIdentifier: async () => ({
        id: 'uuid-1930',
        identifier: 'JOV-1930',
        title: 'Define sync model',
        description: '## Acceptance criteria\n- [ ] Live criterion\n',
        url: 'https://linear.app/jovie/issue/JOV-1930',
        priority: 2,
        labels: { nodes: [{ name: 'agentos' }] },
        state: { name: 'In Progress', type: 'started' },
        project: { id: 'proj-1', name: 'Roadmap System' },
        relations: { nodes: [] },
      }),
    });
    const result = await runAgentBrief({
      client,
      positionals: ['JOV-1930'],
      backlog: sampleBacklog,
      flags: {},
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.brief.successCriteria, ['Live criterion']);
  });
});

describe('runRoadmap CLI wiring', () => {
  it('help exits 0', async () => {
    const lines = [];
    const { exitCode } = await runRoadmap(['--help'], {
      stdout: s => lines.push(s),
      stderr: () => {},
    });
    assert.equal(exitCode, 0);
    assert.ok(lines.join('\n').includes('agent-brief'));
  });

  it('unknown command exits 2', async () => {
    const { exitCode } = await runRoadmap(['wat'], {
      stdout: () => {},
      stderr: () => {},
    });
    assert.equal(exitCode, 2);
  });

  it('today works offline via injected backlog path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'roadmap-cli-'));
    const path = join(dir, 'backlog.json');
    await writeFile(path, JSON.stringify(sampleBacklog), 'utf8');
    const out = [];
    const { exitCode, result } = await runRoadmap(
      ['today', '--backlog', path, '--json'],
      {
        cwd: dir,
        client: makeMockClient(),
        stdout: s => out.push(s),
        stderr: () => {},
      }
    );
    assert.equal(exitCode, 0);
    assert.equal(result.ok, true);
  });
});
