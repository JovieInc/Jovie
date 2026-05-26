import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SECRET_HEX =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

async function loadPrintfulClient(options?: {
  readonly serverFetch?: ReturnType<typeof vi.fn>;
  readonly secret?: string;
}) {
  vi.resetModules();

  const serverFetch = options?.serverFetch ?? vi.fn();
  vi.doMock('@/lib/env-server', () => ({
    env: {
      PRINTFUL_API_KEY: 'printful-test-key',
      PRINTFUL_API_BASE_URL: 'https://printful.test',
      PRINTFUL_STORE_ID: 'store-123',
      PRINTFUL_WEBHOOK_SECRET: options?.secret ?? SECRET_HEX,
    },
  }));
  vi.doMock('@/lib/http/server-fetch', () => ({
    isRetryableTransportError: vi.fn(() => false),
    serverFetch,
  }));

  const client = await import('./client');
  return { client, serverFetch };
}

afterEach(() => {
  vi.doUnmock('@/lib/env-server');
  vi.doUnmock('@/lib/http/server-fetch');
  vi.resetModules();
});

describe('Printful client', () => {
  it('verifies x-pf-webhook-signature with HMAC SHA-256', async () => {
    const { client } = await loadPrintfulClient();
    const rawBody = JSON.stringify({ type: 'order_updated', data: { id: 42 } });
    const signature = crypto
      .createHmac('sha256', Buffer.from(SECRET_HEX, 'hex'))
      .update(rawBody)
      .digest('hex');

    expect(client.verifyPrintfulWebhookSignature({ rawBody, signature })).toBe(
      true
    );
    expect(
      client.verifyPrintfulWebhookSignature({
        rawBody,
        signature: signature.replace(/.$/, '0'),
      })
    ).toBe(false);
  });

  it('creates orders with catalog variant IDs only', async () => {
    const serverFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { id: 123, status: 'draft' } }), {
          status: 200,
        })
    );
    const { client } = await loadPrintfulClient({ serverFetch });

    const order = await client.createDraftOrder({
      external_id: 'jovie_merch_test',
      recipient: {
        name: 'Fan Buyer',
        email: 'fan@example.com',
        address1: '100 Main St',
        city: 'Los Angeles',
        state_code: 'CA',
        country_code: 'US',
        zip: '90001',
      },
      order_items: [
        {
          quantity: 1,
          catalog_variant_id: 4012,
          source: 'catalog',
          placements: [
            {
              placement: 'front',
              technique: 'dtg',
              layers: [{ type: 'file', url: 'https://cdn.test/print.png' }],
            },
          ],
        },
      ],
    });

    expect(order.id).toBe(123);
    expect(serverFetch).toHaveBeenCalledTimes(1);
    const call = serverFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [
      string,
      RequestInit & { readonly context?: string },
    ];
    expect(url).toBe('https://printful.test/v2/orders');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer printful-test-key',
      'X-PF-Store-Id': 'store-123',
    });

    const body = JSON.parse(String(init.body)) as {
      readonly order_items: Array<{
        readonly catalog_variant_id?: number;
        readonly catalog_product_id?: number;
      }>;
    };
    expect(body.order_items[0]?.catalog_variant_id).toBe(4012);
    expect(body.order_items[0]?.catalog_product_id).toBeUndefined();
  });

  it('retrieves catalog variant prices with selling region and currency', async () => {
    const serverFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              currency: 'USD',
              product: {
                id: 71,
                placements: [
                  {
                    id: 'front',
                    technique_key: 'dtg',
                    price: '17.50',
                    discounted_price: '16.75',
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
    );
    const { client } = await loadPrintfulClient({ serverFetch });

    const prices = await client.getCatalogVariantPrices(4011, {
      currency: 'USD',
      sellingRegionName: 'north_america',
    });

    expect(prices.currency).toBe('USD');
    expect(prices.product.placements[0]?.discounted_price).toBe('16.75');
    expect(serverFetch).toHaveBeenCalledTimes(1);
    const priceCall = serverFetch.mock.calls[0] as unknown as [string];
    expect(priceCall[0]).toBe(
      'https://printful.test/v2/catalog-variants/4011/prices?currency=USD&selling_region_name=north_america'
    );
  });

  it('supports catalog product paging parameters', async () => {
    const serverFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 71, name: 'Unisex Premium T-Shirt' }],
            paging: { total: 240, offset: 20, limit: 20 },
          }),
          { status: 200 }
        )
    );
    const { client } = await loadPrintfulClient({ serverFetch });

    const products = await client.listCatalogProducts({
      sellingRegionName: 'north_america',
      placements: ['front'],
      limit: 20,
      offset: 20,
    });

    expect(products).toEqual([{ id: 71, name: 'Unisex Premium T-Shirt' }]);
    const productsCall = serverFetch.mock.calls[0] as unknown as [string];
    expect(productsCall[0]).toBe(
      'https://printful.test/v2/catalog-products?selling_region_name=north_america&placements=front&limit=20&offset=20'
    );
  });
});
