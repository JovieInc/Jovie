/**
 * DSP Bio Sync Service
 *
 * Orchestrates pushing artist bio updates to DSPs.
 * - For email-based DSPs: sends a professional bio update request email via Resend
 * - For API-based DSPs: calls the DSP's API (stubbed for future OAuth integration)
 *
 * All sync attempts are tracked in the dsp_bio_sync_requests table.
 */

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type DspBioSyncMetadata,
  dspBioSyncRequests,
} from '@/lib/db/schema/dsp-bio-sync';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type DspBioUpdateTemplateData,
  getDspBioUpdateEmail,
} from '@/lib/email/templates/dsp-bio-update';
import { captureError } from '@/lib/error-tracking';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import {
  type DspBioProvider,
  getBioProvider,
  getEnabledBioProviders,
} from './providers';

// ============================================================================
// Types
// ============================================================================

export interface BioSyncRequest {
  creatorProfileId: string;
  /** Specific DSP IDs to sync to, or undefined to sync to all enabled DSPs */
  providerIds?: string[];
  /** The bio text to push. If omitted, uses the current bio from creator_profiles */
  bioText?: string;
}

export interface BioSyncResult {
  providerId: string;
  method: 'api' | 'email';
  status: 'sent' | 'failed' | 'unsupported';
  syncRequestId: string;
  error?: string;
}

export interface BioSyncResponse {
  success: boolean;
  results: BioSyncResult[];
  /** Number of DSPs where bio was successfully sent */
  sentCount: number;
  /** Number of DSPs where bio sync failed */
  failedCount: number;
}

// ============================================================================
// Service
// ============================================================================

const emailProvider = new ResendEmailProvider();

/**
 * Process a single DSP provider sync, handling both email and API methods.
 * Catches and records failures as tracking records.
 */
async function processSingleProvider(params: {
  profile: typeof creatorProfiles.$inferSelect;
  providerId: string;
  provider: DspBioProvider;
  match: typeof dspArtistMatches.$inferSelect | undefined;
  bioText: string;
  creatorProfileId: string;
}): Promise<BioSyncResult | null> {
  const { profile, providerId, provider, match, bioText, creatorProfileId } =
    params;

  try {
    if (provider.method === 'email') {
      return await syncBioViaEmail({
        profile,
        providerId,
        provider,
        match,
        bioText,
      });
    }
    if (provider.method === 'api') {
      return await syncBioViaApi({
        profile,
        providerId,
        provider,
        match,
        bioText,
      });
    }
    return null;
  } catch (error) {
    await captureError(
      `[dsp-bio-sync] Failed to sync bio to ${providerId}`,
      error,
      { creatorProfileId, providerId }
    );

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorDetail = error instanceof Error ? error.stack : String(error);

    const [syncRequest] = await db
      .insert(dspBioSyncRequests)
      .values({
        creatorProfileId,
        providerId,
        method: provider.method,
        status: 'failed',
        bioText,
        error: errorMessage,
        metadata: {
          bioSnapshot: bioText,
          errorDetail,
        } satisfies DspBioSyncMetadata,
      })
      .returning({ id: dspBioSyncRequests.id });

    return {
      providerId,
      method: provider.method,
      status: 'failed',
      syncRequestId: syncRequest.id,
      error: errorMessage,
    };
  }
}

/**
 * Sync an artist's bio to one or more DSPs.
 *
 * For each targeted DSP:
 * 1. Looks up the artist's external ID/URL on that DSP
 * 2. Creates a tracking record in dsp_bio_sync_requests
 * 3. Sends the bio update via email or API
 * 4. Updates the tracking record with the result
 */
