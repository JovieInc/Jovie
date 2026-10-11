import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { resolveHostedAvatarUrl } from '@/lib/ingestion/flows/avatar-hosting';
import { fetchFullExtractionProfile } from '@/lib/ingestion/flows/full-extraction-flow';
import { checkExistingProfile } from '@/lib/ingestion/flows/profile-operations';
import {
  handleNewProfileIngest,
  handleReingestProfile,
} from '@/lib/ingestion/flows/reingest-flow';
import {
  enqueueDspArtistDiscoveryJob,
  enqueueMusicFetchEnrichmentJob,
} from '@/lib/ingestion/jobs';
import { reconcileProfileSurfaces } from '@/lib/profile-surfaces/reconciliation';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { logger } from '@/lib/utils/logger';

export interface LeadIngestionResult {
  success: boolean;
  profileId?: string;
  profileUsername?: string;
  error?: string;
}

/**
 * Collect the evidence certification reads for a lead-built profile:
 * project its links into profile surfaces and start DSP enrichment.
 * The lead's own Spotify link is the fallback when extraction left the
 * profile without one, which left every lead profile hollow (JOV-7855).
 */
export async function refreshLeadProfileEvidence(
  profileId: string,
  lead: Pick<Lead, 'id' | 'spotifyUrl'>
): Promise<{ musicFetch: boolean; dspDiscovery: boolean }> {
  const [createdProfile] = await db
    .select({
      spotifyUrl: creatorProfiles.spotifyUrl,
      spotifyId: creatorProfiles.spotifyId,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  const leadArtistId = lead.spotifyUrl
    ? extractSpotifyArtistId(lead.spotifyUrl)
    : null;
  const spotifyUrl =
    createdProfile?.spotifyUrl ?? (leadArtistId ? lead.spotifyUrl : null);
  const spotifyId = createdProfile?.spotifyId ?? leadArtistId;

  try {
    await reconcileProfileSurfaces(profileId);
  } catch (err) {
    await captureError('Lead profile surface reconcile failed', err, {
      leadId: lead.id,
    });
  }

  if (spotifyUrl) {
    void enqueueMusicFetchEnrichmentJob({
      creatorProfileId: profileId,
      spotifyUrl,
    }).catch(err =>
      captureError('MusicFetch enrichment enqueue failed for lead', err, {
        leadId: lead.id,
      })
    );
  }
  if (spotifyId) {
    void enqueueDspArtistDiscoveryJob({
      creatorProfileId: profileId,
      spotifyArtistId: spotifyId,
      targetProviders: ['apple_music', 'deezer', 'musicbrainz'],
    }).catch(err =>
      captureError('DSP discovery enqueue failed for lead', err, {
        leadId: lead.id,
      })
    );
  }
  return { musicFetch: Boolean(spotifyUrl), dspDiscovery: Boolean(spotifyId) };
}

/**
 * Ingests a lead as a creator profile using the same flow as admin creator-ingest.
 * Called when a lead is approved.
 */
export async function ingestLeadAsCreator(
  lead: Lead
): Promise<LeadIngestionResult> {
  if (!lead.linktreeUrl) {
    return { success: false, error: 'Lead has no Linktree URL' };
  }

  const handle = lead.linktreeHandle;

  try {
    const existingCheck = await checkExistingProfile(handle);

    if (!existingCheck.finalHandle) {
      return {
        success: false,
        error: 'Unable to allocate unique username',
      };
    }

    if (existingCheck.existing?.isClaimed) {
      return {
        success: false,
        error: 'Profile already claimed by another user',
      };
    }

    const extraction = await fetchFullExtractionProfile(
      false, // not Laylo
      lead.linktreeUrl,
      handle
    );

    const displayName = extraction.displayName?.trim() || handle;
    const hostedAvatarUrl = await resolveHostedAvatarUrl(handle, extraction);

    const extractionWithHostedAvatar = {
      ...extraction,
      avatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
    };

    const response =
      existingCheck.isReingest && existingCheck.existing
        ? await handleReingestProfile({
            existing: existingCheck.existing,
            extraction: extractionWithHostedAvatar,
            displayName,
          })
        : await handleNewProfileIngest({
            finalHandle: existingCheck.finalHandle,
            displayName,
            hostedAvatarUrl,
            extraction: extractionWithHostedAvatar,
          });

    const body = (await response.json()) as {
      ok?: boolean;
      profile?: { id: string; username: string };
      error?: string;
    };

    if (!body.ok && !body.profile) {
      return {
        success: false,
        error: body.error ?? 'Ingestion returned error',
      };
    }

    // Update the lead with the creator profile ID and mark as ingested
    if (body.profile?.id) {
      await db
        .update(leads)
        .set({
          status: 'ingested',
          creatorProfileId: body.profile.id,
          ingestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));

      // Enqueue MusicFetch enrichment and DSP discovery for the new profile.
      // Wrapped in try/catch so failures don't flip the ingestion result.
      try {
        await refreshLeadProfileEvidence(body.profile.id, lead);
      } catch (err) {
        await captureError(
          'Post-ingestion enrichment enqueue failed for lead',
          err,
          { leadId: lead.id }
        );
      }
    }

    logger.info('Lead auto-ingested as creator', {
      leadId: lead.id,
      profileId: body.profile?.id,
      profileUsername: body.profile?.username,
    });

    return {
      success: true,
      profileId: body.profile?.id,
      profileUsername: body.profile?.username,
    };
  } catch (error) {
    await captureError('Lead auto-ingestion failed', error, {
      route: 'leads/ingest-lead',
      contextData: { leadId: lead.id, handle },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
