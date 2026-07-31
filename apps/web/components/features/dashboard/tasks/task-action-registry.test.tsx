import { describe, expect, it, vi } from 'vitest';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { TaskView } from '@/lib/tasks/types';
import { buildTaskActionMenuItems } from './task-action-registry';

const task = {
  id: 'task-1',
  taskNumber: 24,
  title: 'Pitch the release',
  status: 'todo',
  priority: 'high',
  assigneeKind: 'human',
  releaseId: 'release-1',
  releaseTitle: 'Midnight Radio',
} as TaskView;

function itemIds(items: readonly ContextMenuItemType[]): string[] {
  return items.flatMap(item => ('id' in item ? [item.id] : []));
}

function renderActions(surface: 'context' | 'overflow' | 'detail') {
  return buildTaskActionMenuItems({
    task,
    surface,
    canGeneratePitch: true,
    handlers: {
      onOpenTask: vi.fn(),
      onOpenRelease: vi.fn(),
      onGeneratePitch: vi.fn(),
      onRequestDelete: vi.fn(),
      onUpdateStatus: vi.fn(),
      onUpdatePriority: vi.fn(),
      onUpdateAssignee: vi.fn(),
    },
    visuals: {
      openTask: 'open-task',
      openRelease: 'open-release',
      generatePitch: 'generate-pitch',
      deleteTask: 'delete-task',
      status: status => status,
      priority: priority => priority,
      assignee: assignee => assignee,
    },
  });
}

describe('buildTaskActionMenuItems', () => {
  it('keeps Open Task exclusive to the context menu while preserving core mutations in overflow', () => {
    expect(itemIds(renderActions('context'))).toEqual(
      expect.arrayContaining([
        'open-task',
        'change-status',
        'change-priority',
        'change-assignee',
        'open-release',
        'generate-pitch',
        'delete-task',
      ])
    );
    expect(itemIds(renderActions('overflow'))).not.toContain('open-task');
    expect(itemIds(renderActions('overflow'))).toEqual(
      expect.arrayContaining([
        'change-status',
        'change-priority',
        'change-assignee',
        'open-release',
        'generate-pitch',
        'delete-task',
      ])
    );
  });

  it('removes redundant property and release actions from task detail while retaining eligible generation and delete', () => {
    expect(itemIds(renderActions('detail'))).toEqual([
      'generate-pitch',
      'delete-task',
    ]);
  });
});
