import 'server-only';

import { and, desc, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import {
  profileSearchProviderHealth,
  profileSearchQueries,
  profileSearchResults,
  profileSearchRuns,
} from '@/lib/db/schema/profile-search';
import {
  profileSurfaceMonitoringPreferences,
  profileSurfaceSources,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { publicEnv } from '@/lib/env-public';
import { resolveProfileSearchMarket } from '@/lib/profile-search/market';
import {
  type ProfileQualificationStatus,
  type ProfileSurfaceKind,
  redactLockedRank,
  selectDefaultMonitoredSurfaceIds,
} from '@/lib/profile-surfaces/contracts';
import { reconcileProfileSurfaces } from '@/lib/profile-surfaces/reconciliation';
import type { SettingsConnectorState } from '../settings/connectors/connectors-data';
import { loadSettingsConnectorsData } from '../settings/connectors/connectors-data';

export type ProfilesWorkspaceFilter =
  | 'all'
  | 'dsp'
  | 'social'
  | 'source'
  | 'connector';

export interface ProfileWorkspaceSurfaceRow {
  readonly id: string;
  readonly rowType: 'surface';
  readonly kind: ProfileSurfaceKind;
  readonly platform: string;
  readonly label: string;
  readonly handle: string | null;
  readonly url: string;
  readonly trackedUrl: string | null;
  readonly qualificationStatus: ProfileQualificationStatus;
  readonly isOfficial: boolean;
  readonly monitoringState: 'active' | 'paused' | 'locked' | 'unavailable';
  readonly rank: number | null;
  readonly previousRank: number | null;
  readonly lastObservedAt: string | null;
  readonly primaryIssue: string;
  readonly primaryAction: 'open' | 'review' | 'upgrade';
}

export interface ProfileWorkspaceConnectorRow {
  readonly id: string;
  readonly rowType: 'connector';
  readonly kind: 'connector';
  readonly platform: 'gmail' | 'google_calendar';
  readonly label: string;
  readonly handle: string | null;
  readonly url: string;
  readonly status: SettingsConnectorState['status'];
  readonly primaryIssue: string;
  readonly primaryAction: 'connect' | 'reconnect' | 'open';
}

export type ProfileWorkspaceRow =
  | ProfileWorkspaceSurfaceRow
  | ProfileWorkspaceConnectorRow;

export interface ProfilesWorkspaceData {
  readonly artist: {
    readonly name: string;
    readonly username: string;
    readonly avatarUrl: string | null;
  };
  readonly rows: ProfileWorkspaceRow[];
  readonly monitoringLimit: number | null;
  readonly monitoredCount: number;
  readonly qualifiedShare: number | null;
  readonly bestJovieRank: number | null;
  readonly lastObservedAt: string | null;
  readonly providerAvailable: boolean;
}

async function ensureWorkspaceSeeded(input: {
  readonly profileId: string;
  readonly databaseUserId: string;
  readonly monitoringLimit: number | null;
}) {
  await reconcileProfileSurfaces(input.profileId);
  const [profile, surfaces] = await Promise.all([
    db
      .select({
        displayName: creatorProfiles.displayName,
        location: creatorProfiles.location,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, input.profileId))
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select({
        id: profileSurfaces.id,
        kind: profileSurfaces.kind,
        platform: profileSurfaces.platform,
        qualificationStatus: profileSurfaces.qualificationStatus,
        isOfficial: profileSurfaces.isOfficial,
      })
      .from(profileSurfaces)
      .where(
        and(
          eq(profileSurfaces.creatorProfileId, input.profileId),
          eq(profileSurfaces.availability, 'eligible'),
          drizzleSql`${profileSurfaces.retiredAt} IS NULL`
        )
      ),
  ]);
  if (!profile?.displayName) return;

  const selectedIds = selectDefaultMonitoredSurfaceIds(
    surfaces.map(surface => ({
      ...surface,
      kind: surface.kind as ProfileSurfaceKind,
      qualificationStatus:
        surface.qualificationStatus as ProfileQualificationStatus,
    })),
    input.monitoringLimit
  );
  if (selectedIds.length > 0) {
    await db
      .insert(profileSurfaceMonitoringPreferences)
      .values(
        selectedIds.map(surfaceId => ({
          userId: input.databaseUserId,
          creatorProfileId: input.profileId,
          surfaceId,
        }))
      )
      .onConflictDoNothing();
  }

  await Promise.all([
    db
      .insert(profileSearchQueries)
      .values({
        creatorProfileId: input.profileId,
        queryText: profile.displayName.trim(),
        market: resolveProfileSearchMarket(profile.location),
      })
      .onConflictDoUpdate({
        target: [
          profileSearchQueries.creatorProfileId,
          profileSearchQueries.provider,
        ],
        set: {
          queryText: profile.displayName.trim(),
          market: resolveProfileSearchMarket(profile.location),
          updatedAt: new Date(),
        },
      }),
    db
      .insert(profileSearchProviderHealth)
      .values({ provider: 'google_serpapi', enabled: false })
      .onConflictDoNothing(),
  ]);
}

function connectorRow(
  platform: 'gmail' | 'google_calendar',
  state: SettingsConnectorState
): ProfileWorkspaceConnectorRow {
  const connected = state.status === 'connected' || state.status === 'syncing';
  const needsReconnect = state.status === 'needs_reauth';
  return {
    id: `connector:${platform}`,
    rowType: 'connector',
    kind: 'connector',
    platform,
    label: platform === 'gmail' ? 'Gmail' : 'Google Calendar',
    handle: state.email ?? null,
    url: APP_ROUTES.SETTINGS_CONNECTORS,
    status: state.status,
    primaryIssue: connected
      ? 'Connected'
      : needsReconnect
        ? 'Reconnect required'
        : 'Not connected',
    primaryAction: connected
      ? 'open'
      : needsReconnect
        ? 'reconnect'
        : 'connect',
  };
}

export async function loadProfilesWorkspaceData(input: {
  readonly clerkUserId: string;
  readonly databaseUserId: string;
  readonly profileId: string;
}): Promise<ProfilesWorkspaceData> {
  const entitlements = await getCurrentUserEntitlements();
  const monitoringLimit = entitlements.profileMonitoringLimit;
  await ensureWorkspaceSeeded({
    profileId: input.profileId,
    databaseUserId: input.databaseUserId,
    monitoringLimit,
  });

  const [
    profileRows,
    surfaces,
    preferences,
    connectorData,
    providerHealth,
    latestRuns,
  ] = await Promise.all([
    db
      .select({
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, input.profileId))
      .limit(1),
    db
      .select()
      .from(profileSurfaces)
      .where(
        and(
          eq(profileSurfaces.creatorProfileId, input.profileId),
          drizzleSql`${profileSurfaces.retiredAt} IS NULL`
        )
      ),
    db
      .select({
        surfaceId: profileSurfaceMonitoringPreferences.surfaceId,
        state: profileSurfaceMonitoringPreferences.state,
      })
      .from(profileSurfaceMonitoringPreferences)
      .where(
        and(
          eq(profileSurfaceMonitoringPreferences.userId, input.databaseUserId),
          eq(
            profileSurfaceMonitoringPreferences.creatorProfileId,
            input.profileId
          )
        )
      ),
    loadSettingsConnectorsData(input.clerkUserId),
    db
      .select({ enabled: profileSearchProviderHealth.enabled })
      .from(profileSearchProviderHealth)
      .where(eq(profileSearchProviderHealth.provider, 'google_serpapi'))
      .limit(1),
    db
      .select({
        id: profileSearchRuns.id,
        fetchedAt: profileSearchRuns.fetchedAt,
      })
      .from(profileSearchRuns)
      .innerJoin(
        profileSearchQueries,
        eq(profileSearchQueries.id, profileSearchRuns.queryId)
      )
      .where(
        and(
          eq(profileSearchQueries.creatorProfileId, input.profileId),
          eq(profileSearchRuns.state, 'succeeded')
        )
      )
      .orderBy(desc(profileSearchRuns.fetchedAt))
      .limit(2),
  ]);

  const latestRun = latestRuns[0] ?? null;
  const previousRun = latestRuns[1] ?? null;
  const runIds = [latestRun?.id, previousRun?.id].filter((id): id is string =>
    Boolean(id)
  );
  const rankRows =
    runIds.length === 0
      ? []
      : await db
          .select({
            runId: profileSearchResults.runId,
            surfaceId: profileSearchResults.surfaceId,
            position: profileSearchResults.position,
            classification: profileSearchResults.classification,
          })
          .from(profileSearchResults)
          .where(inArray(profileSearchResults.runId, runIds));

  const preferenceBySurface = new Map(
    preferences.map(preference => [preference.surfaceId, preference.state])
  );
  const rankFor = (surfaceId: string, runId: string | undefined) =>
    rankRows.find(row => row.runId === runId && row.surfaceId === surfaceId)
      ?.position ?? null;
  const activeExternalIds = new Set(
    preferences
      .filter(preference => preference.state === 'active')
      .map(preference => preference.surfaceId)
  );
  const socialSourceRows = await db
    .select({ surfaceId: profileSurfaceSources.surfaceId })
    .from(profileSurfaceSources)
    .where(
      and(
        inArray(
          profileSurfaceSources.surfaceId,
          surfaces.map(surface => surface.id)
        ),
        eq(profileSurfaceSources.sourceType, 'social_link'),
        eq(profileSurfaceSources.isLive, true)
      )
    );
  const socialSourceIds = new Set(socialSourceRows.map(row => row.surfaceId));

  const surfaceRows: ProfileWorkspaceSurfaceRow[] = surfaces.map(surface => {
    const rank = rankFor(surface.id, latestRun?.id);
    const preference = preferenceBySurface.get(surface.id);
    const locked = surface.kind !== 'jovie' && !preference;
    const qualificationStatus =
      surface.qualificationStatus as ProfileQualificationStatus;
    const primaryIssue =
      qualificationStatus === 'conflicting'
        ? 'Identity conflict'
        : qualificationStatus === 'suggested'
          ? 'Qualification required'
          : locked
            ? 'Monitoring limit'
            : rank === null
              ? latestRun
                ? 'Not on page one'
                : 'Not measured'
              : 'No issues';
    const trackedUrl =
      socialSourceIds.has(surface.id) && profileRows[0]?.username
        ? new URL(
            `/${encodeURIComponent(profileRows[0].username)}/s/${encodeURIComponent(surface.platform)}`,
            publicEnv.NEXT_PUBLIC_PROFILE_URL
          ).toString()
        : null;
    return {
      id: surface.id,
      rowType: 'surface',
      kind: surface.kind as ProfileSurfaceKind,
      platform: surface.platform,
      label: surface.displayName || surface.platform,
      handle: surface.handle,
      url: surface.url,
      trackedUrl,
      qualificationStatus,
      isOfficial: surface.isOfficial,
      monitoringState:
        surface.availability !== 'eligible'
          ? 'unavailable'
          : surface.kind === 'jovie' || preference === 'active'
            ? 'active'
            : preference === 'paused'
              ? 'paused'
              : 'locked',
      rank: redactLockedRank(locked, rank),
      previousRank: redactLockedRank(
        locked,
        rankFor(surface.id, previousRun?.id)
      ),
      lastObservedAt: surface.lastObservedAt?.toISOString() ?? null,
      primaryIssue,
      primaryAction:
        qualificationStatus === 'suggested'
          ? 'review'
          : locked
            ? 'upgrade'
            : 'open',
    };
  });
  const connectors = connectorData
    ? [
        connectorRow('gmail', connectorData.gmail),
        connectorRow('google_calendar', connectorData.calendar),
      ]
    : [];
  const qualifiedResults = rankRows.filter(
    row =>
      row.runId === latestRun?.id &&
      ['owned', 'aligned', 'qualified'].includes(row.classification)
  ).length;
  const currentResults = rankRows.filter(row => row.runId === latestRun?.id);

  return {
    artist: {
      name:
        profileRows[0]?.displayName?.trim() || profileRows[0]?.username || '',
      username: profileRows[0]?.username ?? '',
      avatarUrl: profileRows[0]?.avatarUrl ?? null,
    },
    rows: [...surfaceRows, ...connectors],
    monitoringLimit,
    monitoredCount: activeExternalIds.size,
    qualifiedShare:
      currentResults.length === 0
        ? null
        : qualifiedResults / currentResults.length,
    bestJovieRank: surfaceRows.find(row => row.kind === 'jovie')?.rank ?? null,
    lastObservedAt: latestRun?.fetchedAt?.toISOString() ?? null,
    providerAvailable: providerHealth[0]?.enabled === true,
  };
}
