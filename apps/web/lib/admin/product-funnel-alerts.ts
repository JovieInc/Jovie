import 'server-only';

import { and, sql as drizzleSql, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  productFunnelAlertStates,
  productFunnelEvents,
} from '@/lib/db/schema/product-funnel';
import { captureError } from '@/lib/error-tracking';
import { sendSlackMessage } from '@/lib/notifications/providers/slack';
import { getConsecutiveSyntheticFailures } from '@/lib/product-funnel/events';

type AlertRuleName =
  | 'signup_completion_stalled'
  | 'onboarding_completion_stalled'
  | 'payment_completion_stalled'
  | 'synthetic_signup_failing';

interface AlertEvaluation {
  readonly ruleName: AlertRuleName;
  readonly shouldAlert: boolean;
  readonly shouldRecover?: boolean;
  readonly reason: string;
  readonly consecutiveFailures: number;
  readonly payload: Record<string, unknown>;
}

interface AlertStateSnapshot {
  readonly status: 'ok' | 'alerting';
  readonly lastTriggeredAt: Date | null;
  readonly lastRecoveredAt: Date | null;
}

function alertText(rule: AlertEvaluation): string {
  return `[Product Funnel] ${rule.reason}`;
}

function recoveryText(rule: AlertEvaluation): string {
  return `[Product Funnel] Recovered: ${rule.ruleName}`;
}

async function get24hEventCounts(now: Date) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      eventType: productFunnelEvents.eventType,
      count: drizzleSql<number>`count(*)`,
    })
    .from(productFunnelEvents)
    .where(
      and(
        eq(productFunnelEvents.isSynthetic, false),
        gte(productFunnelEvents.occurredAt, since),
        inArray(productFunnelEvents.eventType, [
          'signup_started',
          'signup_completed',
          'onboarding_started',
          'onboarding_completed',
          'checkout_started',
          'payment_succeeded',
        ])
      )
    )
    .groupBy(productFunnelEvents.eventType);

  return Object.fromEntries(
    rows.map(row => [row.eventType, Number(row.count ?? 0)])
  ) as Partial<Record<(typeof rows)[number]['eventType'], number>>;
}

async function buildEvaluations(
  now: Date
): Promise<readonly AlertEvaluation[]> {
  const counts = await get24hEventCounts(now);
  const syntheticFailures = await getConsecutiveSyntheticFailures(
    'synthetic_signup',
    now
  );

  const signupStarted = counts.signup_started ?? 0;
  const signupCompleted = counts.signup_completed ?? 0;
  const onboardingStarted = counts.onboarding_started ?? 0;
  const onboardingCompleted = counts.onboarding_completed ?? 0;
  const checkoutStarted = counts.checkout_started ?? 0;
  const paymentSucceeded = counts.payment_succeeded ?? 0;

  return [
    {
      ruleName: 'signup_completion_stalled',
      shouldAlert: signupStarted > 5 && signupCompleted === 0,
      shouldRecover: signupCompleted > 0,
      reason: `Signup started is ${signupStarted} in the last 24h and signup completed is 0.`,
      consecutiveFailures: 0,
      payload: { signupStarted, signupCompleted },
    },
    {
      ruleName: 'onboarding_completion_stalled',
      shouldAlert: onboardingStarted > 5 && onboardingCompleted === 0,
      shouldRecover: onboardingCompleted > 0,
      reason: `Onboarding started is ${onboardingStarted} in the last 24h and onboarding completed is 0.`,
      consecutiveFailures: 0,
      payload: { onboardingStarted, onboardingCompleted },
    },
    {
      ruleName: 'payment_completion_stalled',
      shouldAlert: checkoutStarted > 2 && paymentSucceeded === 0,
      shouldRecover: paymentSucceeded > 0,
      reason: `Checkout started is ${checkoutStarted} in the last 24h and payment succeeded is 0.`,
      consecutiveFailures: 0,
      payload: { checkoutStarted, paymentSucceeded },
    },
    {
      ruleName: 'synthetic_signup_failing',
      shouldAlert: syntheticFailures >= 2,
      reason: `Synthetic signup failed ${syntheticFailures} consecutive runs.`,
      consecutiveFailures: syntheticFailures,
      payload: { syntheticFailures },
    },
  ];
}

function buildAlertStatePayload(input: {
  readonly current: AlertStateSnapshot | undefined;
  readonly evaluation: AlertEvaluation;
  readonly nextStatus: 'ok' | 'alerting';
  readonly now: Date;
}) {
  const { current, evaluation, nextStatus, now } = input;

  return {
    status: nextStatus,
    lastEvaluatedAt: now,
    lastTriggeredAt:
      nextStatus === 'alerting'
        ? current?.status === 'alerting'
          ? current.lastTriggeredAt
          : now
        : (current?.lastTriggeredAt ?? null),
    lastRecoveredAt:
      current?.status === 'alerting' && nextStatus === 'ok'
        ? now
        : (current?.lastRecoveredAt ?? null),
    consecutiveFailures: evaluation.consecutiveFailures,
    lastPayload: {
      ...evaluation.payload,
      reason: evaluation.reason,
    },
    updatedAt: now,
  };
}

export async function evaluateProductFunnelAlerts(now = new Date()) {
  const evaluations = await buildEvaluations(now);
  const currentStates = await db.select().from(productFunnelAlertStates);
  const stateByRule = new Map(
    currentStates.map(state => [state.ruleName, state])
  );

  const triggered: string[] = [];
  const recovered: string[] = [];
  const notifications: Array<Promise<unknown>> = [];

  for (const evaluation of evaluations) {
    const current = stateByRule.get(evaluation.ruleName);
    const shouldRecover = evaluation.shouldRecover ?? !evaluation.shouldAlert;
    const nextStatus: 'ok' | 'alerting' =
      current?.status === 'alerting'
        ? shouldRecover
          ? 'ok'
          : 'alerting'
        : evaluation.shouldAlert
          ? 'alerting'
          : 'ok';
    const alertState = buildAlertStatePayload({
      current,
      evaluation,
      nextStatus,
      now,
    });

    if (current?.status !== 'alerting' && nextStatus === 'alerting') {
      triggered.push(evaluation.ruleName);
      notifications.push(sendSlackMessage({ text: alertText(evaluation) }));
    }

    if (current?.status === 'alerting' && nextStatus === 'ok') {
      recovered.push(evaluation.ruleName);
      notifications.push(sendSlackMessage({ text: recoveryText(evaluation) }));
    }

    await db
      .insert(productFunnelAlertStates)
      .values({
        ruleName: evaluation.ruleName,
        ...alertState,
      })
      .onConflictDoUpdate({
        target: productFunnelAlertStates.ruleName,
        set: alertState,
      });
  }

  await Promise.allSettled(notifications);

  return {
    evaluatedAt: now,
    triggered,
    recovered,
  };
}

export async function safeEvaluateProductFunnelAlerts(now = new Date()) {
  try {
    return await evaluateProductFunnelAlerts(now);
  } catch (error) {
    await captureError('Product funnel alert evaluation failed', error, {
      route: 'lib/admin/product-funnel-alerts',
    });
    return {
      evaluatedAt: now,
      triggered: [],
      recovered: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
