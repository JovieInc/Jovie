import { describe, expect, it } from 'vitest';
import {
  type LinearIssueRow,
  linearIssueToTaskView,
  linearPriorityToTaskPriority,
  linearStateToTaskStatus,
  sortLinearIssuesByStatus,
} from '@/lib/ovie/linear-issue-task-view';

const issue = (
  id: string,
  type: string | null,
  extra: Partial<LinearIssueRow> = {}
): LinearIssueRow => ({
  id,
  identifier: `JOV-${id}`,
  title: `Issue ${id}`,
  url: `https://linear.app/jovie/issue/JOV-${id}`,
  priority: 3,
  state: { name: 'State', type },
  assignee: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  ...extra,
});

describe('linear issue to task view', () => {
  it.each([
    ['triage', 'backlog'],
    ['backlog', 'backlog'],
    ['unstarted', 'todo'],
    ['started', 'in_progress'],
    ['completed', 'done'],
    ['canceled', 'cancelled'],
    ['duplicate', 'cancelled'],
    [null, 'backlog'],
  ])('maps state type %s to %s', (type, status) => {
    expect(linearStateToTaskStatus(type)).toBe(status);
  });

  it.each([
    [0, 'none'],
    [1, 'urgent'],
    [2, 'high'],
    [3, 'medium'],
    [4, 'low'],
    [null, 'none'],
  ])('maps priority %s to %s', (priority, expected) => {
    expect(linearPriorityToTaskPriority(priority)).toBe(expected);
  });

  it('builds a human, idle row with state name as category', () => {
    const view = linearIssueToTaskView(
      issue('42', 'started', {
        priority: 1,
        state: { name: 'In Progress', type: 'started' },
      })
    );
    expect(view).toMatchObject({
      taskNumber: 42,
      status: 'in_progress',
      priority: 'urgent',
      assigneeKind: 'human',
      agentStatus: 'idle',
      category: 'In Progress',
    });
    expect(view.metadata).toMatchObject({
      linearUrl: 'https://linear.app/jovie/issue/JOV-42',
    });
  });

  it('sorts in progress, todo, backlog, then done, keeping order within a status', () => {
    const sorted = sortLinearIssuesByStatus([
      issue('1', 'backlog'),
      issue('2', 'completed'),
      issue('3', 'started'),
      issue('4', 'unstarted'),
      issue('5', 'started'),
    ]);
    expect(sorted.map(i => i.id)).toEqual(['3', '5', '4', '1', '2']);
  });
});
