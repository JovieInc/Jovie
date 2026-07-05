import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateMockupTask = vi.hoisted(() => vi.fn());
const mockCreatePrintfulFile = vi.hoisted(() => vi.fn());
const mockRetrieveMockupTasks = vi.hoisted(() => vi.fn());
const mockIsPrintfulConfigured = vi.hoisted(() => vi.fn());

vi.mock('@/lib/printful/client', () => ({
  createMockupTask: mockCreateMockupTask,
  createPrintfulFile: mockCreatePrintfulFile,
  isPrintfulConfigured: mockIsPrintfulConfigured,
  retrieveMockupTasks: mockRetrieveMockupTasks,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    BLOB_READ_WRITE_TOKEN: '',
    NODE_ENV: 'test',
  },
}));

import {
  generateMockups,
  MockupTaskStatus,
  pollMockupTaskStatus,
} from './mockup-generator';

describe('generateMockups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPrintfulConfigured.mockReturnValue(false);
  });
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPrintfulConfigured.mockReturnValue(false);
  });

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

  it('returns tasks unchanged when processing tasks exist without Printful config', async () => {
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
    expect(mockRetrieveMockupTasks).not.toHaveBeenCalled();
  });

  it('polls Printful for numeric task IDs and merges completed mockups', async () => {
    mockIsPrintfulConfigured.mockReturnValue(true);
    mockRetrieveMockupTasks.mockResolvedValue([
      {
        id: 42,
        status: 'completed',
        catalog_variant_mockups: [
          {
            catalog_variant_id: 4010,
            mockups: [{ mockup_url: 'https://printful.test/mockup.jpg' }],
          },
        ],
      },
    ]);

    const tasks = [
      {
        id: '42',
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
    expect(mockRetrieveMockupTasks).toHaveBeenCalledWith(['42']);
    expect(result[0].status).toBe(MockupTaskStatus.COMPLETED);
    expect(result[0].mockupUrls).toEqual(['https://printful.test/mockup.jpg']);
  });
});
