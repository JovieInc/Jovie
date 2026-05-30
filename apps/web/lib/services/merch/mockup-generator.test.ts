import { describe, expect, it } from 'vitest';
import {
  generateMockups,
  MockupTaskStatus,
  pollMockupTaskStatus,
} from './mockup-generator';

describe('generateMockups', () => {
  const designOption = {
    id: 'design-1',
    concept: 'Tour 2026',
    svgContent: '<svg/>',
    category: 'T-Shirt',
    description: 'Tour design',
  };

  const products = [
    {
      id: 'prod-1',
      productId: 71,
      name: 'Premium T-Shirt',
      variantIds: [4009, 4010],
      baseCostCents: 1200,
    },
  ];

  it('generates placeholder mockups by default', async () => {
    const result = await generateMockups(designOption, products);
    expect(result.tasks).toHaveLength(2);
    expect(result.completedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.tasks[0].status).toBe(MockupTaskStatus.COMPLETED);
  });

  it('returns mockups with placeholder URLs', async () => {
    const result = await generateMockups(designOption, products);
    const task = result.tasks[0];
    expect(task.mockupUrls).toHaveLength(1);
    expect(task.mockupUrls[0]).toContain('/api/merch/mockup/placeholder');
    expect(task.mockupUrls[0]).toContain('productId=71');
  });

  it('sets correct metadata on each task', async () => {
    const result = await generateMockups(designOption, products);
    expect(result.tasks[0].designOptionId).toBe('design-1');
    expect(result.tasks[0].productId).toBe(71);
    expect(result.tasks[0].variantId).toBe(4009);
    expect(result.tasks[0].placement).toBe('front');
    expect(result.tasks[1].variantId).toBe(4010);
  });

  it('generates task IDs that include timestamp', async () => {
    const before = Date.now();
    const result = await generateMockups(designOption, products);
    const after = Date.now();
    for (const task of result.tasks) {
      const parts = task.id.split('-');
      const timestamp = Number(parts[parts.length - 1]);
      expect(timestamp).toBeGreaterThanOrEqual(before - 1000);
      expect(timestamp).toBeLessThanOrEqual(after + 1000);
    }
  });
});

describe('pollMockupTaskStatus', () => {
  it('returns tasks unchanged when none are processing', async () => {
    const tasks = [
      {
        id: 'task-1',
        designOptionId: 'design-1',
        productId: 71,
        variantId: 4009,
        placement: 'front',
        printFileUrl: null,
        status: MockupTaskStatus.COMPLETED,
        mockupUrls: ['https://cdn.test/1.png'],
      },
    ];
    const result = await pollMockupTaskStatus(tasks);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(MockupTaskStatus.COMPLETED);
  });

  it('returns tasks unchanged when processing tasks exist', async () => {
    const tasks = [
      {
        id: 'task-2',
        designOptionId: 'design-1',
        productId: 71,
        variantId: 4010,
        placement: 'front',
        printFileUrl: 'https://cdn.test/print.svg',
        status: MockupTaskStatus.PROCESSING,
        mockupUrls: [],
      },
    ];
    const result = await pollMockupTaskStatus(tasks);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe(MockupTaskStatus.PROCESSING);
  });
});
