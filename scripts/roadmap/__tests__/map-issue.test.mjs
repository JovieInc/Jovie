import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeAgentOwned,
  detectBacklogDrift,
  extractRepoFileRefs,
  mapLinearIssueToRoadmap,
  parseSubIssueTitles,
  selectApprovedIssues,
  selectTodayIssues,
  toSlug,
} from '../map-issue.mjs';

describe('map-issue pure helpers', () => {
  it('toSlug kebab-cases names', () => {
    assert.equal(toSlug('Roadmap System'), 'roadmap-system');
  });

  it('extractRepoFileRefs finds paths', () => {
    const refs = extractRepoFileRefs(
      'See `agentos/roadmap/SYNC_MODEL.md` and apps/web/lib/agent-os/artifact.ts'
    );
    assert.ok(refs.includes('agentos/roadmap/SYNC_MODEL.md'));
    assert.ok(refs.includes('apps/web/lib/agent-os/artifact.ts'));
  });

  it('computeAgentOwned requires agentos and no human-review', () => {
    assert.equal(
      computeAgentOwned({ labels: ['agentos'], delegate: null }),
      true
    );
    assert.equal(
      computeAgentOwned({
        labels: ['agentos', 'human-review-required'],
        delegate: { id: '1', name: 'AgentOS' },
      }),
      false
    );
    assert.equal(computeAgentOwned({ labels: [], delegate: null }), false);
  });

  it('mapLinearIssueToRoadmap maps fields', () => {
    const mapped = mapLinearIssueToRoadmap(
      {
        id: 'uuid-1',
        identifier: 'JOV-1930',
        title: 'Define sync model',
        url: 'https://linear.app/jovie/issue/JOV-1930',
        description: 'Touch agentos/roadmap/SYNC_MODEL.md',
        priority: 2,
        assignee: { id: 'u1', name: 'Tim' },
        labels: { nodes: [{ name: 'agentos' }, { name: 'type:doc' }] },
        parent: null,
        project: { id: 'p1' },
        state: { name: 'In Progress', type: 'started' },
        relations: {
          nodes: [
            {
              type: 'blocks',
              relatedIssue: { identifier: 'JOV-1932', title: 'parser' },
            },
          ],
        },
        createdAt: '2026-05-08T00:00:00.000Z',
        updatedAt: '2026-05-08T01:00:00.000Z',
      },
      '2026-05-08T02:00:00.000Z'
    );
    assert.equal(mapped.id, 'JOV-1930');
    assert.equal(mapped.uuid, 'uuid-1');
    assert.equal(mapped.agentOwned, true);
    assert.equal(mapped.humanReviewRequired, false);
    assert.deepEqual(mapped.blocks, ['JOV-1932']);
    assert.ok(mapped.repoFileRefs.includes('agentos/roadmap/SYNC_MODEL.md'));
    assert.equal(mapped.priority, 2);
  });

  it('parseSubIssueTitles reads acceptance criteria bullets', () => {
    const text = `
## Summary
Epic for roadmap.

## Acceptance criteria
- [ ] Build parser
- [ ] Add tests
1. Document skill

## Other
- ignore this after heading switch
`;
    const titles = parseSubIssueTitles(text);
    assert.deepEqual(titles, ['Build parser', 'Add tests', 'Document skill']);
  });

  it('selectTodayIssues filters human-review and sorts by priority', () => {
    const issues = [
      {
        id: 'JOV-2',
        title: 'Low',
        priority: 4,
        humanReviewRequired: false,
        state: { name: 'Todo' },
      },
      {
        id: 'JOV-1',
        title: 'Urgent',
        priority: 1,
        humanReviewRequired: false,
        state: { name: 'In Progress' },
      },
      {
        id: 'JOV-3',
        title: 'Blocked',
        priority: 1,
        humanReviewRequired: true,
        state: { name: 'Todo' },
      },
      {
        id: 'JOV-4',
        title: 'Done',
        priority: 1,
        humanReviewRequired: false,
        state: { name: 'Done' },
      },
    ];
    const today = selectTodayIssues(issues, { limit: 10 });
    assert.deepEqual(
      today.map(i => i.id),
      ['JOV-1', 'JOV-2']
    );
  });

  it('selectApprovedIssues requires agentOwned and cleared gate', () => {
    const issues = [
      {
        id: 'A',
        priority: 2,
        agentOwned: true,
        humanReviewRequired: false,
        title: 'ok',
      },
      {
        id: 'B',
        priority: 1,
        agentOwned: true,
        humanReviewRequired: true,
        title: 'gate',
      },
      {
        id: 'C',
        priority: 1,
        agentOwned: false,
        humanReviewRequired: false,
        title: 'human',
      },
    ];
    const approved = selectApprovedIssues(issues);
    assert.deepEqual(
      approved.map(i => i.id),
      ['A']
    );
  });

  it('detectBacklogDrift reports tracked field changes', () => {
    const disk = {
      issues: [
        {
          id: 'JOV-1',
          state: { name: 'Todo' },
          priority: 2,
          assignee: null,
          delegate: null,
          labels: ['agentos'],
          projectId: null,
          parentId: null,
          blockedBy: [],
          blocks: [],
        },
      ],
    };
    const next = {
      issues: [
        {
          id: 'JOV-1',
          state: { name: 'In Progress' },
          priority: 2,
          assignee: null,
          delegate: null,
          labels: ['agentos'],
          projectId: null,
          parentId: null,
          blockedBy: [],
          blocks: [],
        },
      ],
    };
    const drift = detectBacklogDrift(disk, next);
    assert.equal(drift.drifted, true);
    assert.ok(drift.details.some(d => d.includes('JOV-1.state')));
  });
});
