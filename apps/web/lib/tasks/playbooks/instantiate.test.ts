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
      autonomy: 'review',
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
        autonomy: 'hands_on',
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
      autonomy: 'autopilot',
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
      playbook: {
        id: 'music-release',
        role: 'step',
        owner: 'jovie',
        autonomy: 'autopilot',
        channel: 'platform',
      },
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
      autonomy: 'review',
      intakeAnswers: ['A book about quiet launches'],
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
          autonomy: 'review',
          runNumber: 1,
          targetDate: '2027-03-01T00:00:00.000Z',
          intakeAnswers: ['A book about quiet launches'],
        },
      },
    });
  });
});

describe('autonomy and adaptation', () => {
  const template = PLAYBOOK_TEMPLATES['music-release'];
  const base = {
    template,
    creatorProfileId: 'profile-1',
    targetDate: null,
    firstTaskNumber: 1,
    startPosition: 0,
  } as const;

  it('hands agent steps back to the user on hands-on runs', () => {
    const rows = buildPlaybookStepRows({ ...base, autonomy: 'hands_on' });
    expect(rows.every(row => row.assigneeKind === 'human')).toBe(true);
    // The assist hook stays so the user can still ask Jovie to help.
    expect(rows.some(row => row.agentType === 'smart-link-create')).toBe(true);
  });

  it('applies adapted priorities and step subsets', () => {
    const rows = buildPlaybookStepRows({
      ...base,
      template: PLAYBOOK_TEMPLATES['startup-feature-kit'],
      autonomy: 'review',
      stepIds: ['changelog', 'record-results'],
      plan: {
        runNumber: 2,
        audienceTarget: 500,
        stepPriority: { changelog: 'low' },
        rationale: [],
      },
    });
    expect(rows.map(row => row.title)).toEqual([
      'Publish the changelog entry',
      'Record what this run reached',
    ]);
    expect(rows[0]?.priority).toBe('low');
    expect(rows[1]?.taskNumber).toBe(2);
  });
});
