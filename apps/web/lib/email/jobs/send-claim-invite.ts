/**
 * Send Claim Invite Job Processor
 *
 * Processes jobs that send claim invite emails to creators.
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbOrTransaction } from '@/lib/db';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema';
import { enrollInCampaign } from '@/lib/email/campaigns/enrollment';
import {
  type ClaimInviteTemplateData,
  getClaimInviteEmail,
} from '@/lib/email/templates/claim-invite';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

/**
 * Shared email provider instance (singleton).
 * Avoids creating a new provider for each job.
 */
let emailProviderInstance: ResendEmailProvider | null = null;

function getEmailProvider(): ResendEmailProvider {
  emailProviderInstance ??= new ResendEmailProvider();
  return emailProviderInstance;
}

/**
 * Payload schema for send_claim_invite jobs.
 */
export const sendClaimInvitePayloadSchema = z.object({
  inviteId: z.string().uuid(),
  creatorProfileId: z.string().uuid(),
});

export type SendClaimInvitePayload = z.infer<
  typeof sendClaimInvitePayloadSchema
>;

/**
 * Result of processing a send_claim_invite job.
 */
export interface SendClaimInviteResult {
  inviteId: string;
  email: string;
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
}

/**
 * Process a send_claim_invite job.
 *
 * 1. Fetches the invite and profile
 * 2. Validates the profile is unclaimed and has a claim token
 * 3. Generates email content
 * 4. Sends via Resend
 * 5. Updates invite status
 */
export async function processSendClaimInviteJob(
  tx: DbOrTransaction,
  jobPayload: unknown
): Promise<SendClaimInviteResult> {
  const payload = sendClaimInvitePayloadSchema.parse(jobPayload);

  // Fetch the invite
  const [invite] = await tx
    .select({
      id: creatorClaimInvites.id,
      email: creatorClaimInvites.email,
      status: creatorClaimInvites.status,
      creatorProfileId: creatorClaimInvites.creatorProfileId,
    })
    .from(creatorClaimInvites)
    .where(eq(creatorClaimInvites.id, payload.inviteId))
    .limit(1);

  if (!invite) {
    throw new Error(`Invite not found: ${payload.inviteId}`);
  }

  // Skip if already sent or failed
  if (invite.status === 'sent') {
    logger.info('Claim invite already sent, skipping', {
      inviteId: invite.id,
    });
    return {
      inviteId: invite.id,
      email: invite.email,
      status: 'skipped',
      detail: 'Already sent',
    };
  }

  // Fetch the profile
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isClaimed: creatorProfiles.isClaimed,
      claimToken: creatorProfiles.claimToken,
      fitScore: creatorProfiles.fitScore,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, payload.creatorProfileId))
    .limit(1);

  if (!profile) {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'failed',
        error: 'Profile not found',
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    throw new Error(`Profile not found: ${payload.creatorProfileId}`);
  }

  // Profile already claimed - mark as skipped (not an error, just no longer needed)
  if (profile.isClaimed) {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'sent', // Mark as sent since we're done with it (no need to retry)
        error: 'Profile already claimed - invite not needed',
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    return {
      inviteId: invite.id,
      email: invite.email,
      status: 'skipped',
      detail: 'Profile already claimed',
    };
  }

  if (!profile.claimToken) {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'failed',
        error: 'Profile has no claim token',
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    throw new Error(`Profile has no claim token: ${profile.id}`);
  }

  // Check if the email is suppressed (user unsubscribed or bounced)
  const suppressionCheck = await isEmailSuppressed(invite.email);
  if (suppressionCheck.suppressed) {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'sent', // Mark as sent to avoid retrying
        error: `Email suppressed: ${suppressionCheck.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    logger.info('Claim invite skipped due to email suppression', {
      inviteId: invite.id,
      emailDomain: invite.email.split('@')[1], // Log domain only for PII protection
      reason: suppressionCheck.reason,
    });

    return {
      inviteId: invite.id,
      email: invite.email,
      status: 'skipped',
      detail: `Email suppressed: ${suppressionCheck.reason}`,
    };
  }

  // Mark as sending
  await tx
    .update(creatorClaimInvites)
    .set({
      status: 'sending',
      updatedAt: new Date(),
    })
    .where(eq(creatorClaimInvites.id, invite.id));

  // Generate email content (inviteId enables tracking)
  const templateData: ClaimInviteTemplateData = {
    creatorName: profile.displayName || profile.username,
    username: profile.username,
    claimToken: profile.claimToken,
    avatarUrl: profile.avatarUrl,
    fitScore: profile.fitScore,
    recipientEmail: invite.email,
    inviteId: invite.id,
  };

  const emailContent = getClaimInviteEmail(templateData);

  // Send via Resend (using singleton provider)
  const emailProvider = getEmailProvider();
  const result = await emailProvider.sendEmail({
    to: invite.email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  // Update invite status based on result
  if (result.status === 'sent') {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'sent',
        sentAt: new Date(),
        subject: emailContent.subject,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    logger.info('Claim invite email sent', {
      inviteId: invite.id,
      emailDomain: invite.email.split('@')[1], // Log domain only for PII protection
      profileUsername: profile.username,
      resendId: result.detail,
    });

    // Enroll in drip campaign for follow-ups (72 hours = 3 days until first follow-up)
    enrollInCampaign({
      campaignKey: 'claim_invite_drip',
      subjectId: profile.id,
      recipientEmail: invite.email,
      delayHours: 72,
    }).catch(error => {
      // Don't fail the job if campaign enrollment fails
      logger.error('Failed to enroll in drip campaign', {
        inviteId: invite.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return {
      inviteId: invite.id,
      email: invite.email,
      status: 'sent',
      detail: result.detail,
    };
  } else if (result.status === 'skipped') {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'pending', // Keep pending so it can be retried
        error: result.detail || 'Email sending skipped',
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    return {
      inviteId: invite.id,
      email: invite.email,
      status: 'skipped',
      detail: result.detail,
    };
  } else {
    await tx
      .update(creatorClaimInvites)
      .set({
        status: 'failed',
        error: result.error || 'Unknown email error',
        updatedAt: new Date(),
      })
      .where(eq(creatorClaimInvites.id, invite.id));

    throw new Error(`Email send failed: ${result.error}`);
  }
}

/**
 * Job configuration for the send_claim_invite job type.
 */
export const sendClaimInviteJobConfig = {
  jobType: 'send_claim_invite' as const,
  payloadSchema: sendClaimInvitePayloadSchema,
  maxAttempts: 3,
};
