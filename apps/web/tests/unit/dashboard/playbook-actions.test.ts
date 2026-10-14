import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockInsertValues,
  mockRequireReleasePlanGenerationAccess,
  mockRequireTasksWorkspaceAccess,
  mockReserveTaskNumbers,
  mockGetNextTaskPosition,
} = vi.hoisted(() => ({
  mockInsertValues: vi.fn(),
  mockRequireReleasePlanGenerationAccess: vi.fn(),
  mockRequireTasksWorkspaceAccess: vi.fn(),
  mockReserveTaskNumbers: vi.fn(),
  mockGetNextTaskPosition: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: mockInsertValues }) },
}));
vi.mock('@/lib/db/schema/tasks', () => ({ tasks: {} }));
vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireReleasePlanGenerationAccess: mockRequireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess: mockRequireTasksWorkspaceAccess,
}));
vi.mock('@/lib/tasks/task-reservation', () => ({
  reserveTaskNumbers: mockReserveTaskNumbers,
  getNextTaskPosition: mockGetNextTaskPosition,
}));
vi.mock('@/app/app/(shell)/dashboard/requireProfileId', () => ({
  requireProfileId: vi.fn().mockResolvedValue('profile-1'),
}));

import { startPlaybook } from '@/app/app/(shell)/dashboard/tasks/playbook-actions';
import { PLAYBOOK_TEMPLATES } from '@/lib/tasks/playbooks/registry';
import type { PlaybookId } from '@/lib/tasks/playbooks/types';

describe('startPlaybook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveTaskNumbers.mockResolvedValue(40);
    mockGetNextTaskPosition.mockResolvedValue(12);
    mockInsertValues.mockResolvedValue(undefined);
  });

  it('inserts the project and every step in one statement', async () => {
    const template = PLAYBOOK_TEMPLATES['youtube-video'];
    const result = await startPlaybook({
      playbookId: 'youtube-video',
      projectName: '  Studio tour  ',
      targetDate: '2027-01-15',
    });

    expect(mockReserveTaskNumbers).toHaveBeenCalledWith(
      'profile-1',
      template.steps.length + 1
    );
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const [rows] = mockInsertValues.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(template.steps.length + 1);
    const [project, ...steps] = rows;
    expect(project).toMatchObject({
      id: result.projectTaskId,
      title: 'Studio tour',
      taskNumber: 40,
      position: 12,
      category: 'YouTube Video',
    });
    expect(
      steps.every(step => step.parentTaskId === result.projectTaskId)
    ).toBe(true);
    expect(steps[0]).toMatchObject({ taskNumber: 41, position: 13 });
    expect(result.stepCount).toBe(template.steps.length);
  });

  it('enforces both Tasks entitlements before writing', async () => {
    mockRequireReleasePlanGenerationAccess.mockRejectedValueOnce(
      new Error('Release plans require the Artist Presence plan.')
    );

    await expect(
      startPlaybook({
        playbookId: 'book-launch',
        projectName: 'Book',
        targetDate: '2027-01-15',
      })
    ).rejects.toThrow('Artist Presence plan');
    expect(mockRequireTasksWorkspaceAccess).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it.each([
    [{ playbookId: 'nope' as PlaybookId }, 'Unknown playbook'],
    [{ projectName: '   ' }, 'Project name is required'],
    [{ projectName: 'x'.repeat(201) }, 'Project name is required'],
    [{ targetDate: 'not a date' }, 'Target date is required'],
    [
      { playbookId: 'music-release' as PlaybookId },
      'This playbook starts from a release',
    ],
  ])('rejects invalid input %#', async (override, message) => {
    await expect(
      startPlaybook({
        playbookId: 'podcast-episode',
        projectName: 'Episode 12',
        targetDate: '2027-01-15',
        ...override,
      })
    ).rejects.toThrow(message);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});
