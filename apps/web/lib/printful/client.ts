import 'server-only';

import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env-server';
import {
  isRetryableTransportError,
  serverFetch,
} from '@/lib/http/server-fetch';

const PRINTFUL_DEFAULT_BASE_URL = 'https://api.printful.com';
const PRINTFUL_TIMEOUT_MS = 12_000;

const printfulErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
  message: z.string().optional(),
});

export class PrintfulApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super(message);
    this.name = 'PrintfulApiError';
  }
}

export interface PrintfulCatalogProduct {
  readonly id: number;
  readonly name: string;
  readonly type?: string | null;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly image?: string | null;
  readonly is_discontinued?: boolean;
}

export interface PrintfulCatalogVariant {
  readonly id: number;
  readonly catalog_product_id: number;
  readonly name: string;
  readonly size?: string | null;
  readonly color?: string | null;
  readonly color_code?: string | null;
  readonly image?: string | null;
}

export interface PrintfulAvailability {
  readonly catalog_variant_id: number;
  readonly techniques?: Array<{
    readonly technique: string;
    readonly selling_regions?: Array<{
      readonly name: string;
      readonly availability: string;
    }>;
  }>;
}

export interface PrintfulMockupTask {
  readonly id: number | string;
  readonly status: string;
  readonly catalog_variant_mockups?: Array<{
    readonly catalog_variant_id?: number;
    readonly mockups?: Array<{ readonly mockup_url?: string }>;
  }>;
}

export interface PrintfulOrder {
  readonly id: number;
  readonly external_id?: string | null;
  readonly status?: string | null;
  readonly dashboard_url?: string | null;
}

interface PrintfulListResponse<T> {
  readonly data?: T[];
  readonly result?: T[];
}

interface PrintfulDataResponse<T> {
  readonly data?: T;
  readonly result?: T;
}

export interface PrintfulOrderItemInput {
  readonly quantity: number;
  readonly catalog_variant_id: number;
  readonly source: 'catalog';
  readonly placements: Array<{
    readonly placement: string;
    readonly technique: string;
    readonly layers: Array<{
      readonly type: 'file';
      readonly url: string;
      readonly layer_options?: Array<{
        readonly name: string;
        readonly value: unknown;
      }>;
    }>;
  }>;
}

export interface PrintfulCreateOrderInput {
  readonly external_id: string;
  readonly recipient: {
    readonly name: string;
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly address1: string;
    readonly address2?: string | null;
    readonly city: string;
    readonly state_code?: string | null;
    readonly country_code: string;
    readonly zip: string;
  };
  readonly order_items: PrintfulOrderItemInput[];
}

function getPrintfulBaseUrl(): string {
  return (
    env.PRINTFUL_API_BASE_URL?.replace(/\/$/, '') ?? PRINTFUL_DEFAULT_BASE_URL
  );
}

export function isPrintfulConfigured(): boolean {
  return Boolean(env.PRINTFUL_API_KEY);
}

