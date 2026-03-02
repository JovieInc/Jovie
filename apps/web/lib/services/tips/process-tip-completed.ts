/**
 * Process Tip Completed
 *
 * Handles post-tip-completion logic:
 * 1. Upserts the fan into the tip_audience table (deduped by email + profile_id)
 * 2. Increments cumulative tip totals
 * 3. Sends a thank-you email with the creator's music/social links
 *
 * Designed to be called from the Stripe webhook handler after a
 * payment_intent.succeeded event. This is a standalone function that
 * can be imported and called from any webhook handler.
 */

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tipAudience } from '@/lib/db/schema/tip-audience';
import { sendTipThankYouEmail } from '@/lib/email/send';
import { generateUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export interface ProcessTipCompletedParams {
  /** The creator profile ID who received the tip */
  profileId: string;
  /** Tipper's email address */
  email: string;
  /** Tipper's name (from billing details, if available) */
  name?: string | null;
  /** Tip amount in cents */
  amountCents: number;
  /** Source of the audience member */
  source?: 'tip' | 'link_click' | 'save' | 'manual';
  /** Additional metadata to store */
  metadata?: Record<string, unknown>;
}

export interface ProcessTipCompletedResult {
  /** Whether the audience upsert succeeded */
  audienceUpserted: boolean;
  /** Whether the thank-you email was sent */
  emailSent: boolean;
  /** The tip_audience record ID */
  audienceId?: string;
  /** Error details if something failed (non-fatal) */
  errors: string[];
}

/**
 * Process a completed tip: upsert audience record and send thank-you email.
 *
 * This function is designed to be fault-tolerant:
 * - If the audience upsert fails, it still attempts to send the email
 * - If the email fails, the audience record is still preserved
 * - All errors are collected and returned (not thrown)
 */
export async function processTipCompleted(
  params: ProcessTipCompletedParams
): Promise<ProcessTipCompletedResult> {
  const {
    profileId,
    email,
    name,
    amountCents,
    source = 'tip',
    metadata,
  } = params;

  const errors: string[] = [];
  let audienceUpserted = false;
  let emailSent = false;
  let audienceId: string | undefined;

  // 1. Upsert into tip_audience table
  try {
    const now = new Date();
    const [record] = await db
      .insert(tipAudience)
      .values({
        profileId,
        email: email.toLowerCase().trim(),
        name,
        source,
        tipAmountTotalCents: amountCents,
        tipCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        metadata: metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [tipAudience.profileId, tipAudience.email],
        set: {
          name: name ?? drizzleSql`COALESCE(${tipAudience.name}, NULL)`,
          tipAmountTotalCents: drizzleSql`${tipAudience.tipAmountTotalCents} + ${amountCents}`,
          tipCount: drizzleSql`${tipAudience.tipCount} + 1`,
          lastSeenAt: now,
          updatedAt: now,
          // Merge metadata if provided
          ...(metadata
            ? {
                metadata: drizzleSql`COALESCE(${tipAudience.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
              }
            : {}),
        },
      })
      .returning({ id: tipAudience.id });

    if (record) {
      audienceId = record.id;
      audienceUpserted = true;
    }

    logger.info('Tip audience upserted', {
      profileId,
      emailDomain: email.split('@')[1],
      amountCents,
      audienceId: record?.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown upsert error';
    errors.push(`Audience upsert failed: ${message}`);
    captureError('[tips] Failed to upsert tip audience', error, {
      profileId,
      amountCents,
    });
  }

  // 2. Send thank-you email
  try {
    // Check if this fan has unsubscribed
    const [existingRecord] = await db
      .select({ unsubscribed: tipAudience.unsubscribed })
      .from(tipAudience)
      .where(
        and(
          eq(tipAudience.profileId, profileId),
          eq(tipAudience.email, email.toLowerCase().trim())
        )
      )
      .limit(1);

    if (existingRecord?.unsubscribed) {
      logger.info('Skipping tip thank-you email - fan unsubscribed', {
        profileId,
        emailDomain: email.split('@')[1],
      });
      return { audienceUpserted, emailSent: false, audienceId, errors };
    }

    // Fetch creator profile for email personalization
    const [profile] = await db
      .select({
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        avatarUrl: creatorProfiles.avatarUrl,
        spotifyUrl: creatorProfiles.spotifyUrl,
        appleMusicUrl: creatorProfiles.appleMusicUrl,
        youtubeUrl: creatorProfiles.youtubeUrl,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) {
      errors.push('Creator profile not found for email');
      return { audienceUpserted, emailSent: false, audienceId, errors };
    }

    // Fetch social links for the creator
    const creatorSocialLinks = await db
      .select({
        platform: socialLinks.platform,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.isActive, true),
          eq(socialLinks.state, 'active')
        )
      );

    // Filter to social-type links (not music streaming)
    const socialLinksList = creatorSocialLinks
      .filter(
        link =>
          !['spotify', 'apple_music', 'youtube'].includes(
            link.platform.toLowerCase()
          )
      )
      .slice(0, 5) // Cap at 5 social links
      .map(link => ({
        platform: link.platform,
        url: link.url,
      }));

    // Generate unsubscribe token
    const unsubscribeToken = generateUnsubscribeToken(
      email.toLowerCase().trim()
    );

    const result = await sendTipThankYouEmail({
      to: email,
      artistName: profile.displayName || profile.username,
      artistPhoto: profile.avatarUrl,
      amount: amountCents,
      musicLinks: {
        spotify: profile.spotifyUrl,
        appleMusic: profile.appleMusicUrl,
        youtube: profile.youtubeUrl,
      },
      socialLinks: socialLinksList,
      profileHandle: profile.username,
      profileId,
      fanName: name,
      unsubscribeToken,
    });

    emailSent = result.success;
    if (!result.success) {
      errors.push(`Email send failed: ${result.error}`);
    } else {
      logger.info('Tip thank-you email sent', {
        profileId,
        emailDomain: email.split('@')[1],
        messageId: result.messageId,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown email error';
    errors.push(`Email send error: ${message}`);
    captureError('[tips] Failed to send tip thank-you email', error, {
      profileId,
      amountCents,
    });
  }

  return { audienceUpserted, emailSent, audienceId, errors };
}
