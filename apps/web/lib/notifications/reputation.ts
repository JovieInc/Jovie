/**
 * Sender Reputation Service
 *
 * Tracks bounce and complaint rates per creator to protect the platform's
 * sending reputation. Implements automatic warnings and suspensions for
 * creators with poor email hygiene.
 *
 * Thresholds (industry standards):
 * - Bounce rate > 2% = Warning
 * - Bounce rate > 5% = Suspension
 * - Complaint rate > 0.05% = Warning
 * - Complaint rate > 0.1% = Suspension
 */

import { sql as drizzleSql, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type CreatorSendingReputation,
  creatorSendingReputation,
  emailSendAttribution,
} from '@/lib/db/schema/sender';
import { logger } from '@/lib/utils/logger';
import { hashEmail } from './suppression';

/** Reputation thresholds */
export const REPUTATION_THRESHOLDS = {
  bounce: {
    warning: 0.02, // 2%
    suspension: 0.05, // 5%
  },
  complaint: {
    warning: 0.0005, // 0.05%
    suspension: 0.001, // 0.1%
  },
  // Minimum sends before enforcing thresholds (avoid false positives)
  minimumSends: 100,
} as const;

/** Rolling window for rate calculations (30 days in ms) */
const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Attribution expiry (30 days is enough for webhook correlation) */
const ATTRIBUTION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export type SenderStatus =
  | 'good'
  | 'warning'
  | 'probation'
  | 'suspended'
  | 'banned';

export interface ReputationCheckResult {
  canSend: boolean;
  status: SenderStatus;
  reason?: string;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    totalSent: number;
  };
}

export interface ReputationUpdateResult {
  success: boolean;
  newStatus: SenderStatus;
  statusChanged: boolean;
  metrics: {
    bounceRate: number;
    complaintRate: number;
  };
}

/**
 * Get or create reputation record for a creator
 */
export async function getOrCreateReputation(
  creatorProfileId: string
): Promise<CreatorSendingReputation> {
  const now = new Date();

  // Try to get existing reputation
  const [existing] = await db
    .select()
    .from(creatorSendingReputation)
    .where(eq(creatorSendingReputation.creatorProfileId, creatorProfileId))
    .limit(1);

  if (existing) {
    // Reset rolling window if it's expired
    if (existing.rollingWindowResetAt < now) {
      const [updated] = await db
        .update(creatorSendingReputation)
        .set({
          recentSent: 0,
          recentBounced: 0,
          recentComplaints: 0,
          bounceRate: 0,
          complaintRate: 0,
          rollingWindowResetAt: new Date(now.getTime() + ROLLING_WINDOW_MS),
          updatedAt: now,
        })
        .where(eq(creatorSendingReputation.id, existing.id))
        .returning();

      return updated;
    }

    return existing;
  }

  // Create new reputation record
  const [created] = await db
    .insert(creatorSendingReputation)
    .values({
      creatorProfileId,
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalComplaints: 0,
      recentSent: 0,
      recentBounced: 0,
      recentComplaints: 0,
      bounceRate: 0,
      complaintRate: 0,
      status: 'good',
      warningCount: 0,
      rollingWindowResetAt: new Date(now.getTime() + ROLLING_WINDOW_MS),
    })
    .returning();

  return created;
}

/**
 * Check if a creator can send emails based on their reputation
 */
export async function checkReputation(
  creatorProfileId: string
): Promise<ReputationCheckResult> {
  const reputation = await getOrCreateReputation(creatorProfileId);
  const now = new Date();

  // Check if suspended
  if (reputation.status === 'suspended') {
    // Check if suspension has expired
    if (reputation.suspendedUntil && reputation.suspendedUntil < now) {
      // Auto-lift suspension, move to probation
      await db
        .update(creatorSendingReputation)
        .set({
          status: 'probation',
          suspendedAt: null,
          suspendedUntil: null,
          metadata: drizzleSql`${creatorSendingReputation.metadata} || ${JSON.stringify(
            {
              lastStatusChange: now.toISOString(),
              statusReason: 'Suspension expired, moved to probation',
            }
          )}::jsonb`,
          updatedAt: now,
        })
        .where(eq(creatorSendingReputation.id, reputation.id));

      return {
        canSend: true,
        status: 'probation',
        reason: 'Suspension expired, on probation',
        metrics: {
          bounceRate: reputation.bounceRate,
          complaintRate: reputation.complaintRate,
          totalSent: reputation.totalSent,
        },
      };
    }

    return {
      canSend: false,
      status: 'suspended',
      reason:
        reputation.suspensionReason ??
        'Account suspended for poor email reputation',
      metrics: {
        bounceRate: reputation.bounceRate,
        complaintRate: reputation.complaintRate,
        totalSent: reputation.totalSent,
      },
    };
  }

  // Banned accounts cannot send
  if (reputation.status === 'banned') {
    return {
      canSend: false,
      status: 'banned',
      reason: 'Account permanently banned from sending',
      metrics: {
        bounceRate: reputation.bounceRate,
        complaintRate: reputation.complaintRate,
        totalSent: reputation.totalSent,
      },
    };
  }

  // Good, warning, and probation can send
  return {
    canSend: true,
    status: reputation.status as SenderStatus,
    metrics: {
      bounceRate: reputation.bounceRate,
      complaintRate: reputation.complaintRate,
      totalSent: reputation.totalSent,
    },
  };
}

