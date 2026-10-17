import { neon } from '@neondatabase/serverless';
import { type Browser, expect, type Page } from '@playwright/test';
import type Stripe from 'stripe';
import { prepareBetterAuthEmailOtp } from '../../helpers/auth';
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
} from './stripe-helpers';

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

export interface GoldenPathBillingContext {
  readonly appUserId: string;
  readonly betterAuthUserId: string;
  readonly browser: Browser;
  readonly claimId: string;
  readonly conversationId: string;
  readonly databaseUrl: string;
  readonly email: string;
  readonly handle: string;
  readonly page: Page;
  readonly profileId: string;
  readonly spotifyArtistId: string;
}

/** Continue the claimed-profile journey through Stripe and revoked-session return. */
export async function completeGoldenPathBillingJourney({
  appUserId,
  betterAuthUserId,
  browser,
  claimId,
  conversationId,
  databaseUrl,
  email,
  handle,
  page,
  profileId,
  spotifyArtistId,
}: GoldenPathBillingContext): Promise<void> {
  const sql = neon(databaseUrl);
  const runId = [
    process.env.GITHUB_RUN_ID ?? 'local',
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
    Date.now().toString(36),
  ].join('-');
  const { stripeClient, priceId } = await getRequiredStripeTestContext();

  let referrerUserId: string | null = null;
  let checkoutSessionId: string | null = null;
  let customerId: string | null = null;
  let stripeEventId: string | null = null;
  const stripeEventIds: string[] = [];
  let returningContext: Awaited<ReturnType<typeof browser.newContext>> | null =
    null;
  let revokedContext: Awaited<ReturnType<typeof browser.newContext>> | null =
    null;

  const readMoneyUser = async (): Promise<MoneyUserRow | null> => {
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
      WHERE id = ${appUserId}
    `;
    return (user as MoneyUserRow | undefined) ?? null;
  };

  const readJourneyContext = async () => {
    const [context] = await sql`
      SELECT u.active_profile_id AS "activeProfileId",
             cp.spotify_id AS "spotifyArtistId",
             cp.username_normalized AS handle,
             c.user_id AS "conversationUserId",
             c.creator_profile_id AS "conversationProfileId",
             upc.id AS "claimId",
             upc.role AS "claimRole"
      FROM users u
      INNER JOIN creator_profiles cp ON cp.id = ${profileId}
      INNER JOIN chat_conversations c ON c.id = ${conversationId}
      INNER JOIN user_profile_claims upc
        ON upc.id = ${claimId}
       AND upc.user_id = u.id
       AND upc.creator_profile_id = cp.id
      WHERE u.id = ${appUserId}
        AND u.better_auth_user_id = ${betterAuthUserId}
    `;
    return context ?? null;
  };

  const expectJourneyContext = async () => {
    expect(await readJourneyContext()).toMatchObject({
      activeProfileId: profileId,
      claimId,
      claimRole: 'owner',
      conversationProfileId: profileId,
      conversationUserId: appUserId,
      handle,
      spotifyArtistId,
    });
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
    const freshUser = await readMoneyUser();
    expect(freshUser).not.toBeNull();
    expect(freshUser).toMatchObject({
      id: appUserId,
      betterAuthUserId,
      email,
      isPro: false,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    await expectJourneyContext();

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
    const referralCodeId =
      (createdReferralCode?.id as string | undefined) ?? null;
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

    const checkoutCorrelation = {
      claim_id: claimId,
      run_id: conversationId,
      candidate_id: profileId,
      offer_version: 'golden-path-exact-build-v1',
      first_touch: 'anonymous-artist-claim',
    } as const;
    const checkout = await createCheckoutSession(page, priceId, {
      claimId,
      runId: conversationId,
      candidateId: profileId,
      offerVersion: checkoutCorrelation.offer_version,
      firstTouch: checkoutCorrelation.first_touch,
      source: 'onboarding',
      returnTo: '/app/chat?from=onboarding&panel=profile',
    });
    checkoutSessionId = checkout.sessionId;
    const createdSession =
      await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
    if (createdSession.livemode !== false) {
      throw new Error('Created Checkout session must have livemode=false');
    }
    expect(createdSession.mode).toBe('subscription');
    expect(createdSession.metadata?.clerk_user_id).toBe(appUserId);
    expect(createdSession.metadata).toMatchObject(checkoutCorrelation);
    expect(createdSession.success_url).toContain(
      '/app/chat?from=onboarding&panel=profile&upgrade=success'
    );
    expect(createdSession.cancel_url).toContain(
      '/app/chat?from=onboarding&panel=profile&upgrade=cancel'
    );
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
    expect(completed.session.metadata).toMatchObject(checkoutCorrelation);

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

    const duplicateCheckoutResponse = await postStripeWebhook(page, webhook);
    expect(duplicateCheckoutResponse.status()).toBe(200);

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
                   bal.source AS "auditSource",
                   bal.metadata AS "auditMetadata"
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
        auditMetadata: {
          candidateId: profileId,
          claimId,
          firstTouch: checkoutCorrelation.first_touch,
          offerVersion: checkoutCorrelation.offer_version,
          runId: conversationId,
        },
        auditSource: 'webhook',
        processedAt: expect.anything(),
      });

    const [checkoutExactlyOnce] = await sql`
      SELECT (
               SELECT COUNT(*)::int
               FROM stripe_webhook_events
               WHERE stripe_event_id = ${stripeEventId}
             ) AS "webhookCount",
             (
               SELECT COUNT(*)::int
               FROM billing_audit_log
               WHERE user_id = ${appUserId}
                 AND stripe_event_id = ${stripeEventId}
                 AND event_type = 'subscription_created'
             ) AS "auditCount"
    `;
    expect(checkoutExactlyOnce).toMatchObject({
      auditCount: 1,
      webhookCount: 1,
    });
    await expectJourneyContext();

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
    await expectJourneyContext();

    const portalCreatedAfter = Math.floor(Date.now() / 1000) - 60;
    const portalResponse =
      await returningPage.request.post('/api/stripe/portal');
    expect(portalResponse.ok()).toBeTruthy();
    expect(
      portalResponse
        .headers()
        ['cache-control']?.split(',')
        .map(directive => directive.trim().toLowerCase())
    ).toContain('no-store');
    const portalBody = (await portalResponse.json()) as {
      sessionId: string;
      url: string;
    };
    expect(new URL(portalBody.url).hostname).toBe('billing.stripe.com');
    expect(
      typeof portalBody.sessionId === 'string' &&
        portalBody.sessionId.length > 0
    ).toBe(true);
    const expectedPortalReturnUrl = `${process.env.BASE_URL ?? 'http://localhost:3250'}/app`;
    let portalProof: {
      customerMatches: boolean;
      returnUrlMatches: boolean;
      urlMatches: boolean;
      eventIsTestMode: boolean;
      sessionIsTestMode: boolean;
    } | null = null;
    const portalEvidenceDeadline = Date.now() + 30_000;
    // Portal sessions expose create only. Read the original session's documented
    // creation event rather than inventing a retrieve API or creating a substitute.
    // Keep bearer URLs and fixture identity out of poll/assertion diagnostics.
    await expect
      .poll(
        async () => {
          let startingAfter: string | undefined;
          for (let batch = 0; batch < 3; batch++) {
            const remaining = portalEvidenceDeadline - Date.now();
            if (remaining <= 0)
              throw new Error(
                'Portal creation evidence lookup deadline elapsed'
              );
            const events = await stripeClient.events.list(
              {
                type: 'billing_portal.session.created',
                created: { gte: portalCreatedAfter },
                limit: 100,
                ...(startingAfter ? { starting_after: startingAfter } : {}),
              },
              { timeout: Math.min(5000, remaining), maxNetworkRetries: 0 }
            );
            const event = events.data.find(
              (
                candidate
              ): candidate is Stripe.BillingPortalSessionCreatedEvent =>
                candidate.type === 'billing_portal.session.created' &&
                candidate.data.object.object === 'billing_portal.session' &&
                candidate.data.object.id === portalBody.sessionId
            );
            if (event) {
              const session = event.data.object;
              portalProof = {
                customerMatches: session.customer === customerId,
                returnUrlMatches:
                  session.return_url === expectedPortalReturnUrl,
                urlMatches: session.url === portalBody.url,
                eventIsTestMode: event.livemode === false,
                sessionIsTestMode: session.livemode === false,
              };
              return true;
            }
            if (!events.has_more) return false;
            startingAfter = events.data.at(-1)?.id;
            if (!startingAfter || batch === 2) {
              throw new Error(
                'Portal creation evidence truncated after bounded event lookup'
              );
            }
          }
          return false;
        },
        {
          message: 'Original test-mode portal creation evidence is required',
          timeout: 30_000,
          intervals: [500, 1000, 2000],
        }
      )
      .toBe(true);
    expect(portalProof).toEqual({
      customerMatches: true,
      returnUrlMatches: true,
      urlMatches: true,
      eventIsTestMode: true,
      sessionIsTestMode: true,
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

    // Stripe API 2026-08-26.dahlia links invoices to payments only through
    // InvoicePayments; Charge.invoice no longer exists.
    const invoicePayments = await stripeClient.invoicePayments.list({
      invoice: invoiceId,
      status: 'paid',
      limit: 1,
    });
    const paymentIntentRef = invoicePayments.data[0]?.payment?.payment_intent;
    const paymentIntentId =
      typeof paymentIntentRef === 'string'
        ? paymentIntentRef
        : paymentIntentRef?.id;
    const paymentIntent = paymentIntentId
      ? await stripeClient.paymentIntents.retrieve(paymentIntentId)
      : null;
    const latestCharge = paymentIntent?.latest_charge;
    const paidCharge = latestCharge
      ? await stripeClient.charges.retrieve(
          typeof latestCharge === 'string' ? latestCharge : latestCharge.id
        )
      : null;
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
    // Refunds carry no livemode; bind them to the test-mode charge instead.
    expect(partialRefund.charge).toBe(paidCharge.id);
    expect(partialRefund.status).not.toBe('failed');

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
    expect(finalRefund.charge).toBe(paidCharge.id);
    expect(finalRefund.status).not.toBe('failed');

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
    expect(await readMoneyUser()).toMatchObject({
      isPro: false,
      plan: 'free',
      stripeCustomerId: customerId,
    });
    await expectJourneyContext();

    // Keep the signed browser cookies, revoke their backing database sessions,
    // then prove neither the billing read cache nor the portal mutation accepts
    // those cookies. The second read catches accidental cache resurrection.
    const revokedStorageState = await returningContext.storageState();
    const revokedSessions = await sql`
      DELETE FROM ba_sessions
      WHERE user_id = ${betterAuthUserId}
      RETURNING id
    `;
    expect(revokedSessions.length).toBeGreaterThan(0);
    revokedContext = await browser.newContext({
      baseURL: process.env.BASE_URL ?? 'http://localhost:3250',
      storageState: revokedStorageState,
    });
    const revokedPage = await revokedContext.newPage();
    for (let attempt = 0; attempt < 2; attempt++) {
      const revokedBilling = await revokedPage.request.get(
        '/api/billing/status',
        { headers: { 'cache-control': 'no-cache' } }
      );
      expect(revokedBilling.status()).toBe(401);
      expect(
        revokedBilling
          .headers()
          ['cache-control']?.split(',')
          .map(directive => directive.trim().toLowerCase())
      ).toContain('no-store');
    }
    const revokedPortal = await revokedPage.request.post('/api/stripe/portal');
    expect(revokedPortal.status()).toBe(401);
    expect(
      revokedPortal
        .headers()
        ['cache-control']?.split(',')
        .map(directive => directive.trim().toLowerCase())
    ).toContain('no-store');
  } finally {
    await revokedContext?.close();
    await returningContext?.close();

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
    for (const cleanupEventId of stripeEventIds) {
      await sql`
        DELETE FROM stripe_webhook_events
        WHERE stripe_event_id = ${cleanupEventId}
      `;
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
}
