'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import type { DspMatchConfidenceBreakdown } from '@/lib/db/schema/dsp-enrichment';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import type { DspMatchStatus, DspProviderId } from '@/lib/dsp-enrichment/types';
import { PROVIDER_DOMAINS } from '@/lib/dsp-registry';
import { captureError } from '@/lib/error-tracking';
import { getDashboardData } from '../actions';

// ============================================================================
// Types
// ============================================================================

export interface DspPresenceItem {
  readonly matchId: string;
  readonly providerId: DspProviderId;
  readonly externalArtistName: string | null;
  readonly externalArtistUrl: string | null;
  readonly externalArtistImageUrl: string | null;
  readonly confidenceScore: number | null;
  readonly confidenceBreakdown: DspMatchConfidenceBreakdown | null;
  readonly matchingIsrcCount: number;
  readonly status: DspMatchStatus;
  readonly matchSource: string | null;
  readonly confirmedAt: string | null;
}

export interface DspPresenceData {
  readonly items: DspPresenceItem[];
  readonly confirmedCount: number;
  readonly suggestedCount: number;
}

// ============================================================================
// Data Loading
// ============================================================================

export async function loadDspPresence(): Promise<DspPresenceData> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profile = data.selectedProfile;
  if (!profile) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  try {
    // Fetch all matches (confirmed, auto_confirmed, suggested)
    const matches = await dashboardQuery(
      () =>
        db
          .select({
            matchId: dspArtistMatches.id,
            providerId: dspArtistMatches.providerId,
            externalArtistName: dspArtistMatches.externalArtistName,
            externalArtistUrl: dspArtistMatches.externalArtistUrl,
            externalArtistImageUrl: dspArtistMatches.externalArtistImageUrl,
            confidenceScore: dspArtistMatches.confidenceScore,
            confidenceBreakdown: dspArtistMatches.confidenceBreakdown,
            matchingIsrcCount: dspArtistMatches.matchingIsrcCount,
            status: dspArtistMatches.status,
            matchSource: dspArtistMatches.matchSource,
            confirmedAt: dspArtistMatches.confirmedAt,
          })
          .from(dspArtistMatches)
          .where(eq(dspArtistMatches.creatorProfileId, profile.id)),
      'loadDspPresence:matches'
    );

    // Filter out rejected matches
    const activeMatches = matches.filter(m => m.status !== 'rejected');

    const items: DspPresenceItem[] = activeMatches.map(match => ({
      matchId: match.matchId,
      providerId: match.providerId as DspProviderId,
      externalArtistName: match.externalArtistName,
      externalArtistUrl: match.externalArtistUrl,
      externalArtistImageUrl: match.externalArtistImageUrl,
      confidenceScore:
        match.confidenceScore == null ? null : Number(match.confidenceScore),
      confidenceBreakdown: match.confidenceBreakdown,
      matchingIsrcCount: match.matchingIsrcCount,
      status: match.status as DspMatchStatus,
      matchSource: match.matchSource,
      confirmedAt: match.confirmedAt?.toISOString() ?? null,
    }));

    // Sort: suggested first (actionable), then auto_confirmed, then confirmed
    const statusOrder: Record<string, number> = {
      suggested: 0,
      auto_confirmed: 1,
      confirmed: 2,
    };
    items.sort(
      (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
    );

    return {
      items,
      confirmedCount: items.filter(
        i => i.status === 'confirmed' || i.status === 'auto_confirmed'
      ).length,
      suggestedCount: items.filter(i => i.status === 'suggested').length,
    };
  } catch (error) {
    captureError('loadDspPresence failed', error, {
      route: '/app/presence',
    });
    return { items: [], confirmedCount: 0, suggestedCount: 0 };
  }
}

// ============================================================================
// Manual DSP Match
// ============================================================================

export async function addManualDspMatch(input: {
  providerId: DspProviderId;
  url: string;
  artistName: string;
}): Promise<{ success: boolean; error?: string }> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profile = data.selectedProfile;
  if (!profile) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  // Normalize inputs
  const artistName = input.artistName.trim();
  if (!artistName) {
    return { success: false, error: 'Artist name is required' };
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url.trim());
  } catch {
    return { success: false, error: 'Invalid URL' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { success: false, error: 'URL must use HTTPS' };
  }

  if (
    !PROVIDER_DOMAINS[input.providerId]?.some(
      domain =>
        parsedUrl.hostname === domain ||
        parsedUrl.hostname.endsWith(`.${domain}`)
    )
  ) {
    return {
      success: false,
      error: 'URL does not match the selected platform',
    };
  }

  const normalizedUrl = parsedUrl.toString();

  try {
    // Check for existing match
    const [existing] = await db
      .select({
        id: dspArtistMatches.id,
        status: dspArtistMatches.status,
        matchSource: dspArtistMatches.matchSource,
      })
      .from(dspArtistMatches)
      .where(
        and(
          eq(dspArtistMatches.creatorProfileId, profile.id),
          eq(dspArtistMatches.providerId, input.providerId)
        )
      );

    if (existing) {
      // If already confirmed/auto_confirmed by a non-manual source, don't overwrite
      if (
        (existing.status === 'confirmed' ||
          existing.status === 'auto_confirmed') &&
        existing.matchSource !== 'manual'
      ) {
        return {
          success: false,
          error: 'You already have this platform linked',
        };
      }

      // Update existing match — clear stale discovery/rejection fields
      await db
        .update(dspArtistMatches)
        .set({
          status: 'confirmed',
          matchSource: 'manual',
          confidenceScore: null,
          confidenceBreakdown: null,
          matchingIsrcCount: 0,
          matchingUpcCount: 0,
          totalTracksChecked: 0,
          externalArtistId: null,
          externalArtistImageUrl: null,
          rejectedAt: null,
          rejectionReason: null,
          confirmedAt: new Date(),
          externalArtistName: artistName,
          externalArtistUrl: normalizedUrl,
          updatedAt: new Date(),
        })
        .where(eq(dspArtistMatches.id, existing.id));
    } else {
      // Insert new match
      await db.insert(dspArtistMatches).values({
        creatorProfileId: profile.id,
        providerId: input.providerId,
        status: 'confirmed',
        matchSource: 'manual',
        confidenceScore: null,
        confirmedAt: new Date(),
        externalArtistName: artistName,
        externalArtistUrl: normalizedUrl,
      });
    }

    revalidatePath(APP_ROUTES.PRESENCE);
    return { success: true };
  } catch (error) {
    captureError('addManualDspMatch failed', error, {
      providerId: input.providerId,
    });
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
