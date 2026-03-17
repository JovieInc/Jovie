'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import type { DspMatchConfidenceBreakdown } from '@/lib/db/schema/dsp-enrichment';
import {
  dspArtistMatches,
  releaseSyncStatus,
} from '@/lib/db/schema/dsp-enrichment';
import type { DspMatchStatus, DspProviderId } from '@/lib/dsp-enrichment/types';
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
  readonly confidenceScore: number;
  readonly confidenceBreakdown: DspMatchConfidenceBreakdown | null;
  readonly matchingIsrcCount: number;
  readonly status: DspMatchStatus;
  readonly confirmedAt: string | null;
  // Release sync data (may be null if no sync has occurred)
  readonly totalReleasesSynced: number | null;
  readonly releasesWithMatches: number | null;
  readonly lastSyncAt: string | null;
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
    redirect('/onboarding');
  }

  const profile = data.selectedProfile;
  if (!profile) {
    redirect('/onboarding');
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
            confirmedAt: dspArtistMatches.confirmedAt,
          })
          .from(dspArtistMatches)
          .where(eq(dspArtistMatches.creatorProfileId, profile.id)),
      'loadDspPresence:matches'
    );

    // Fetch release sync status for the profile
    const syncStatuses = await dashboardQuery(
      () =>
        db
          .select({
            providerId: releaseSyncStatus.providerId,
            totalReleasesSynced: releaseSyncStatus.totalReleasesSynced,
            releasesWithMatches: releaseSyncStatus.releasesWithMatches,
            lastFullSyncAt: releaseSyncStatus.lastFullSyncAt,
            lastIncrementalSyncAt: releaseSyncStatus.lastIncrementalSyncAt,
          })
          .from(releaseSyncStatus)
          .where(eq(releaseSyncStatus.creatorProfileId, profile.id)),
      'loadDspPresence:syncStatus'
    );

    // Index sync statuses by provider for quick lookup
    const syncByProvider = new Map(syncStatuses.map(s => [s.providerId, s]));

    // Filter out rejected matches and combine with sync data
    const activeMatches = matches.filter(m => m.status !== 'rejected');

    const items: DspPresenceItem[] = activeMatches.map(match => {
      const sync = syncByProvider.get(match.providerId);
      return {
        matchId: match.matchId,
        providerId: match.providerId as DspProviderId,
        externalArtistName: match.externalArtistName,
        externalArtistUrl: match.externalArtistUrl,
        externalArtistImageUrl: match.externalArtistImageUrl,
        confidenceScore: Number(match.confidenceScore) || 0,
        confidenceBreakdown: match.confidenceBreakdown,
        matchingIsrcCount: match.matchingIsrcCount,
        status: match.status as DspMatchStatus,
        confirmedAt: match.confirmedAt?.toISOString() ?? null,
        totalReleasesSynced: sync?.totalReleasesSynced ?? null,
        releasesWithMatches: sync?.releasesWithMatches ?? null,
        lastSyncAt:
          (
            sync?.lastFullSyncAt ?? sync?.lastIncrementalSyncAt
          )?.toISOString() ?? null,
      };
    });

    // Sort: confirmed first, then auto_confirmed, then suggested
    const statusOrder: Record<string, number> = {
      confirmed: 0,
      auto_confirmed: 1,
      suggested: 2,
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
