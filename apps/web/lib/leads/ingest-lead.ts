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
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import { reconcileProfileSurfaces } from '@/lib/profile-surfaces/reconciliation';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { logger } from '@/lib/utils/logger';
import {
  buildPagelessLeadProfile,
  isPagelessLead,
  type PagelessLeadSkipReason,
} from './pageless-lead-profile';

export interface LeadIngestionResult {
  success: boolean;
  profileId?: string;
  profileUsername?: string;
  error?: string;
  /** Stable code when a pageless lead stays approved but not ingested. */
  reason?: PagelessLeadSkipReason;
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

  // Linktree, Beacons and other blocked hosts are never read: their profile
  // comes from the search match and Spotify instead of the page.
  const pageless = isPagelessLead(lead)
    ? await buildPagelessLeadProfile(lead)
    : null;
  if (pageless && !pageless.ok) {
    logger.warn('Lead left approved without a profile', {
      leadId: lead.id,
      reason: pageless.reason,
    });
    return { success: false, error: pageless.error, reason: pageless.reason };
  }

  const handle = pageless?.handle ?? lead.linktreeHandle;

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

    const extraction = pageless
      ? pageless.extraction
      : await fetchFullExtractionProfile(
          false, // not Laylo
          lead.linktreeUrl,
          handle
        );

    // Keep leads.displayName as the raw scrape provenance; only the public
    // profile receives the artist-name projection.
    const displayName =
      pageless?.displayName ??
      cleanScrapedDisplayName(extraction.displayName) ??
      handle;
    // A pageless avatar comes only from Spotify; its links are never scanned.
    const hostedAvatarUrl = await resolveHostedAvatarUrl(
      handle,
      pageless ? { avatarUrl: extraction.avatarUrl, links: [] } : extraction
    );

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
            leadHold: true,
          })
        : await handleNewProfileIngest({
            finalHandle: existingCheck.finalHandle,
            displayName,
            hostedAvatarUrl,
            extraction: extractionWithHostedAvatar,
            leadHold: true,
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
      // A Spotify match found by search becomes the lead's Spotify link, so
      // approval's Spotify enrichment and evidence refresh can use it.
      const matchedSpotifyUrl = lead.spotifyUrl
        ? null
        : (pageless?.spotifyUrl ?? null);
      await db
        .update(leads)
        .set({
          status: 'ingested',
          creatorProfileId: body.profile.id,
          ingestedAt: new Date(),
          updatedAt: new Date(),
          ...(matchedSpotifyUrl ? { spotifyUrl: matchedSpotifyUrl } : {}),
        })
        .where(eq(leads.id, lead.id));

      // Enqueue MusicFetch enrichment and DSP discovery for the new profile.
      // Wrapped in try/catch so failures don't flip the ingestion result.
      try {
        await refreshLeadProfileEvidence(body.profile.id, {
          id: lead.id,
          spotifyUrl: lead.spotifyUrl ?? matchedSpotifyUrl,
        });
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