export async function syncBioToDsps(
  request: BioSyncRequest
): Promise<BioSyncResponse> {
  const { creatorProfileId, providerIds } = request;

  // Fetch the creator profile
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Creator profile not found: ${creatorProfileId}`);
  }

  const bioText = request.bioText ?? profile.bio;
  if (!bioText?.trim()) {
    throw new Error('No bio text provided and profile has no existing bio');
  }

  // Determine which DSPs to target
  const targetProviders = providerIds
    ? providerIds
        .map(id => [id, getBioProvider(id)] as const)
        .filter((entry): entry is [string, DspBioProvider] => {
          return entry[1] !== undefined && entry[1].enabled;
        })
    : getEnabledBioProviders();

  if (targetProviders.length === 0) {
    return {
      success: true,
      results: [],
      sentCount: 0,
      failedCount: 0,
    };
  }

  // Fetch confirmed DSP matches for this profile (for external IDs/URLs)
  const dspMatches = await db
    .select()
    .from(dspArtistMatches)
    .where(
      and(
        eq(dspArtistMatches.creatorProfileId, creatorProfileId),
        eq(dspArtistMatches.status, 'confirmed')
      )
    );

  const matchesByProvider = new Map(dspMatches.map(m => [m.providerId, m]));

  // Process each DSP
  const results: BioSyncResult[] = [];

  for (const [providerId, provider] of targetProviders) {
    const match = matchesByProvider.get(providerId);
    const result = await processSingleProvider({
      profile,
      providerId,
      provider,
      match,
      bioText,
      creatorProfileId,
    });
    if (result) results.push(result);
  }

  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return {
    success: failedCount === 0,
    results,
    sentCount,
    failedCount,
  };
}

// ============================================================================
// Email-based sync
// ============================================================================

interface SyncParams {
  profile: typeof creatorProfiles.$inferSelect;
  providerId: string;
  provider: DspBioProvider;
  match: typeof dspArtistMatches.$inferSelect | undefined;
  bioText: string;
}

async function syncBioViaEmail(params: SyncParams): Promise<BioSyncResult> {
  const { profile, providerId, provider, match, bioText } = params;

  if (!provider.supportEmail) {
    const [syncRequest] = await db
      .insert(dspBioSyncRequests)
      .values({
        creatorProfileId: profile.id,
        providerId,
        method: 'email',
        status: 'unsupported',
        bioText,
        error: `No support email configured for ${provider.displayName}`,
        metadata: { bioSnapshot: bioText } satisfies DspBioSyncMetadata,
      })
      .returning({ id: dspBioSyncRequests.id });

    return {
      providerId,
      method: 'email',
      status: 'unsupported',
      syncRequestId: syncRequest.id,
      error: `No support email configured for ${provider.displayName}`,
    };
  }

  // Create pending tracking record
  const [syncRequest] = await db
    .insert(dspBioSyncRequests)
    .values({
      creatorProfileId: profile.id,
      providerId,
      method: 'email',
      status: 'sending',
      bioText,
      metadata: {
        sentToEmail: provider.supportEmail,
        bioSnapshot: bioText,
      } satisfies DspBioSyncMetadata,
    })
    .returning({ id: dspBioSyncRequests.id });

  // Build email template data
  const templateData: DspBioUpdateTemplateData = {
    artistName: profile.displayName || profile.username,
    username: profile.username,
    dspDisplayName: provider.displayName,
    externalArtistId: match?.externalArtistId,
    externalArtistUrl: match?.externalArtistUrl,
    bioText,
    spotifyId: profile.spotifyId,
    spotifyUrl: profile.spotifyUrl,
  };

  const emailContent = getDspBioUpdateEmail(templateData);

  // Send via Resend
  const result = await emailProvider.sendEmail({
    to: provider.supportEmail,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  if (result.status === 'sent') {
    // Update tracking record to sent
    await db
      .update(dspBioSyncRequests)
      .set({
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          sentToEmail: provider.supportEmail,
          providerMessageId: result.detail,
          bioSnapshot: bioText,
        } satisfies DspBioSyncMetadata,
        updatedAt: new Date(),
      })
      .where(eq(dspBioSyncRequests.id, syncRequest.id));

    return {
      providerId,
      method: 'email',
      status: 'sent',
      syncRequestId: syncRequest.id,
    };
  }

  // Email failed
  await db
    .update(dspBioSyncRequests)
    .set({
      status: 'failed',
      error: result.error ?? 'Email send failed',
      metadata: {
        sentToEmail: provider.supportEmail,
        errorDetail: result.error,
        bioSnapshot: bioText,
      } satisfies DspBioSyncMetadata,
      updatedAt: new Date(),
    })
    .where(eq(dspBioSyncRequests.id, syncRequest.id));

  return {
    providerId,
    method: 'email',
    status: 'failed',
    syncRequestId: syncRequest.id,
    error: result.error ?? 'Email send failed',
  };
}

// ============================================================================
// API-based sync (stub for future OAuth integration)
// ============================================================================

async function syncBioViaApi(params: SyncParams): Promise<BioSyncResult> {
  const { profile, providerId, provider, bioText } = params;

  // API-based providers are not yet implemented - they require OAuth tokens
  // from the artist's connected DSP accounts
  const [syncRequest] = await db
    .insert(dspBioSyncRequests)
    .values({
      creatorProfileId: profile.id,
      providerId,
      method: 'api',
      status: 'unsupported',
      bioText,
      error: `API-based bio sync for ${provider.displayName} requires OAuth connection (coming soon)`,
      metadata: {
        bioSnapshot: bioText,
        apiEndpoint: provider.artistPortalUrl,
      } satisfies DspBioSyncMetadata,
    })
    .returning({ id: dspBioSyncRequests.id });

  return {
    providerId,
    method: 'api',
    status: 'unsupported',
    syncRequestId: syncRequest.id,
    error: `API-based bio sync for ${provider.displayName} requires OAuth connection (coming soon)`,
  };
}

// ============================================================================
// Query helpers
// ============================================================================

/**
 * Get the latest bio sync status for each DSP for a creator profile.
 */
export async function getBioSyncStatus(creatorProfileId: string) {
  const requests = await db
    .select()
    .from(dspBioSyncRequests)
    .where(eq(dspBioSyncRequests.creatorProfileId, creatorProfileId))
    .orderBy(desc(dspBioSyncRequests.createdAt));

  // Group by provider, keeping only the latest per provider
  const latestByProvider = new Map<
    string,
    typeof dspBioSyncRequests.$inferSelect
  >();
  for (const req of requests) {
    if (!latestByProvider.has(req.providerId)) {
      latestByProvider.set(req.providerId, req);
    }
  }

  // Build response with provider metadata
  return Array.from(latestByProvider.entries()).map(
    ([providerId, syncRequest]) => {
      const provider = getBioProvider(providerId);
      return {
        providerId,
        displayName: provider?.displayName ?? providerId,
        method: syncRequest.method,
        status: syncRequest.status,
        lastSyncedAt: syncRequest.sentAt,
        lastError: syncRequest.error,
        createdAt: syncRequest.createdAt,
      };
    }
  );
}
