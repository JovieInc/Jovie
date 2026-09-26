import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';
import { prepareBetterAuthEmailOtp } from '../helpers/auth';
import {
  createCheckoutSession,
  createSignedStripeWebhook,
  deleteRunOwnedStripeCustomer,
  expireRunOwnedTestCheckoutSession,
  findRunOwnedStripeCustomerIds,
  getBillingStatus,
  getRequiredStripeTestContext,
  materializeTestCheckoutCompletion,
  postStripeWebhook,
} from './helpers/stripe-helpers';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(300_000);

test.skip(
  process.env.E2E_TEST_MODE !== '1',
  'Money-path persistence requires the dedicated real-auth Golden Path lane'
);
test.skip(
  process.env.E2E_USE_TEST_AUTH_BYPASS === '1',
  'Money-path persistence refuses test-auth bypass identities'
);

interface MoneyUserRow {
  id: string;
  betterAuthUserId: string;
  email: string;
  isPro: boolean;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
}

test('persists verified checkout entitlement for a fresh and returning session', async ({
  browser,
  page,
}) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required');
  const sql = neon(dbUrl);
  const runId = [
    process.env.GITHUB_RUN_ID ?? 'local',
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
    Date.now().toString(36),
  ].join('-');
  const email = `money-${runId}+e2e@test.jovie.com`;
  const { stripeClient, priceId } = await getRequiredStripeTestContext();

  let appUserId: string | null = null;
  let betterAuthUserId: string | null = null;
  let referrerUserId: string | null = null;
  let referralCodeId: string | null = null;
  let checkoutSessionId: string | null = null;
  let customerId: string | null = null;
  let stripeEventId: string | null = null;
  const stripeEventIds: string[] = [];
  let returningContext: Awaited<ReturnType<typeof browser.newContext>> | null =
    null;

  const readMoneyUser = async (
    targetEmail = email
  ): Promise<MoneyUserRow | null> => {
    const [user] = await sql`
      SELECT id,
             better_auth_user_id AS "betterAuthUserId",
             email,
             is_pro AS "isPro",
             plan,
             stripe_customer_id AS "stripeCustomerId",
             stripe_subscription_id AS "stripeSubscriptionId",
             stripe_price_id AS "stripePriceId"
      FROM users
      WHERE email = ${targetEmail}
    `;
    return (user as MoneyUserRow | undefined) ?? null;
  };

  const readCommission = async (stripeInvoiceId: string) => {
    const [commission] = await sql`
      SELECT stripe_invoice_id AS "stripeInvoiceId",
             amount_cents AS "amountCents",
             currency,
             status
      FROM referral_commissions
      WHERE stripe_invoice_id = ${stripeInvoiceId}
    `;
    return commission ?? null;
  };

  try {
    const preparedSignup = await prepareBetterAuthEmailOtp(page, {
      email,
      entryPath: '/signup',
      beforeResponseFulfill: async candidateBetterAuthUserId => {
        await expect
          .poll(
            async () => {
              const [user] = await sql`
                UPDATE users
                SET user_status = 'waitlist_approved', updated_at = NOW()
                WHERE better_auth_user_id = ${candidateBetterAuthUserId}
                  AND email = ${email}
                RETURNING id, is_pro AS "isPro", plan
              `;
              if (!user) return null;
              if (user.isPro !== false || user.plan !== 'free') {
                throw new Error('Fresh money-path identity did not start free');
              }
              appUserId = user.id as string;
              betterAuthUserId = candidateBetterAuthUserId;
              return user.id as string;
            },
            {
              message:
                'Better Auth did not provision the exact money-path user',
              timeout: 30_000,
            }
          )
          .toBeTruthy();
      },
    });
    try {
      const authNavigation = page.waitForURL(
        url => !/\/(sign-in|signin|sign-up|signup)(\/|$)/.test(url.pathname),
        { timeout: 30_000 }
      );
      void authNavigation.catch(() => undefined);
      ({ betterAuthUserId } = await preparedSignup.submit());
      await authNavigation;
    } finally {
      await preparedSignup.dispose();
    }

    const freshUser = await readMoneyUser();
    expect(freshUser).not.toBeNull();
    appUserId = freshUser?.id ?? null;
    if (!appUserId) {
      throw new Error('Money-path user did not expose its application ID');
    }
    expect(freshUser).toMatchObject({
      betterAuthUserId,
      email,
      isPro: false,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });

    const referrerEmail = `money-referrer-${runId}@test.jovie.com`;
    const referrerClerkId = `user_e2e_referrer_${runId.replaceAll('-', '_')}`;
    const referralCode = `e2e${runId.replaceAll('-', '')}`;
    const [referrer] = await sql`
      INSERT INTO users (clerk_id, email, user_status)
      VALUES (${referrerClerkId}, ${referrerEmail}, 'active')
      RETURNING id
    `;
    referrerUserId = (referrer?.id as string | undefined) ?? null;
    expect(referrerUserId).toBeTruthy();

    const [createdReferralCode] = await sql`
      INSERT INTO referral_codes (user_id, code, is_active)
      VALUES (${referrerUserId}, ${referralCode}, true)
      RETURNING id
    `;
    referralCodeId = (createdReferralCode?.id as string | undefined) ?? null;
    expect(referralCodeId).toBeTruthy();

    const [createdReferral] = await sql`
      INSERT INTO referrals (
        referrer_user_id,
        referred_user_id,
        referral_code_id,
        status,
        commission_rate_bps,
        commission_duration_months
      )
      VALUES (
        ${referrerUserId},
        ${appUserId},
        ${referralCodeId},
        'pending',
        5000,
        24
      )
      RETURNING id
    `;
    expect(createdReferral?.id).toBeTruthy();

    const freeStatus = await getBillingStatus(page);
    expect(freeStatus).toMatchObject({ isPro: false, plan: 'free' });

    const checkout = await createCheckoutSession(page, priceId);
    checkoutSessionId = checkout.sessionId;
    const createdSession =
      await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
    if (createdSession.livemode !== false) {
      throw new Error('Created Checkout session must have livemode=false');
    }
    expect(createdSession.mode).toBe('subscription');
    expect(createdSession.metadata?.clerk_user_id).toBe(appUserId);
    const checkoutUrl = new URL(checkout.url);
    expect(checkoutUrl.protocol).toBe('https:');
    expect(checkoutUrl.hostname).toBe('checkout.stripe.com');
    customerId =
      typeof createdSession.customer === 'string'
        ? createdSession.customer
        : (createdSession.customer?.id ?? null);
    expect(customerId).toBeTruthy();

    const completed = await materializeTestCheckoutCompletion(stripeClient, {
      sessionId: checkoutSessionId,
      priceId,
      appUserId,
      email,
    });
    customerId = completed.customerId;
    expect(completed.session.metadata?.clerk_user_id).toBe(appUserId);

    // A Stripe-side test payment is not authority: only Jovie's verified
    // webhook may persist access.
    const redirectOnlyUser = await readMoneyUser();
    expect(redirectOnlyUser).toMatchObject({
      isPro: false,
      plan: 'free',
      stripeSubscriptionId: null,
    });

    const webhook = createSignedStripeWebhook(
      stripeClient,
      'checkout.session.completed',
      completed.session,
      `evt_money_${runId.replaceAll('-', '_')}`
    );
    stripeEventId = webhook.eventId;
    stripeEventIds.push(webhook.eventId);

    const invalidResponse = await postStripeWebhook(
      page,
      webhook,
      `t=${Math.floor(Date.now() / 1000)},v1=invalid`
    );
    expect(invalidResponse.status()).toBe(400);
    const [invalidEventCount] = await sql`
      SELECT COUNT(*)::int AS count
      FROM stripe_webhook_events
      WHERE stripe_event_id = ${stripeEventId}
    `;
    expect(invalidEventCount?.count).toBe(0);
    expect(await readMoneyUser()).toMatchObject({ isPro: false, plan: 'free' });

    const validResponse = await postStripeWebhook(page, webhook);
    expect(validResponse.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const [proof] = await sql`
            SELECT u.is_pro AS "isPro",
                   u.plan,
                   u.stripe_customer_id AS "stripeCustomerId",
                   u.stripe_subscription_id AS "stripeSubscriptionId",
                   u.stripe_price_id AS "stripePriceId",
                   swe.processed_at AS "processedAt",
                   swe.type AS "webhookType",
                   bal.event_type AS "auditEventType",
                   bal.source AS "auditSource"
            FROM users u
            JOIN stripe_webhook_events swe
              ON swe.stripe_event_id = ${stripeEventId}
            JOIN billing_audit_log bal
              ON bal.user_id = u.id AND bal.stripe_event_id = ${stripeEventId}
            WHERE u.id = ${appUserId}
          `;
          return proof ?? null;
        },
        { timeout: 30_000 }
      )
      .toMatchObject({
        isPro: true,
        plan: 'pro',
        stripeCustomerId: customerId,
        stripeSubscriptionId: completed.subscriptionId,
        stripePriceId: priceId,
        webhookType: 'checkout.session.completed',
        auditEventType: 'subscription_created',
        auditSource: 'webhook',
        processedAt: expect.anything(),
      });

    const currentUsage = await page.request.get('/api/usage/summary');
    expect(currentUsage.ok()).toBeTruthy();
    expect(await currentUsage.json()).toMatchObject({ plan: 'pro' });
    expect(await getBillingStatus(page)).toMatchObject({
      isPro: true,
      plan: 'pro',
      stripeCustomerId: customerId,
      stripeSubscriptionId: completed.subscriptionId,
    });

    returningContext = await browser.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3250',
    });
    const returningPage = await returningContext.newPage();
    const preparedSignin = await prepareBetterAuthEmailOtp(returningPage, {
      email,
      entryPath: '/signin',
    });
    try {
      const authNavigation = returningPage.waitForURL(
        url => !/\/(sign-in|signin|sign-up|signup)(\/|$)/.test(url.pathname),
        { timeout: 30_000 }
      );
      void authNavigation.catch(() => undefined);
      const returningAuth = await preparedSignin.submit();
      expect(returningAuth.betterAuthUserId).toBe(betterAuthUserId);
      await authNavigation;
    } finally {
      await preparedSignin.dispose();
    }

    const returningUsage =
      await returningPage.request.get('/api/usage/summary');
    expect(returningUsage.ok()).toBeTruthy();
    expect(await returningUsage.json()).toMatchObject({ plan: 'pro' });
    expect(await getBillingStatus(returningPage)).toMatchObject({
      isPro: true,
      plan: 'pro',
      stripeCustomerId: customerId,
      stripeSubscriptionId: completed.subscriptionId,
    });

    const paidSubscription = await stripeClient.subscriptions.retrieve(
      completed.subscriptionId
    );
    const invoiceId =
      typeof paidSubscription.latest_invoice === 'string'
        ? paidSubscription.latest_invoice
        : paidSubscription.latest_invoice?.id;
    if (!invoiceId) {
      throw new Error('Paid test subscription omitted its latest invoice');
    }
    const paidInvoice = await stripeClient.invoices.retrieve(invoiceId);
    expect(paidInvoice.livemode).toBe(false);
    expect(paidInvoice.status).toBe('paid');
    expect(paidInvoice.amount_paid).toBeGreaterThan(0);

    const paymentWebhook = createSignedStripeWebhook(
      stripeClient,
      'invoice.payment_succeeded',
      paidInvoice,
      `evt_invoice_paid_${runId.replaceAll('-', '_')}`
    );
    stripeEventIds.push(paymentWebhook.eventId);
    const paymentResponse = await postStripeWebhook(page, paymentWebhook);
    expect(paymentResponse.ok()).toBeTruthy();

    await expect
      .poll(() => readCommission(invoiceId), { timeout: 30_000 })
      .toMatchObject({
        stripeInvoiceId: invoiceId,
        amountCents: Math.round((paidInvoice.amount_paid * 5000) / 10000),
        currency: paidInvoice.currency,
        status: 'pending',
      });

    const charges = await stripeClient.charges.list({
      customer: customerId!,
      limit: 100,
    });
    const paidCharge = charges.data.find(candidate => {
      const chargeInvoiceId =
        typeof candidate.invoice === 'string'
          ? candidate.invoice
          : candidate.invoice?.id;
      return chargeInvoiceId === invoiceId;
    });
    if (!paidCharge) {
      throw new Error('Paid test invoice did not expose its Stripe charge');
    }
    expect(paidCharge.livemode).toBe(false);

    const partialAmount = Math.floor(paidCharge.amount / 2);
    expect(partialAmount).toBeGreaterThan(0);
    expect(partialAmount).toBeLessThan(paidCharge.amount);
    const partialRefund = await stripeClient.refunds.create(
      { charge: paidCharge.id, amount: partialAmount },
      { idempotencyKey: `jovie-refund-e2e:${runId}:partial` }
    );
    expect(partialRefund.livemode).toBe(false);

    const partiallyRefundedCharge = await stripeClient.charges.retrieve(
      paidCharge.id
    );
    expect(partiallyRefundedCharge.amount_refunded).toBe(partialAmount);
    expect(partiallyRefundedCharge.refunded).toBe(false);

    const partialRefundWebhook = createSignedStripeWebhook(
      stripeClient,
      'charge.refunded',
      partiallyRefundedCharge,
      `evt_refund_partial_${runId.replaceAll('-', '_')}`
    );
    stripeEventIds.push(partialRefundWebhook.eventId);
    const partialResponse = await postStripeWebhook(page, partialRefundWebhook);
    expect(partialResponse.ok()).toBeTruthy();
    await expect
      .poll(async () => (await getBillingStatus(page)).isPro, {
        timeout: 30_000,
      })
      .toBe(true);
    expect(await readCommission(invoiceId)).toMatchObject({
      status: 'pending',
    });

    const partialDuplicateResponse = await postStripeWebhook(
      page,
      partialRefundWebhook
    );
    expect(partialDuplicateResponse.status()).toBe(200);
    const [partialEventCount] = await sql`
      SELECT COUNT(*)::int AS count
      FROM stripe_webhook_events
      WHERE stripe_event_id = ${partialRefundWebhook.eventId}
    `;
    expect(partialEventCount?.count).toBe(1);

    const remainingAmount =
      partiallyRefundedCharge.amount - partiallyRefundedCharge.amount_refunded;
    expect(remainingAmount).toBeGreaterThan(0);
    const finalRefund = await stripeClient.refunds.create(
      { charge: paidCharge.id, amount: remainingAmount },
      { idempotencyKey: `jovie-refund-e2e:${runId}:final` }
    );
    expect(finalRefund.livemode).toBe(false);

    const fullyRefundedCharge = await stripeClient.charges.retrieve(
      paidCharge.id
    );
    expect(fullyRefundedCharge.refunded).toBe(true);
    expect(fullyRefundedCharge.amount_refunded).toBe(
      fullyRefundedCharge.amount
    );

    const fullRefundWebhook = createSignedStripeWebhook(
      stripeClient,
      'charge.refunded',
      fullyRefundedCharge,
      `evt_refund_full_${runId.replaceAll('-', '_')}`
    );
    stripeEventIds.push(fullRefundWebhook.eventId);

    // Model Stripe retrying an event left durably recorded after an earlier
    // attempt failed before completion. The signed delivery must claim it.
    await sql`
      INSERT INTO stripe_webhook_events (
        stripe_event_id,
        type,
        stripe_object_id,
        payload,
        stripe_created_at
      )
      VALUES (
        ${fullRefundWebhook.eventId},
        'charge.refunded',
        ${fullyRefundedCharge.id},
        ${JSON.stringify(JSON.parse(fullRefundWebhook.payload))}::jsonb,
        to_timestamp(${Math.floor(Date.now() / 1000)})
      )
    `;

    const fullRefundResponse = await postStripeWebhook(page, fullRefundWebhook);
    expect(fullRefundResponse.ok()).toBeTruthy();
    await expect
      .poll(async () => (await getBillingStatus(page)).isPro, {
        timeout: 30_000,
      })
      .toBe(false);
    expect(await readCommission(invoiceId)).toMatchObject({
      status: 'cancelled',
    });
    expect(
      await stripeClient.subscriptions.retrieve(completed.subscriptionId)
    ).toMatchObject({
      status: 'canceled',
    });

    const fullDuplicateResponse = await postStripeWebhook(
      page,
      fullRefundWebhook
    );
    expect(fullDuplicateResponse.status()).toBe(200);
    const [fullEventCount] = await sql`
      SELECT COUNT(*)::int AS count
      FROM stripe_webhook_events
      WHERE stripe_event_id = ${fullRefundWebhook.eventId}
    `;
    expect(fullEventCount?.count).toBe(1);

    const [refundAudit] = await sql`
      SELECT event_type AS "eventType", source
      FROM billing_audit_log
      WHERE user_id = ${appUserId}
        AND stripe_event_id = ${fullRefundWebhook.eventId}
    `;
    expect(refundAudit).toMatchObject({
      eventType: 'charge_refunded',
      source: 'webhook',
    });
  } finally {
    await returningContext?.close();

    if (appUserId) {
      if (checkoutSessionId) {
        await expireRunOwnedTestCheckoutSession(
          stripeClient,
          checkoutSessionId,
          appUserId
        );
      }
      const databaseCustomerId = (await readMoneyUser())?.stripeCustomerId;
      const cleanupCustomerIds = new Set(
        [customerId, databaseCustomerId].filter(
          (value): value is string => typeof value === 'string'
        )
      );
      const discoveredCustomerIds = await findRunOwnedStripeCustomerIds(
        stripeClient,
        appUserId,
        email
      );
      discoveredCustomerIds.forEach(id => cleanupCustomerIds.add(id));

      for (const cleanupCustomerId of cleanupCustomerIds) {
        await deleteRunOwnedStripeCustomer(
          stripeClient,
          cleanupCustomerId,
          appUserId,
          email
        );
      }
    }
    for (const cleanupEventId of stripeEventIds) {
      await sql`
        DELETE FROM stripe_webhook_events
        WHERE stripe_event_id = ${cleanupEventId}
      `;
    }
    if (appUserId && betterAuthUserId) {
      const deletedUsers = await sql`
        DELETE FROM users
        WHERE id = ${appUserId}
          AND better_auth_user_id = ${betterAuthUserId}
          AND email = ${email}
        RETURNING id
      `;
      expect(deletedUsers).toHaveLength(1);
      const deletedAuthUsers = await sql`
        DELETE FROM ba_users
        WHERE id = ${betterAuthUserId} AND email = ${email}
        RETURNING id
      `;
      expect(deletedAuthUsers).toHaveLength(1);
    }
    if (referrerUserId) {
      const deletedReferrer = await sql`
        DELETE FROM users
        WHERE id = ${referrerUserId}
          AND email = ${`money-referrer-${runId}@test.jovie.com`}
        RETURNING id
      `;
      expect(deletedReferrer).toHaveLength(1);
    }
  }
});
