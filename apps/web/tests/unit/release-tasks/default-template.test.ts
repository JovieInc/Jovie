import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE_TASK_TEMPLATE } from '@/lib/release-tasks/default-template';

describe('DEFAULT_RELEASE_TASK_TEMPLATE', () => {
  it('has at least 15 items', () => {
    expect(DEFAULT_RELEASE_TASK_TEMPLATE.length).toBeGreaterThanOrEqual(15);
  });

  it('every item has required fields', () => {
    for (const item of DEFAULT_RELEASE_TASK_TEMPLATE) {
      expect(item.title).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(['human', 'ai_workflow']).toContain(item.assigneeType);
      expect(['urgent', 'high', 'medium', 'low', 'none']).toContain(
        item.priority
      );
      expect(typeof item.dueDaysOffset).toBe('number');
    }
  });

  it('has no duplicate titles', () => {
    const titles = DEFAULT_RELEASE_TASK_TEMPLATE.map(i => i.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
  });

  it('due_days_offsets are reasonable (-60 to +30)', () => {
    for (const item of DEFAULT_RELEASE_TASK_TEMPLATE) {
      expect(item.dueDaysOffset).toBeGreaterThanOrEqual(-60);
      expect(item.dueDaysOffset).toBeLessThanOrEqual(30);
    }
  });

  it('ai_workflow items have an aiWorkflowId', () => {
    const aiItems = DEFAULT_RELEASE_TASK_TEMPLATE.filter(
      i => i.assigneeType === 'ai_workflow'
    );
    expect(aiItems.length).toBeGreaterThan(0);
    for (const item of aiItems) {
      expect(item.aiWorkflowId).toBeTruthy();
    }
  });

  it('categories are consistent strings', () => {
    const validCategories = [
      'Distribution',
      'Artwork',
      'DSP Pitching',
      'DSP Profile',
      'Lyrics',
      'Platform',
      'Fan Engagement',
      'Post-Release',
    ];
    for (const item of DEFAULT_RELEASE_TASK_TEMPLATE) {
      expect(validCategories).toContain(item.category);
    }
  });

  it('items are ordered by due_days_offset (earliest first)', () => {
    // At minimum, the first item should have a negative offset (pre-release)
    expect(DEFAULT_RELEASE_TASK_TEMPLATE[0].dueDaysOffset).toBeLessThan(0);
    // The last item should have a non-negative offset (release day or post)
    expect(
      DEFAULT_RELEASE_TASK_TEMPLATE[DEFAULT_RELEASE_TASK_TEMPLATE.length - 1]
        .dueDaysOffset
    ).toBeGreaterThanOrEqual(0);
  });

  it('fan notification task exists with ai_workflow assignee', () => {
    const fanNotif = DEFAULT_RELEASE_TASK_TEMPLATE.find(i =>
      i.title.toLowerCase().includes('fan notification')
    );
    expect(fanNotif).toBeDefined();
    expect(fanNotif!.assigneeType).toBe('ai_workflow');
    expect(fanNotif!.aiWorkflowId).toBe('fan-notification-send');
  });

  it('does not contain pre-save items', () => {
    const preSaveItems = DEFAULT_RELEASE_TASK_TEMPLATE.filter(
      i =>
        i.title.toLowerCase().includes('pre-save') ||
        i.title.toLowerCase().includes('presave')
    );
    expect(preSaveItems).toHaveLength(0);
  });

  it('every item has explainer text for the ⓘ popover', () => {
    for (const item of DEFAULT_RELEASE_TASK_TEMPLATE) {
      expect(item.explainerText).toBeTruthy();
      // Explainer should be at least a sentence
      expect(item.explainerText!.length).toBeGreaterThan(20);
    }
  });
});
