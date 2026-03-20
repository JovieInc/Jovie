import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';

// Test the pure logic that the server actions use — date computation,
// task row building, idempotency checks. These don't need DB mocking.

function computeDueDate(releaseDate: Date, offsetDays: number): Date {
  const date = new Date(releaseDate);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function buildTaskRows(
  releaseId: string,
  profileId: string,
  releaseDate: Date | null
) {
  return DEFAULT_RELEASE_TASK_TEMPLATE.map((item, index) => ({
    releaseId,
    creatorProfileId: profileId,
    title: item.title,
    description: item.description ?? null,
    explainerText: item.explainerText ?? null,
    learnMoreUrl: item.learnMoreUrl ?? null,
    category: item.category,
    status: 'todo' as const,
    priority: item.priority,
    position: index,
    assigneeType: item.assigneeType,
    aiWorkflowId: item.aiWorkflowId ?? null,
    dueDaysOffset: item.dueDaysOffset,
    dueDate: releaseDate
      ? computeDueDate(releaseDate, item.dueDaysOffset)
      : null,
  }));
}

describe('computeDueDate', () => {
  it('computes correct date with negative offset', () => {
    const releaseDate = new Date('2026-04-15T00:00:00Z');
    const result = computeDueDate(releaseDate, -28);
    expect(result.toISOString().split('T')[0]).toBe('2026-03-18');
  });

  it('computes correct date with positive offset', () => {
    const releaseDate = new Date('2026-04-15T00:00:00Z');
    const result = computeDueDate(releaseDate, 7);
    expect(result.toISOString().split('T')[0]).toBe('2026-04-22');
  });

  it('computes correct date with zero offset (release day)', () => {
    const releaseDate = new Date('2026-04-15T00:00:00Z');
    const result = computeDueDate(releaseDate, 0);
    expect(result.toISOString().split('T')[0]).toBe('2026-04-15');
  });

  it('handles month boundary crossing', () => {
    const releaseDate = new Date('2026-03-05T00:00:00Z');
    const result = computeDueDate(releaseDate, -10);
    expect(result.toISOString().split('T')[0]).toBe('2026-02-23');
  });

  it('handles year boundary crossing', () => {
    const releaseDate = new Date('2026-01-10T00:00:00Z');
    const result = computeDueDate(releaseDate, -30);
    expect(result.toISOString().split('T')[0]).toBe('2025-12-11');
  });
});

describe('buildTaskRows', () => {
  const releaseId = 'release-123';
  const profileId = 'profile-456';

  it('creates tasks from template with correct IDs', () => {
    const rows = buildTaskRows(releaseId, profileId, null);
    expect(rows.length).toBe(DEFAULT_RELEASE_TASK_TEMPLATE.length);

    for (const row of rows) {
      expect(row.releaseId).toBe(releaseId);
      expect(row.creatorProfileId).toBe(profileId);
      expect(row.status).toBe('todo');
    }
  });

  it('computes due dates when release date is provided', () => {
    const releaseDate = new Date('2026-05-01T00:00:00Z');
    const rows = buildTaskRows(releaseId, profileId, releaseDate);

    for (const row of rows) {
      expect(row.dueDate).not.toBeNull();
      expect(row.dueDate).toBeInstanceOf(Date);
    }

    // First item has -30d offset
    const firstRow = rows[0];
    expect(firstRow.dueDate!.toISOString().split('T')[0]).toBe('2026-04-01');
  });

  it('leaves due dates null when release date is not provided', () => {
    const rows = buildTaskRows(releaseId, profileId, null);

    for (const row of rows) {
      expect(row.dueDate).toBeNull();
    }
  });

  it('preserves dueDaysOffset for future recomputation', () => {
    const rows = buildTaskRows(releaseId, profileId, null);

    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].dueDaysOffset).toBe(
        DEFAULT_RELEASE_TASK_TEMPLATE[i].dueDaysOffset
      );
    }
  });

  it('assigns correct positions', () => {
    const rows = buildTaskRows(releaseId, profileId, null);

    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].position).toBe(i);
    }
  });

  it('copies explainer text from template', () => {
    const rows = buildTaskRows(releaseId, profileId, null);

    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].explainerText).toBe(
        DEFAULT_RELEASE_TASK_TEMPLATE[i].explainerText ?? null
      );
    }
  });

  it('ai_workflow tasks have workflow IDs', () => {
    const rows = buildTaskRows(releaseId, profileId, null);
    const aiRows = rows.filter(r => r.assigneeType === 'ai_workflow');

    expect(aiRows.length).toBeGreaterThan(0);
    for (const row of aiRows) {
      expect(row.aiWorkflowId).toBeTruthy();
    }
  });

  it('human tasks have null workflow IDs', () => {
    const rows = buildTaskRows(releaseId, profileId, null);
    const humanRows = rows.filter(r => r.assigneeType === 'human');

    for (const row of humanRows) {
      expect(row.aiWorkflowId).toBeNull();
    }
  });
});