/**
 * Record a successful email send
 */
export async function recordSend(
  creatorProfileId: string,
  providerMessageId: string,
  recipientEmail: string,
  emailType: string,
  referenceId?: string
): Promise<void> {
  const now = new Date();

  // Ensure reputation record exists
  await getOrCreateReputation(creatorProfileId);

  // Increment send counters
  await db
    .update(creatorSendingReputation)
    .set({
      totalSent: drizzleSql`${creatorSendingReputation.totalSent} + 1`,
      recentSent: drizzleSql`${creatorSendingReputation.recentSent} + 1`,
      updatedAt: now,
    })
    .where(eq(creatorSendingReputation.creatorProfileId, creatorProfileId));

  // Create attribution record for webhook correlation
  await db
    .insert(emailSendAttribution)
    .values({
      providerMessageId,
      creatorProfileId,
      recipientHash: hashEmail(recipientEmail),
      emailType,
      referenceId,
      sentAt: now,
      expiresAt: new Date(now.getTime() + ATTRIBUTION_EXPIRY_MS),
    })
    .onConflictDoNothing();
}

/**
 * Record a delivery confirmation
 */
export async function recordDelivery(creatorProfileId: string): Promise<void> {
  const now = new Date();

  await db
    .update(creatorSendingReputation)
    .set({
      totalDelivered: drizzleSql`${creatorSendingReputation.totalDelivered} + 1`,
      updatedAt: now,
    })
    .where(eq(creatorSendingReputation.creatorProfileId, creatorProfileId));
}

/**
 * Calculate new status based on rates
 */
function calculateNewStatus(
  bounceRate: number,
  complaintRate: number,
  currentStatus: SenderStatus,
  totalSent: number
): SenderStatus {
  // Don't change status if not enough data
  if (totalSent < REPUTATION_THRESHOLDS.minimumSends) {
    return currentStatus === 'banned' ? 'banned' : 'good';
  }

  // Check for suspension thresholds
  if (
    bounceRate >= REPUTATION_THRESHOLDS.bounce.suspension ||
    complaintRate >= REPUTATION_THRESHOLDS.complaint.suspension
  ) {
    return 'suspended';
  }

  // Check for warning thresholds
  if (
    bounceRate >= REPUTATION_THRESHOLDS.bounce.warning ||
    complaintRate >= REPUTATION_THRESHOLDS.complaint.warning
  ) {
    return currentStatus === 'probation' ? 'probation' : 'warning';
  }

  // Good standing
  return currentStatus === 'probation' ? 'probation' : 'good';
}

/**
 * Record a bounce event and update reputation
 */
export async function recordBounce(
  creatorProfileId: string
): Promise<ReputationUpdateResult> {
  const now = new Date();

  // Get current reputation
  const reputation = await getOrCreateReputation(creatorProfileId);

  // Calculate new metrics
  const newRecentBounced = reputation.recentBounced + 1;
  const newTotalBounced = reputation.totalBounced + 1;
  const newBounceRate =
    reputation.recentSent > 0 ? newRecentBounced / reputation.recentSent : 0;

  // Determine new status
  const newStatus = calculateNewStatus(
    newBounceRate,
    reputation.complaintRate,
    reputation.status as SenderStatus,
    reputation.totalSent
  );

  const statusChanged = newStatus !== reputation.status;

  // Update reputation
  const updateData: Record<string, unknown> = {
    totalBounced: newTotalBounced,
    recentBounced: newRecentBounced,
    bounceRate: newBounceRate,
    status: newStatus,
    updatedAt: now,
  };

  // Add suspension details if status changed to suspended
  if (newStatus === 'suspended' && statusChanged) {
    updateData.suspendedAt = now;
    updateData.suspendedUntil = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    ); // 7 days
    updateData.suspensionReason = `Bounce rate ${(newBounceRate * 100).toFixed(2)}% exceeds threshold`;
    updateData.metadata = drizzleSql`${creatorSendingReputation.metadata} || ${JSON.stringify(
      {
        lastStatusChange: now.toISOString(),
        statusReason: `Auto-suspended: bounce rate ${(newBounceRate * 100).toFixed(2)}%`,
      }
    )}::jsonb`;

    logger.warn('[reputation] Creator auto-suspended for high bounce rate', {
      creatorProfileId,
      bounceRate: newBounceRate,
      totalSent: reputation.totalSent,
    });
  }

  // Add warning tracking if moved to warning
  if (newStatus === 'warning' && statusChanged) {
    updateData.warningCount = drizzleSql`${creatorSendingReputation.warningCount} + 1`;
    updateData.lastWarningAt = now;
  }

  await db
    .update(creatorSendingReputation)
    .set(updateData)
    .where(eq(creatorSendingReputation.id, reputation.id));

  return {
    success: true,
    newStatus,
    statusChanged,
    metrics: {
      bounceRate: newBounceRate,
      complaintRate: reputation.complaintRate,
    },
  };
}