function getAuthHeaders(): HeadersInit {
  if (!env.PRINTFUL_API_KEY) {
    throw new PrintfulApiError('Printful API key is not configured', 503, null);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json',
  };

  if (env.PRINTFUL_STORE_ID) {
    headers['X-PF-Store-Id'] = env.PRINTFUL_STORE_ID;
  }

  return headers;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string {
  const parsed = printfulErrorSchema.safeParse(payload);
  if (parsed.success) {
    return (
      parsed.data.error?.message ??
      parsed.data.message ??
      'Printful request failed'
    );
  }
  return 'Printful request failed';
}

async function requestPrintful<T>(
  path: string,
  options: RequestInit & { readonly retry?: boolean }
): Promise<T> {
  const response = await serverFetch(`${getPrintfulBaseUrl()}${path}`, {
    ...options,
    headers: options.headers
      ? { ...getAuthHeaders(), ...options.headers }
      : getAuthHeaders(),
    timeoutMs: PRINTFUL_TIMEOUT_MS,
    context: `Printful ${options.method ?? 'GET'} ${path}`,
    retry: options.retry
      ? {
          maxRetries: 2,
          baseDelayMs: 400,
          maxDelayMs: 2000,
          retryOn: ({ error }) =>
            error ? isRetryableTransportError(error) : true,
        }
      : undefined,
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new PrintfulApiError(
      extractErrorMessage(payload),
      response.status,
      payload
    );
  }

  return payload as T;
}

function readList<T>(payload: PrintfulListResponse<T>): T[] {
  return payload.data ?? payload.result ?? [];
}

function readData<T>(payload: PrintfulDataResponse<T>): T {
  const data = payload.data ?? payload.result;
  if (!data) {
    throw new PrintfulApiError(
      'Printful response did not contain data',
      502,
      payload
    );
  }
  return data;
}

export async function listCatalogProducts(params?: {
  readonly sellingRegionName?: string;
  readonly placements?: readonly string[];
  readonly limit?: number;
}): Promise<PrintfulCatalogProduct[]> {
  const search = new URLSearchParams();
  if (params?.sellingRegionName) {
    search.set('selling_region_name', params.sellingRegionName);
  }
  if (params?.placements?.length) {
    search.set('placements', params.placements.join(','));
  }
  if (params?.limit) {
    search.set('limit', String(params.limit));
  }

  const catalogProductsPath =
    search.size > 0 ? `/v2/catalog-products?${search}` : '/v2/catalog-products';
  const payload = await requestPrintful<
    PrintfulListResponse<PrintfulCatalogProduct>
  >(catalogProductsPath, {
    method: 'GET',
    retry: true,
  });
  return readList(payload);
}

export async function listCatalogVariants(
  catalogProductId: number
): Promise<PrintfulCatalogVariant[]> {
  const payload = await requestPrintful<
    PrintfulListResponse<PrintfulCatalogVariant>
  >(`/v2/catalog-products/${catalogProductId}/catalog-variants`, {
    method: 'GET',
    retry: true,
  });
  return readList(payload);
}

export async function getCatalogProductAvailability(
  catalogProductId: number,
  sellingRegionName = 'north_america'
): Promise<PrintfulAvailability[]> {
  const payload = await requestPrintful<
    PrintfulListResponse<PrintfulAvailability>
  >(
    `/v2/catalog-products/${catalogProductId}/availability?selling_region_name=${encodeURIComponent(
      sellingRegionName
    )}`,
    { method: 'GET', retry: true }
  );
  return readList(payload);
}

export async function createMockupTask(input: {
  readonly catalogProductId: number;
  readonly catalogVariantIds: number[];
  readonly placements: PrintfulOrderItemInput['placements'];
  readonly mockupStyleIds?: number[];
}): Promise<PrintfulMockupTask> {
  const payload = await requestPrintful<
    PrintfulDataResponse<PrintfulMockupTask>
  >('/v2/mockup-tasks', {
    method: 'POST',
    body: JSON.stringify({
      format: 'jpg',
      products: [
        {
          catalog_product_id: input.catalogProductId,
          catalog_variant_ids: input.catalogVariantIds,
          placements: input.placements,
          mockup_style_ids: input.mockupStyleIds,
        },
      ],
    }),
  });
  return readData(payload);
}

export async function retrieveMockupTasks(
  ids: readonly (number | string)[]
): Promise<PrintfulMockupTask[]> {
  const search = new URLSearchParams({ id: ids.map(String).join(',') });
  const payload = await requestPrintful<
    PrintfulListResponse<PrintfulMockupTask>
  >(`/v2/mockup-tasks?${search}`, { method: 'GET', retry: true });
  return readList(payload);
}

export async function createDraftOrder(
  input: PrintfulCreateOrderInput
): Promise<PrintfulOrder> {
  const payload = await requestPrintful<PrintfulDataResponse<PrintfulOrder>>(
    '/v2/orders',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return readData(payload);
}

export async function confirmOrder(
  orderId: string | number
): Promise<PrintfulOrder> {
  const payload = await requestPrintful<PrintfulDataResponse<PrintfulOrder>>(
    `/v2/orders/${orderId}/confirm`,
    { method: 'POST' }
  );
  return readData(payload);
}

export function verifyPrintfulWebhookSignature(params: {
  readonly rawBody: string;
  readonly signature: string | null;
}): boolean {
  if (!env.PRINTFUL_WEBHOOK_SECRET || !params.signature) {
    return false;
  }

  const key = Buffer.from(env.PRINTFUL_WEBHOOK_SECRET, 'hex');
  const expected = crypto
    .createHmac('sha256', key)
    .update(params.rawBody)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(params.signature);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
