import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * JOV-4743: mockup enrichment must be durable and observable — retry budget,
 * terminal `mockup_ready` / `mockup_failed` states persisted on the option,
 * and idempotent skips when a truthful Printful mockup already exists.
 */

const hoisted = vi.hoisted(() => ({
  generateProductMockups: vi.fn(),
  attachMockupsToDesignOption: vi.fn(),
  selectLimit: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  scheduleAfter: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: hoisted.selectLimit })),
      })),
    })),
    update: vi.fn(() => ({ set: hoisted.updateSet })),
  },
}));

vi.mock('@/lib/db/schema/merch', () => ({
  merchDesignOptions: {
    id: 'id',
    mockupUrls: 'mockup_urls',
    qualityReview: 'quality_review',
  },
}));

vi.mock('@/lib/merch/mockups', () => ({
  generateProductMockups: hoisted.generateProductMockups,
  attachMockupsToDesignOption: hoisted.attachMockupsToDesignOption,
}));

vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: hoisted.scheduleAfter,
}));

import {
  MAX_MOCKUP_ATTEMPTS,
  runMerchMockupEnrichment,
  scheduleMerchMockupEnrichment,
} from './mockup-enrichment';

const ITEM = {
  optionId: 'option-1',
  request: {
    printFileUrl:
      'https://blob.vercel-storage.com/merch/generated/p/g/option-1.png',
    catalogProductId: 71,
    catalogVariantIds: [4011],
    productTypes: ['t-shirt'],
  },
} as const;

const PRINTFUL_URL = 'https://files.printful.com/mockups/abc.png';

describe('runMerchMockupEnrichment (JOV-4743)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectLimit.mockResolvedValue([{ mockupUrls: [] }]);
    hoisted.updateSet.mockReturnValue({ where: hoisted.updateWhere });
    hoisted.updateWhere.mockResolvedValue(undefined);
    hoisted.attachMockupsToDesignOption.mockResolvedValue(undefined);
  });

  it('attaches mockups and reaches terminal mockup_ready', async () => {
    hoisted.generateProductMockups.mockResolvedValue({
      results: [{ mockupUrls: [PRINTFUL_URL] }],
      errors: [],
    });

    const [outcome] = await runMerchMockupEnrichment([ITEM]);

    expect(outcome).toEqual({
      optionId: 'option-1',
      status: 'mockup_ready',
      attempts: 1,
    });
    expect(hoisted.attachMockupsToDesignOption).toHaveBeenCalledWith(
      'option-1',
      [PRINTFUL_URL]
    );
    // Terminal state persisted on the option's qualityReview evidence.
    expect(hoisted.updateSet).toHaveBeenCalled();
  });

  it('is idempotent: skips options that already have a truthful Printful mockup', async () => {
    hoisted.selectLimit.mockResolvedValue([{ mockupUrls: [PRINTFUL_URL] }]);

    const [outcome] = await runMerchMockupEnrichment([ITEM]);

    expect(outcome).toEqual({
      optionId: 'option-1',
      status: 'mockup_ready',
      attempts: 0,
    });
    expect(hoisted.generateProductMockups).not.toHaveBeenCalled();
  });

  it('exhausts the retry budget and persists terminal mockup_failed', async () => {
    hoisted.generateProductMockups.mockRejectedValue(
      new Error('Printful unavailable')
    );

    const [outcome] = await runMerchMockupEnrichment([ITEM]);

    expect(outcome).toMatchObject({
      optionId: 'option-1',
      status: 'mockup_failed',
      attempts: MAX_MOCKUP_ATTEMPTS,
      error: 'Printful unavailable',
    });
    expect(hoisted.generateProductMockups).toHaveBeenCalledTimes(
      MAX_MOCKUP_ATTEMPTS
    );
    expect(hoisted.attachMockupsToDesignOption).not.toHaveBeenCalled();
    expect(hoisted.updateSet).toHaveBeenCalled();
  });

  it('treats an empty provider result as a failure and retries', async () => {
    hoisted.generateProductMockups.mockResolvedValue({
      results: [],
      errors: ['Printful is not configured'],
    });

    const [outcome] = await runMerchMockupEnrichment([ITEM]);

    expect(outcome.status).toBe('mockup_failed');
    expect(outcome.error).toContain('Printful is not configured');
    expect(hoisted.generateProductMockups).toHaveBeenCalledTimes(
      MAX_MOCKUP_ATTEMPTS
    );
  });
});

describe('scheduleMerchMockupEnrichment durability (PR-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectLimit.mockResolvedValue([{ mockupUrls: [] }]);
    hoisted.updateSet.mockReturnValue({ where: hoisted.updateWhere });
    hoisted.updateWhere.mockResolvedValue(undefined);
    hoisted.attachMockupsToDesignOption.mockResolvedValue(undefined);
    hoisted.scheduleAfter.mockReset();
  });

  it('hands scheduleAfter a task whose returned promise settles only after enrichment completes', async () => {
    let capturedTask: (() => unknown) | undefined;
    hoisted.scheduleAfter.mockImplementation((task: () => unknown) => {
      capturedTask = task;
      return true;
    });
    let resolveProvider!: (value: {
      results: { mockupUrls: string[] }[];
      errors: string[];
    }) => void;
    hoisted.generateProductMockups.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveProvider = resolve;
        })
    );
    const onSettled = vi.fn();

    scheduleMerchMockupEnrichment([ITEM], onSettled);

    expect(capturedTask).toBeDefined();
    const taskPromise = capturedTask?.() as Promise<unknown> | undefined;
    // Next.js after() awaits the task's return value — it must be a promise
    // that stays pending while the provider work is still in flight,
    // otherwise serverless teardown can cut the enrichment off mid-write.
    expect(taskPromise).toBeInstanceOf(Promise);

    let settled = false;
    void taskPromise?.then(() => {
      settled = true;
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(onSettled).not.toHaveBeenCalled();

    resolveProvider({
      results: [{ mockupUrls: [PRINTFUL_URL] }],
      errors: [],
    });
    await taskPromise;

    expect(settled).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith([
      expect.objectContaining({
        optionId: 'option-1',
        status: 'mockup_ready',
      }),
    ]);
  });
});