/**
 * Record a spam complaint and update reputation
 */
export async function recordComplaint(
  creatorProfileId: string
): Promise<ReputationUpdateResult> {
  const now = new Date();

  // Get current reputation
  const reputation = await getOrCreateReputation(creatorProfileId);

  // Calculate new metrics
  const newRecentComplaints = reputation.recentComplaints + 1;
  const newTotalComplaints = reputation.totalComplaints + 1;
  const newComplaintRate =
    reputation.recentSent > 0 ? newRecentComplaints / reputation.recentSent : 0;

  // Determine new status
  const newStatus = calculateNewStatus(
    reputation.bounceRate,
    newComplaintRate,
    reputation.status as SenderStatus,
    reputation.totalSent
  );

  const statusChanged = newStatus !== reputation.status;

  // Update reputation
  const updateData: Record<string, unknown> = {
    totalComplaints: newTotalComplaints,
    recentComplaints: newRecentComplaints,
    complaintRate: newComplaintRate,
    status: newStatus,
    updatedAt: now,
  };

  // Add suspension details if status changed to suspended
  if (newStatus === 'suspended' && statusChanged) {
    updateData.suspendedAt = now;
    updateData.suspendedUntil = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000
    ); // 14 days for complaints
    updateData.suspensionReason = `Complaint rate ${(newComplaintRate * 100).toFixed(3)}% exceeds threshold`;
    updateData.metadata = drizzleSql`${creatorSendingReputation.metadata} || ${JSON.stringify(
      {
        lastStatusChange: now.toISOString(),
        statusReason: `Auto-suspended: complaint rate ${(newComplaintRate * 100).toFixed(3)}%`,
      }
    )}::jsonb`;

    logger.warn('[reputation] Creator auto-suspended for high complaint rate', {
      creatorProfileId,
      complaintRate: newComplaintRate,
      totalSent: reputation.totalSent,
    });
  }

  // Add warning tracking if moved to warning
  if (newStatus === 'warning' && statusChanged) {
    updateData.warningCount = drizzleSql`${creatorSendingReputation.warningCount} + 1`;
    updateData.lastWarningAt = now;
  }

  await db
    .update(creatorSendingReputation)
    .set(updateData)
    .where(eq(creatorSendingReputation.id, reputation.id));

  return {
    success: true,
    newStatus,
    statusChanged,
    metrics: {
      bounceRate: reputation.bounceRate,
      complaintRate: newComplaintRate,
    },
  };
}

/**
 * Look up creator by provider message ID (for webhook attribution)
 */
export async function getCreatorByMessageId(
  providerMessageId: string
): Promise<string | null> {
  const [attribution] = await db
    .select({ creatorProfileId: emailSendAttribution.creatorProfileId })
    .from(emailSendAttribution)
    .where(eq(emailSendAttribution.providerMessageId, providerMessageId))
    .limit(1);

  return attribution?.creatorProfileId ?? null;
}

/**
 * Clean up expired attribution records (for cron job)
 */
export async function cleanupExpiredAttributions(): Promise<number> {
  const now = new Date();

  const result = await db
    .delete(emailSendAttribution)
    .where(lt(emailSendAttribution.expiresAt, now))
    .returning({ id: emailSendAttribution.id });

  return result.length;
}

/**
 * Reset rolling window counters for all creators (for cron job)
 */
export async function resetExpiredRollingWindows(): Promise<number> {
  const now = new Date();
  const nextWindow = new Date(now.getTime() + ROLLING_WINDOW_MS);

  const result = await db
    .update(creatorSendingReputation)
    .set({
      recentSent: 0,
      recentBounced: 0,
      recentComplaints: 0,
      bounceRate: 0,
      complaintRate: 0,
      rollingWindowResetAt: nextWindow,
      updatedAt: now,
    })
    .where(lt(creatorSendingReputation.rollingWindowResetAt, now))
    .returning({ id: creatorSendingReputation.id });

  return result.length;
}

/**
 * Get reputation summary for a creator (for dashboard display)
 */
export async function getReputationSummary(creatorProfileId: string): Promise<{
  status: SenderStatus;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    totalSent: number;
    totalDelivered: number;
  };
  thresholds: {
    bounce: { warning: number; suspension: number };
    complaint: { warning: number; suspension: number };
  };
  suspension?: {
    suspendedAt: Date;
    suspendedUntil: Date | null;
    reason: string | null;
  };
} | null> {
  const reputation = await getOrCreateReputation(creatorProfileId);

  if (!reputation) return null;

  return {
    status: reputation.status as SenderStatus,
    metrics: {
      bounceRate: reputation.bounceRate,
      complaintRate: reputation.complaintRate,
      totalSent: reputation.totalSent,
      totalDelivered: reputation.totalDelivered,
    },
    thresholds: REPUTATION_THRESHOLDS,
    ...(reputation.status === 'suspended' && {
      suspension: {
        suspendedAt: reputation.suspendedAt!,
        suspendedUntil: reputation.suspendedUntil,
        reason: reputation.suspensionReason,
      },
    }),
  };
}
