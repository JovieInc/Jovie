import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
// Regression coverage for the JOV-8805 fix (#23853): the dogfood personas'
// Stripe customers persist across runs while the database does not, so the
// detox helper must drain every attached payment method each run.
import { detachCustomerPaymentMethods } from '@/tests/e2e/helpers/stripe-helpers';

/**
 * Regression test for JOV-8805: the dogfood personas' Stripe customers
 * persist across runs (the Stripe test account is shared; only the database
 * is ephemeral) and every materialized test checkout attached one more test
 * PaymentMethod. Past Stripe's per-customer payment-method cap,
 * checkout.sessions.create failed for the persona and every
 * claim-checkout-dogfood run went red for ~30h.
 */
type FakePaymentMethod = { id: string };

interface FakeCustomer {
  id: string;
  deleted?: boolean;
  livemode?: boolean;
}

function makeFakeStripeClient(
  customers: FakeCustomer[],
  pagesByCustomer: Record<string, FakePaymentMethod[][]>
) {
  const detached: string[] = [];
  const detachCalls: Array<{ customerId: string; paymentMethodId: string }> =
    [];
  const client = {
    customers: {
      list: async () => ({
        data: customers.map(customer => ({
          id: customer.id,
          deleted: customer.deleted ?? false,
          livemode: customer.livemode ?? false,
        })),
        has_more: false,
      }),
    },
    paymentMethods: {
      list: async (params: { customer: string }) => {
        const pages = pagesByCustomer[params.customer] ?? [];
        return { data: pages.shift() ?? [], has_more: pages.length > 0 };
      },
      detach: async (paymentMethodId: string) => {
        detached.push(paymentMethodId);
        detachCalls.push({
          customerId: 'tracked-via-list',
          paymentMethodId,
        });
        return { id: paymentMethodId, customer: 'cus_x', livemode: false };
      },
    },
  };
  return { client: client as unknown as Stripe, detached, detachCalls };
}

describe('detachCustomerPaymentMethods (JOV-8805 regression)', () => {
  it('detaches every payment method across paginated pages and customers', async () => {
    const { client, detached } = makeFakeStripeClient(
      [{ id: 'cus_1' }, { id: 'cus_2' }],
      {
        cus_1: [[{ id: 'pm_1' }, { id: 'pm_2' }], [{ id: 'pm_3' }]],
        cus_2: [[{ id: 'pm_4' }]],
      }
    );

    const count = await detachCustomerPaymentMethods(client, 'persona@jov.ie');

    expect(count).toBe(4);
    expect(detached).toEqual(['pm_1', 'pm_2', 'pm_3', 'pm_4']);
  });

  it('keeps listing until a page comes back empty', async () => {
    const { client, detached } = makeFakeStripeClient([{ id: 'cus_1' }], {
      // The helper pages until empty: detaching a full page must not stop
      // the drain while later pages still hold attached methods.
      cus_1: [
        Array.from({ length: 100 }, (_, index) => ({ id: `pm_${index}` })),
        [{ id: 'pm_tail' }],
      ],
    });

    const count = await detachCustomerPaymentMethods(client, 'persona@jov.ie');

    expect(count).toBe(101);
    expect(detached.at(-1)).toBe('pm_tail');
  });

  it('skips deleted and non-test-mode customers', async () => {
    const { client, detached } = makeFakeStripeClient(
      [
        { id: 'cus_deleted', deleted: true },
        { id: 'cus_live', livemode: true },
      ],
      {
        // No pages needed: neither customer may be touched.
        cus_deleted: [[{ id: 'pm_should_not_detach' }]],
        cus_live: [[{ id: 'pm_should_not_detach_either' }]],
      }
    );

    const count = await detachCustomerPaymentMethods(client, 'persona@jov.ie');

    expect(count).toBe(0);
    expect(detached).toEqual([]);
  });

  it('returns 0 when the persona has no Stripe customer yet', async () => {
    const { client, detached } = makeFakeStripeClient([], {});

    const count = await detachCustomerPaymentMethods(client, 'persona@jov.ie');

    expect(count).toBe(0);
    expect(detached).toEqual([]);
  });
});
