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
});
