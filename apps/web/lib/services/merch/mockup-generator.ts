import 'server-only';

/**
 * Printful mockup generator service.
 *
 * Takes a design concept + selected products and generates mockup
 * tasks via the Printful API. Handles print file upload, mockup
 * generation request, and status polling.
 *
 * @see @/lib/printful/client.ts - Printful API transport layer
 * @see @/lib/services/merch/merch-generator.ts - Parent generation service
 */

import { z } from 'zod';
import { createPrintfulFile } from '@/lib/printful/client';
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
// Mockup generation — production path (Printful API)
// ---------------------------------------------------------------------------

async function uploadPrintFile(
  svgContent: string,
  fileName: string
): Promise<string> {
  // In production, upload the SVG to a CDN/asset service first,
  // then register it with Printful via createPrintfulFile.
  // For now we return a placeholder URL — the real CDN upload
  // will be wired when asset hosting is configured.
  const file = await createPrintfulFile({
    url: `https://cdn.jov.ie/merch/${fileName}`,
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
}): Promise<readonly string[]> {
  // TODO: Call Printful Mockup Generator API when available.
  // For now return empty — the sync polling layer will be added
  // alongside the mockup API integration.
  return [];
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
      const taskId = `mockup-${designOption.id}-${product.productId}-${variantId}-${Date.now()}`;

      try {
        const usePlaceholder = options?.usePlaceholder ?? true;

        if (usePlaceholder) {
          const mockupUrls = generateMockupUrlsForVariants(
            product.productId,
            [variantId],
            'front'
          );
          tasks.push({
            id: taskId,
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
            ? await uploadPrintFile(designOption.svgContent, `${taskId}.svg`)
            : null;

          const mockupUrls = await requestPrintfulMockup({
            variantIds: [variantId],
            printFileUrl: printFileUrl ?? '',
            placement: 'front',
            productId: product.productId,
          });

          tasks.push({
            id: taskId,
            designOptionId: designOption.id,
            productId: product.productId,
            variantId,
            placement: 'front',
            printFileUrl,
            status:
              mockupUrls.length > 0
                ? MockupTaskStatus.COMPLETED
                : MockupTaskStatus.PENDING,
            mockupUrls,
          });
        }
      } catch (error) {
        failedCount += 1;
        tasks.push({
          id: taskId,
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
    t => t.status === MockupTaskStatus.PROCESSING
  );

  if (stillProcessing.length === 0) {
    return tasks;
  }

  // TODO: query Printful API for mockup generation status
  // For now return unchanged — full polling integration ships
  // alongside the real mockup API key setup.
  return tasks;
}
