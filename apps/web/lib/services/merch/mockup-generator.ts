import 'server-only';

/**
 * Printful mockup generator service.
 *
 * Takes a design concept + selected products and generates mockup
 * tasks via the Printful API. Handles print file upload, mockup
 * generation request, and status polling.
 *
 * @see @/lib/printful/client.ts - Printful API transport layer
 * @see @/lib/merch/mockups.ts - Canonical Printful mockup pipeline
 * @see @/lib/services/merch/merch-generator.ts - Parent generation service
 */

import { z } from 'zod';
import { env } from '@/lib/env-server';
import {
  createMockupTask,
  createPrintfulFile,
  isPrintfulConfigured,
  type PrintfulMockupTask,
  retrieveMockupTasks,
} from '@/lib/printful/client';
import type { DesignOption, SelectedProduct } from './merch-generator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const MockupTaskStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type MockupTaskStatus =
  (typeof MockupTaskStatus)[keyof typeof MockupTaskStatus];

export interface MockupTask {
  readonly id: string;
  readonly designOptionId: string;
  readonly productId: number;
  readonly variantId: number;
  readonly placement: string;
  readonly printFileUrl: string | null;
  readonly status: MockupTaskStatus;
  readonly mockupUrls: readonly string[];
  readonly error?: string;
}

export interface MockupGenerationRequest {
  readonly designOptionId: string;
  readonly product: SelectedProduct;
  readonly variantIds: readonly number[];
  readonly placement: string;
  readonly printFileUrl: string;
}

