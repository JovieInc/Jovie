/**
 * Billing History API
 * Returns the current user's billing audit log entries
 */

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import {
  getBillingAuditLog,
  getUserBillingInfo,
} from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
} as const;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type BillingHistoryEntry = {
  eventType: string;
  timestamp: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  maskedIdentifier: string | null;
};

const getRecordString = (
  record: Record<string, unknown>,
  key: string
): string | null => {
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

const getRecordNumber = (
  record: Record<string, unknown>,
  key: string
): number | null => {
  const value = record[key];
  return typeof value === 'number' ? value : null;
};

const getRecordBoolean = (
  record: Record<string, unknown>,
  key: string
): boolean | null => {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
};

const maskIdentifier = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, '');
  if (!sanitized) return null;
  const suffix = sanitized.slice(-4);
  return `****${suffix}`;
};

const resolveAmount = (metadata: Record<string, unknown>): number | null => {
  const amount =
    getRecordNumber(metadata, 'amount') ??
    getRecordNumber(metadata, 'amountPaid') ??
    getRecordNumber(metadata, 'amountDue') ??
    getRecordNumber(metadata, 'amount_total') ??
    getRecordNumber(metadata, 'amount_subtotal');
  return amount ?? null;
};

const resolveCurrency = (metadata: Record<string, unknown>): string | null => {
  return (
    getRecordString(metadata, 'currency') ??
    getRecordString(metadata, 'currencyCode')
  );
};

const resolveStatus = (
  metadata: Record<string, unknown>,
  newState: Record<string, unknown>
): string | null => {
  const status =
    getRecordString(metadata, 'subscriptionStatus') ??
    getRecordString(metadata, 'status');
  if (status) return status;

  const plan = getRecordString(newState, 'plan');
  if (plan) return plan;

  const isPro = getRecordBoolean(newState, 'isPro');
  if (isPro === null) return null;
  return isPro ? 'pro' : 'free';
};

const resolveIdentifier = (
  stripeEventId: string | null,
  metadata: Record<string, unknown>,
  fallbackId: string
): string => {
  const metadataId =
    getRecordString(metadata, 'invoiceId') ??
    getRecordString(metadata, 'paymentIntentId') ??
    getRecordString(metadata, 'subscriptionId');
  return stripeEventId ?? metadataId ?? fallbackId;
};

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Get the internal user ID from billing info
    const billingResult = await getUserBillingInfo();
    if (!billingResult.success || !billingResult.data) {
      return NextResponse.json({ entries: [] }, { headers: CACHE_HEADERS });
    }

    const { userId } = billingResult.data;
    const auditResult = await getBillingAuditLog(userId, 50);

    if (!auditResult.success || !auditResult.data) {
      return NextResponse.json({ entries: [] }, { headers: CACHE_HEADERS });
    }

    const entries: BillingHistoryEntry[] = auditResult.data.map(entry => ({
      eventType: entry.eventType,
      timestamp: entry.createdAt.toISOString(),
      amount: resolveAmount(entry.metadata),
      currency: resolveCurrency(entry.metadata),
      status: resolveStatus(entry.metadata, entry.newState),
      maskedIdentifier: maskIdentifier(
        resolveIdentifier(entry.stripeEventId, entry.metadata, entry.id)
      ),
    }));

    return NextResponse.json({ entries }, { headers: CACHE_HEADERS });
  } catch (error) {
    logger.error('Error getting billing history:', error);

    Sentry.captureException(error, {
      level: 'error',
      tags: {
        route: '/api/billing/history',
        errorType: 'billing_error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to get billing history' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
