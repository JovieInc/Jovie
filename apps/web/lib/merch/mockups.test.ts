import { beforeEach, describe, expect, it, vi } from 'vitest';

const printful = vi.hoisted(() => ({
  createMockupTask: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  retrieveMockupTasks: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  updateWhere: vi.fn(),
  lastUpdatedValues: null as Record<string, unknown> | null,
  updatedValues: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/printful/client', () => printful);
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: dbMocks.selectLimit,
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbMocks.lastUpdatedValues = values;
        dbMocks.updatedValues.push(values);
        return {
          where: dbMocks.updateWhere,
        };
      },
    }),
  },
}));

import {
  attachMockupsToDesignOption,
  createMockupGenerationTasks,
  generateProductMockups,
  retrieveMockupResults,
} from './mockups';

describe('createMockupGenerationTasks', () => {
  beforeEach(() => {
    printful.createMockupTask.mockReset();
    printful.isPrintfulConfigured.mockReset();
    printful.retrieveMockupTasks.mockReset();
  });

  it('returns an error when Printful is not configured', async () => {
    printful.isPrintfulConfigured.mockReturnValue(false);

    const result = await createMockupGenerationTasks({
      printFileUrl: 'https://cdn.test/print.png',
      productTypes: ['premium tee'],
    });

    expect(result.taskIds).toEqual([]);
    expect(result.errors).toContain(
      'Printful is not configured; mockup generation unavailable.'
    );
    expect(printful.createMockupTask).not.toHaveBeenCalled();
  });

  it('creates Printful mockup tasks with print file layers', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.createMockupTask.mockResolvedValue({
      id: 101,
      status: 'pending',
    });

    const result = await createMockupGenerationTasks({
      printFileUrl: 'https://cdn.test/print.png',
      productTypes: ['premium tee'],
    });

    expect(result.taskIds).toEqual([101]);
    expect(result.taskIdToCatalogProductId['101']).toBe(71);
    expect(printful.createMockupTask).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogProductId: 71,
        catalogVariantIds: [4011, 4012, 4013, 4014],
        placements: [
          expect.objectContaining({
            placement: 'front',
            technique: 'dtg',
            layers: [
              {
                type: 'file',
                url: 'https://cdn.test/print.png',
              },
            ],
          }),
        ],
      })
    );
  });

  it('uses explicit catalog product data when provided', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.createMockupTask.mockResolvedValue({
      id: 202,
      status: 'pending',
    });

    const result = await createMockupGenerationTasks({
      printFileUrl: 'https://cdn.test/print.png',
      catalogProductId: 91,
      catalogVariantIds: [5001, 5002],
      placements: ['front'],
      technique: 'dtg',
    });

    expect(result.taskIds).toEqual([202]);
    expect(printful.createMockupTask).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogProductId: 91,
        catalogVariantIds: [5001, 5002],
      })
    );
  });
});

describe('retrieveMockupResults', () => {
  beforeEach(() => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.retrieveMockupTasks.mockReset();
  });

  it('maps completed task mockups to catalog product ids', async () => {
    printful.retrieveMockupTasks.mockResolvedValue([
      {
        id: 303,
        status: 'completed',
        catalog_variant_mockups: [
          {
            catalog_variant_id: 4011,
            mockups: [{ mockup_url: 'https://printful.test/mockup-1.jpg' }],
          },
        ],
      },
    ]);

    const result = await retrieveMockupResults([303], { '303': 71 });

    expect(result.mockupsByProduct['71']).toEqual([
      'https://printful.test/mockup-1.jpg',
    ]);
    expect(result.errors).toEqual([]);
  });
});

describe('generateProductMockups', () => {
  beforeEach(() => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.createMockupTask.mockReset();
    printful.retrieveMockupTasks.mockReset();
  });

  it('returns product-scoped mockup results after polling', async () => {
    printful.createMockupTask.mockResolvedValue({
      id: 404,
      status: 'pending',
    });
    printful.retrieveMockupTasks.mockResolvedValue([
      {
        id: 404,
        status: 'completed',
        catalog_variant_mockups: [
          {
            catalog_variant_id: 4011,
            mockups: [{ mockup_url: 'https://printful.test/mockup-tee.jpg' }],
          },
        ],
      },
    ]);

    const result = await generateProductMockups({
      printFileUrl: 'https://cdn.test/print.png',
      productTypes: ['premium tee'],
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        productType: 'premium tee',
        catalogProductId: 71,
        mockupUrls: ['https://printful.test/mockup-tee.jpg'],
      }),
    ]);
    expect(result.errors).toEqual([]);
  });
});

describe('attachMockupsToDesignOption', () => {
  beforeEach(() => {
    dbMocks.lastUpdatedValues = null;
    dbMocks.updatedValues = [];
    dbMocks.selectLimit.mockReset();
    dbMocks.updateWhere.mockReset();
    dbMocks.updateWhere.mockResolvedValue(undefined);
  });

  it('merges new mockup URLs with existing design option URLs', async () => {
    dbMocks.selectLimit.mockResolvedValue([
      {
        mockupUrls: ['https://cdn.test/internal-mockup.jpg'],
      },
    ]);

    await attachMockupsToDesignOption('option-1', [
      'https://printful.test/mockup-tee.jpg',
    ]);

    expect(dbMocks.updatedValues).toEqual([
      {
        mockupUrls: [
          'https://printful.test/mockup-tee.jpg',
          'https://cdn.test/internal-mockup.jpg',
        ],
        updatedAt: expect.any(Date),
      },
      {
        mockupUrls: [
          'https://printful.test/mockup-tee.jpg',
          'https://cdn.test/internal-mockup.jpg',
        ],
        primaryImageUrl: 'https://printful.test/mockup-tee.jpg',
        updatedAt: expect.any(Date),
      },
    ]);
    expect(dbMocks.lastUpdatedValues).toEqual({
      mockupUrls: [
        'https://printful.test/mockup-tee.jpg',
        'https://cdn.test/internal-mockup.jpg',
      ],
      primaryImageUrl: 'https://printful.test/mockup-tee.jpg',
      updatedAt: expect.any(Date),
    });
  });
});
