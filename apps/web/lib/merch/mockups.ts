import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchDesignOptions } from '@/lib/db/schema/merch';
import {
  createMockupTask,
  isPrintfulConfigured,
  type PrintfulMockupTask,
  retrieveMockupTasks,
} from '@/lib/printful/client';
import { logger } from '@/lib/utils/logger';
import {
  getMockupCatalogProduct,
  getMockupProductsForTypes,
  type MockupCatalogProduct,
} from './mockup-catalog';

const MAX_POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 4_000;

export interface MockupGenerationRequest {
  readonly printFileUrl: string;
  readonly productTypes?: readonly string[];
  readonly catalogProductId?: number;
  readonly catalogVariantIds?: readonly number[];
  readonly placements?: readonly string[];
  readonly technique?: MockupCatalogProduct['technique'];
}

export interface MockupGenerationResult {
  readonly taskIds: (number | string)[];
  readonly mockupsByProduct: Record<string, string[]>;
  readonly errors: string[];
}

export interface MockupProductResult {
  readonly productType: string;
  readonly productName: string;
  readonly catalogProductId: number;
  readonly mockupUrls: string[];
}

interface ResolvedMockupProduct {
  readonly productType: string;
  readonly productName: string;
  readonly catalogProductId: number;
  readonly catalogVariantIds: number[];
  readonly placements: string[];
  readonly technique: MockupCatalogProduct['technique'];
}

function resolveMockupProducts(
  request: MockupGenerationRequest
): ResolvedMockupProduct[] {
  if (request.catalogProductId) {
    const catalogProduct = getMockupCatalogProduct(request.catalogProductId);
    return [
      {
        productType: catalogProduct?.productType ?? 'custom',
        productName: catalogProduct?.productName ?? 'Custom Product',
        catalogProductId: request.catalogProductId,
        catalogVariantIds: [
          ...(request.catalogVariantIds ??
            catalogProduct?.catalogVariantIds ??
            []),
        ],
        placements: [
          ...(request.placements ?? catalogProduct?.placements ?? ['front']),
        ],
        technique:
          request.technique ?? catalogProduct?.technique ?? ('dtg' as const),
      },
    ].filter(product => product.catalogVariantIds.length > 0);
  }

  return getMockupProductsForTypes(request.productTypes ?? []).map(product => ({
    productType: product.productType,
    productName: product.productName,
    catalogProductId: product.catalogProductId,
    catalogVariantIds: [...product.catalogVariantIds],
    placements: [...product.placements],
    technique: product.technique,
  }));
}

/**
 * Creates Printful mockup generation tasks for an artwork across multiple product types.
 * Returns task IDs for polling.
 */
