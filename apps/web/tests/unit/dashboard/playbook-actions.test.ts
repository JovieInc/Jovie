import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockHistoryRows,
  mockUpdateReturning,
  mockInsertValues,
  mockRequireReleasePlanGenerationAccess,
  mockRequireTasksWorkspaceAccess,
  mockReserveTaskNumbers,
  mockGetNextTaskPosition,
} = vi.hoisted(() => ({
  mockHistoryRows: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockInsertValues: vi.fn(),
  mockRequireReleasePlanGenerationAccess: vi.fn(),
  mockRequireTasksWorkspaceAccess: vi.fn(),
  mockReserveTaskNumbers: vi.fn(),
  mockGetNextTaskPosition: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => mockHistoryRows(),
  };
  return {
    db: {
      insert: () => ({ values: mockInsertValues }),
      select: () => chain,
      update: () => ({
        set: () => ({ where: () => ({ returning: mockUpdateReturning }) }),
      }),
    },
  };
});
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

import {
  recordPlaybookOutcome,
  startPlaybook,
} from '@/app/app/(shell)/dashboard/tasks/playbook-actions';
import { PLAYBOOK_TEMPLATES } from '@/lib/tasks/playbooks/registry';
import type { PlaybookId } from '@/lib/tasks/playbooks/types';

describe('startPlaybook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveTaskNumbers.mockResolvedValue(40);
    mockGetNextTaskPosition.mockResolvedValue(12);
    mockInsertValues.mockResolvedValue(undefined);
    mockHistoryRows.mockResolvedValue([]);
    mockUpdateReturning.mockResolvedValue([{ id: 'project-1' }]);
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
      new Error('Release plans require a Pro plan.')
    );

    await expect(
      startPlaybook({
        playbookId: 'book-launch',
        projectName: 'Book',
        targetDate: '2027-01-15',
      })
    ).rejects.toThrow('Pro plan');
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
    [{ autonomy: 'yolo' as never }, 'Unknown autonomy level'],
    [
      { launchDecision: 'coordinated_launch' as const },
      'Only feature launches',
    ],
    [{ intakeAnswers: ['x'.repeat(2001)] }, 'Intake answers are too long'],
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

describe('startPlaybook iteration and autonomy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReserveTaskNumbers.mockResolvedValue(1);
    mockGetNextTaskPosition.mockResolvedValue(0);
    mockInsertValues.mockResolvedValue(undefined);
    mockUpdateReturning.mockResolvedValue([{ id: 'project-1' }]);
  });

  it('defaults to review and plans from the previous run', async () => {
    mockHistoryRows.mockResolvedValue([
      {
        metadata: {
          playbook: {
            outcome: {
              reach: 2000,
              engagement: 100,
              newFollowers: 40,
              byChannel: {},
              whatWorked: [],
              recordedAt: '2026-09-01T00:00:00.000Z',
            },
          },
        },
      },
      { metadata: { playbook: {} } },
    ]);

    await startPlaybook({
      playbookId: 'song-weekly-drops',
      projectName: 'Night Drive',
      targetDate: '2027-01-15',
      intakeAnswers: ['A song about leaving home'],
    });

    const [rows] = mockInsertValues.mock.calls[0] as [
      Array<{ metadata: { playbook: Record<string, unknown> } }>,
    ];
    expect(rows[0]?.metadata.playbook).toMatchObject({
      role: 'project',
      autonomy: 'review',
      runNumber: 2,
      audienceTarget: 2500,
      intakeAnswers: ['A song about leaving home'],
    });
  });

  it('sizes a feature kit from the launch decision', async () => {
    mockHistoryRows.mockResolvedValue([]);

    const result = await startPlaybook({
      playbookId: 'startup-feature-kit',
      projectName: 'Funnel judge',
      targetDate: '2027-01-15',
      launchDecision: 'changelog_notice',
    });

    expect(result.stepCount).toBe(4);
    expect(mockReserveTaskNumbers).toHaveBeenCalledWith('profile-1', 5);
  });

  it('refuses to start a kit when nothing should launch', async () => {
    mockHistoryRows.mockResolvedValue([]);

    await expect(
      startPlaybook({
        playbookId: 'startup-feature-kit',
        projectName: 'Refactor',
        targetDate: '2027-01-15',
        launchDecision: 'no_action',
      })
    ).rejects.toThrow('This change needs no launch');
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

describe('recordPlaybookOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReturning.mockResolvedValue([{ id: 'project-1' }]);
  });

  const outcome = {
    reach: 1200,
    engagement: 80,
    newFollowers: 15,
    byChannel: { email: { reach: 300, engagement: 40 } },
    whatWorked: ['The acoustic cut'],
  };

  it('stores a valid outcome on the owned project task', async () => {
    await expect(
      recordPlaybookOutcome('project-1', outcome)
    ).resolves.toBeUndefined();
    expect(mockUpdateReturning).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...outcome, reach: -1 },
    { ...outcome, engagement: 1.5 },
    { ...outcome, byChannel: { email: { reach: 'lots', engagement: 1 } } },
  ])('rejects invalid numbers %#', async bad => {
    await expect(
      recordPlaybookOutcome('project-1', bad as typeof outcome)
    ).rejects.toThrow('Invalid playbook outcome');
    expect(mockUpdateReturning).not.toHaveBeenCalled();
  });

  it("fails closed when the run is not the caller's", async () => {
    mockUpdateReturning.mockResolvedValue([]);
    await expect(recordPlaybookOutcome('other', outcome)).rejects.toThrow(
      'Playbook run not found'
    );
  });
});
