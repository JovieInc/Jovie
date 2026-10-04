import { describe, expect, it } from 'vitest';
import { buildPlaybookProjectRow, buildPlaybookStepRows } from './instantiate';
import { PLAYBOOK_TEMPLATES } from './registry';

const NOW = new Date('2026-10-01T00:00:00.000Z');

describe('buildPlaybookStepRows', () => {
  it('schedules each step from the target date and links the parent', () => {
    const template = PLAYBOOK_TEMPLATES['podcast-episode'];
    const rows = buildPlaybookStepRows({
      template,
      creatorProfileId: 'profile-1',
      targetDate: new Date('2026-11-01T00:00:00.000Z'),
      firstTaskNumber: 10,
      startPosition: 5,
      parentTaskId: 'parent-1',
      now: NOW,
    });

    expect(rows).toHaveLength(template.steps.length);
    expect(rows[0]).toMatchObject({
      taskNumber: 10,
      position: 5,
      parentTaskId: 'parent-1',
      releaseId: null,
      assigneeKind: 'human',
      agentType: null,
      category: 'Guest Prep',
    });
    expect(rows[0]?.dueAt?.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(rows.at(-1)?.taskNumber).toBe(10 + template.steps.length - 1);
    expect(rows[0]?.metadata).toMatchObject({
      dueDaysOffset: -28,
      playbook: {
        id: 'podcast-episode',
        version: 1,
        role: 'step',
        stepId: 'book-guest',
        owner: 'creator',
      },
    });
  });

  it('keeps the release plan metadata shape that re-anchoring relies on', () => {
    const rows = buildPlaybookStepRows({
      template: PLAYBOOK_TEMPLATES['music-release'],
      creatorProfileId: 'profile-1',
      targetDate: null,
      firstTaskNumber: 1,
      startPosition: 0,
      releaseId: 'release-1',
    });
    const smartLink = rows.find(row => row.agentType === 'smart-link-create');

    expect(smartLink).toMatchObject({
      assigneeKind: 'jovie',
      releaseId: 'release-1',
      dueAt: null,
    });
    expect(smartLink?.metadata).toMatchObject({
      dueDaysOffset: -1,
      videoUrl: null,
      playbook: { id: 'music-release', role: 'step', owner: 'jovie' },
    });
    expect(rows.some(row => 'descriptionHelper' in row.metadata)).toBe(true);
  });
});

describe('buildPlaybookProjectRow', () => {
  it('creates a parent task due on the target date', () => {
    const targetDate = new Date('2027-03-01T00:00:00.000Z');
    const row = buildPlaybookProjectRow({
      template: PLAYBOOK_TEMPLATES['book-launch'],
      creatorProfileId: 'profile-1',
      projectName: 'The Quiet Launch',
      targetDate,
      taskNumber: 7,
      position: 3,
    });

    expect(row).toMatchObject({
      title: 'The Quiet Launch',
      category: 'Book Launch',
      dueAt: targetDate,
      parentTaskId: null,
      metadata: {
        playbook: {
          id: 'book-launch',
          role: 'project',
          targetDate: '2027-03-01T00:00:00.000Z',
        },
      },
    });
  });
});