export interface MockupGenerationResult {
  readonly tasks: readonly MockupTask[];
  readonly failedCount: number;
  readonly completedCount: number;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const mockupTaskSchema = z.object({
  id: z.string(),
  designOptionId: z.string(),
  productId: z.number(),
  variantId: z.number(),
  placement: z.string(),
  printFileUrl: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  mockupUrls: z.array(z.string()),
  error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Printful helpers
// ---------------------------------------------------------------------------

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

function mapPrintfulStatus(status: string): MockupTaskStatus {
  switch (status) {
    case 'completed':
      return MockupTaskStatus.COMPLETED;
    case 'failed':
      return MockupTaskStatus.FAILED;
    case 'pending':
      return MockupTaskStatus.PENDING;
    default:
      return MockupTaskStatus.PROCESSING;
  }
}

function isPrintfulTaskId(taskId: string): boolean {
  return /^\d+$/.test(taskId);
}

async function uploadPrintFile(
  svgContent: string,
  fileName: string
): Promise<string> {
  const objectPath = `merch/printfiles/${fileName}`;
  let publicUrl: string;

  if (env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(objectPath, svgContent, {
      access: 'public',
      token: env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/svg+xml',
      addRandomSuffix: false,
    });
    publicUrl = blob.url;
  } else if (env.NODE_ENV === 'production') {
    throw new Error('Blob storage is not configured');
  } else {
    publicUrl = `https://blob.vercel-storage.com/${objectPath}`;
  }

  const file = await createPrintfulFile({
    url: publicUrl,
    filename: fileName,
    type: 'printfile',
  });
  return file.url;
}

async function requestPrintfulMockup(params: {
  readonly variantIds: readonly number[];
  readonly printFileUrl: string;
  readonly placement: string;
  readonly productId: number;
}): Promise<{
  readonly mockupUrls: readonly string[];
  readonly printfulTaskId: string;
  readonly status: MockupTaskStatus;
}> {
  if (!isPrintfulConfigured()) {
    return {
      mockupUrls: [],
      printfulTaskId: '',
      status: MockupTaskStatus.PENDING,
    };
  }

  const task = await createMockupTask({
    catalogProductId: params.productId,
    catalogVariantIds: [...params.variantIds],
    placements: [
      {
        placement: params.placement,
        technique: 'dtg',
        layers: [{ type: 'file', url: params.printFileUrl }],
      },
    ],
  });

  return {
    mockupUrls: extractMockupUrls(task),
    printfulTaskId: String(task.id),
    status: mapPrintfulStatus(task.status),
  };
}

// ---------------------------------------------------------------------------
// Mock fallback — generates placeholder mockup URLs
// ---------------------------------------------------------------------------

function generatePlaceholderMockupUrl(
  productId: number,
  variantId: number,
  placement: string
): string {
  return `/api/merch/mockup/placeholder?productId=${productId}&variantId=${variantId}&placement=${encodeURIComponent(placement)}`;
}

function generateMockupUrlsForVariants(
  productId: number,
  variantIds: readonly number[],
  placement: string
): readonly string[] {
  return variantIds.map(id =>
    generatePlaceholderMockupUrl(productId, id, placement)
  );
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate mockup tasks for a design option across selected products.
 *
 * Attempts real Printful mockup generation — falls back to placeholder
 * URLs when the API isn't configured.
 */
export async function generateMockups(
  designOption: DesignOption,
  products: readonly SelectedProduct[],
  options?: {
    readonly usePlaceholder?: boolean;
  }
): Promise<MockupGenerationResult> {
  const tasks: MockupTask[] = [];
  let failedCount = 0;

  for (const product of products) {
    for (const variantId of product.variantIds) {
      const localTaskId = `mockup-${designOption.id}-${product.productId}-${variantId}-${Date.now()}`;

      try {
        const usePlaceholder =
          options?.usePlaceholder ?? !isPrintfulConfigured();

        if (usePlaceholder) {
          const mockupUrls = generateMockupUrlsForVariants(
            product.productId,
            [variantId],
            'front'
          );
          tasks.push({
            id: localTaskId,
            designOptionId: designOption.id,
            productId: product.productId,
            variantId,
            placement: 'front',
            printFileUrl: null,
            status: MockupTaskStatus.COMPLETED,
            mockupUrls,
          });
        } else {
          const printFileUrl = designOption.svgContent
            ? await uploadPrintFile(
                designOption.svgContent,
                `${localTaskId}.svg`
              )
            : null;

          if (!printFileUrl) {
            throw new Error('Print file upload failed');
          }

          const mockupResult = await requestPrintfulMockup({
            variantIds: [variantId],
            printFileUrl,
            placement: 'front',
            productId: product.productId,
          });

          tasks.push({
            id: mockupResult.printfulTaskId || localTaskId,
            designOptionId: designOption.id,
            productId: product.productId,
            variantId,
            placement: 'front',
            printFileUrl,
            status:
              mockupResult.mockupUrls.length > 0
                ? MockupTaskStatus.COMPLETED
                : mockupResult.status,
            mockupUrls: mockupResult.mockupUrls,
          });
        }
      } catch (error) {
        failedCount += 1;
        tasks.push({
          id: localTaskId,
          designOptionId: designOption.id,
          productId: product.productId,
          variantId,
          placement: 'front',
          printFileUrl: null,
          status: MockupTaskStatus.FAILED,
          mockupUrls: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return {
    tasks,
    failedCount,
    completedCount: tasks.filter(t => t.status === MockupTaskStatus.COMPLETED)
      .length,
  };
}

/**
 * Poll mockup task status for tasks that are still processing.
 * No-op in placeholder mode.
 */
export async function pollMockupTaskStatus(
  tasks: readonly MockupTask[]
): Promise<readonly MockupTask[]> {
  const stillProcessing = tasks.filter(
    t =>
      t.status === MockupTaskStatus.PROCESSING ||
      t.status === MockupTaskStatus.PENDING
  );

  if (stillProcessing.length === 0 || !isPrintfulConfigured()) {
    return tasks;
  }

  const printfulTaskIds = stillProcessing
    .map(task => task.id)
    .filter(isPrintfulTaskId);

  if (printfulTaskIds.length === 0) {
    return tasks;
  }

  const remoteTasks = await retrieveMockupTasks(printfulTaskIds);
  const remoteById = new Map(remoteTasks.map(task => [String(task.id), task]));

  return tasks.map(task => {
    const remote = remoteById.get(task.id);
    if (!remote) {
      return task;
    }

    const mockupUrls = extractMockupUrls(remote);
    const status = mapPrintfulStatus(remote.status);

    return {
      ...task,
      status: mockupUrls.length > 0 ? MockupTaskStatus.COMPLETED : status,
      mockupUrls: mockupUrls.length > 0 ? mockupUrls : task.mockupUrls,
    };
  });
}