export async function createMockupGenerationTasks(
  request: MockupGenerationRequest
): Promise<{
  readonly taskIds: (number | string)[];
  readonly taskIdToCatalogProductId: Record<string, number>;
  readonly errors: string[];
}> {
  if (!isPrintfulConfigured()) {
    return {
      taskIds: [],
      taskIdToCatalogProductId: {},
      errors: ['Printful is not configured; mockup generation unavailable.'],
    };
  }

  if (!request.printFileUrl) {
    return {
      taskIds: [],
      taskIdToCatalogProductId: {},
      errors: ['No print file URL provided for mockup generation.'],
    };
  }

  const products = resolveMockupProducts(request);
  if (products.length === 0) {
    return {
      taskIds: [],
      taskIdToCatalogProductId: {},
      errors: ['No eligible Printful products for mockup generation.'],
    };
  }

  const taskIds: (number | string)[] = [];
  const taskIdToCatalogProductId: Record<string, number> = {};
  const errors: string[] = [];

  for (const product of products) {
    try {
      const mockupStyles = getMockupStyleIds(product.productType);
      const task = await createMockupTask({
        catalogProductId: product.catalogProductId,
        catalogVariantIds: product.catalogVariantIds,
        placements: product.placements.map(placement => ({
          placement,
          technique: product.technique,
          layers: [
            {
              type: 'file' as const,
              url: request.printFileUrl,
            },
          ],
        })),
        mockupStyleIds: mockupStyles,
      });
      taskIds.push(task.id);
      taskIdToCatalogProductId[String(task.id)] = product.catalogProductId;
      logger.info('[merch mockups] Created Printful mockup task', {
        productType: product.productType,
        catalogProductId: product.catalogProductId,
        taskId: task.id,
        status: task.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(
        `${product.productType} (ID ${product.catalogProductId}): ${message}`
      );
      logger.error('[merch mockups] Failed to create mockup task', {
        productType: product.productType,
        catalogProductId: product.catalogProductId,
        error: message,
      });
    }
  }

  return { taskIds, taskIdToCatalogProductId, errors };
}

/**
 * Polls Printful mockup tasks until completion and extracts mockup URLs.
 * Retries up to MAX_POLL_ATTEMPTS with POLL_INTERVAL_MS between polls.
 */
export async function retrieveMockupResults(
  taskIds: readonly (number | string)[],
  taskIdToCatalogProductId: Readonly<Record<string, number>> = {}
): Promise<MockupGenerationResult> {
  if (taskIds.length === 0) {
    return {
      taskIds: [],
      mockupsByProduct: {},
      errors: [],
    };
  }

  if (!isPrintfulConfigured()) {
    return {
      taskIds: taskIds.slice(),
      mockupsByProduct: {},
      errors: ['Printful is not configured; cannot retrieve mockup results.'],
    };
  }

  const errors: string[] = [];
  const mockupsByProduct: Record<string, string[]> = {};

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const tasks = await retrieveMockupTasks(taskIds);
      let allComplete = true;

      for (const task of tasks) {
        if (task.status === 'failed') {
          errors.push(`Mockup task ${task.id} failed on Printful`);
          continue;
        }
        if (task.status !== 'completed') {
          allComplete = false;
          continue;
        }

        const mockupUrls = extractMockupUrls(task);
        if (mockupUrls.length > 0) {
          const catalogProductId =
            taskIdToCatalogProductId[String(task.id)] ?? task.id;
          const key = String(catalogProductId);
          mockupsByProduct[key] = [
            ...new Set([...(mockupsByProduct[key] ?? []), ...mockupUrls]),
          ];
          logger.info('[merch mockups] Retrieved completed mockups', {
            taskId: task.id,
            catalogProductId,
            mockupCount: mockupUrls.length,
          });
        } else {
          errors.push(`Mockup task ${task.id} completed with no mockup URLs`);
        }
      }

      if (allComplete) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Mockup retrieval attempt ${attempt} failed: ${message}`);
    }

    if (attempt < MAX_POLL_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return {
    taskIds: taskIds.slice(),
    mockupsByProduct,
    errors,
  };
}

/**
 * Full mockup generation pipeline: creates tasks, polls for results,
 * returns a flat list of mockup results keyed by product type.
 */
export async function generateProductMockups(
  request: MockupGenerationRequest
): Promise<{
  readonly results: MockupProductResult[];
  readonly errors: string[];
}> {
  const products = resolveMockupProducts(request);

  const {
    taskIds,
    taskIdToCatalogProductId,
    errors: createErrors,
  } = await createMockupGenerationTasks(request);

  if (taskIds.length === 0) {
    return { results: [], errors: createErrors };
  }

  const { mockupsByProduct, errors: pollErrors } = await retrieveMockupResults(
    taskIds,
    taskIdToCatalogProductId
  );

  const allErrors = [...createErrors, ...pollErrors];

  const results: MockupProductResult[] = products.flatMap(product => {
    const mockupUrls = mockupsByProduct[String(product.catalogProductId)] ?? [];
    return mockupUrls.length > 0
      ? [
          {
            productType: product.productType,
            productName: product.productName,
            catalogProductId: product.catalogProductId,
            mockupUrls,
          },
        ]
      : [];
  });

  return { results, errors: allErrors };
}

/**
 * Attaches mockup URLs to a merch design option in the database.
 * Used to retroactively add Printful mockups to existing design options.
 */
export async function attachMockupsToDesignOption(
  optionId: string,
  mockupUrls: readonly string[]
): Promise<void> {
  if (mockupUrls.length === 0) return;

  const [option] = await db
    .select({ mockupUrls: merchDesignOptions.mockupUrls })
    .from(merchDesignOptions)
    .where(eq(merchDesignOptions.id, optionId))
    .limit(1);

  if (!option) {
    throw new Error(`Design option ${optionId} not found`);
  }

  const existing = new Set(option.mockupUrls ?? []);
  const newUrls = mockupUrls.filter(url => !existing.has(url));
  if (newUrls.length === 0) return;

  const merged = [...newUrls, ...(option.mockupUrls ?? [])];
  await db
    .update(merchDesignOptions)
    .set({ mockupUrls: merged, updatedAt: new Date() })
    .where(eq(merchDesignOptions.id, optionId));

  logger.info('[merch mockups] Attached Printful mockups to design option', {
    optionId,
    addedCount: newUrls.length,
    totalMockupUrls: merged.length,
  });
}

function extractMockupUrls(task: PrintfulMockupTask): string[] {
  const urls: string[] = [];
  for (const variantMockup of task.catalog_variant_mockups ?? []) {
    for (const mockup of variantMockup.mockups ?? []) {
      if (mockup.mockup_url) {
        urls.push(mockup.mockup_url);
      }
    }
  }
  return [...new Set(urls)];
}

function getMockupStyleIds(productType: string): number[] | undefined {
  switch (productType) {
    case 'premium hoodie':
      return [2, 4];
    case 'mug':
      return [5, 8];
    case 'premium tee':
    default:
      return [1, 3];
  }
}
