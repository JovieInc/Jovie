/** Pure YouTube import surface + resumable cursor (JOV-5352). */

export const YOUTUBE_IMPORT_CURSOR_VERSION = 1;
export const YOUTUBE_UPLOADS_RESOURCE_KIND = 'youtube_channel_uploads';

export type YouTubeImportSurfaceState =
  | 'empty'
  | 'disconnected'
  | 'authorization-expired'
  | 'partial'
  | 'quota-limited'
  | 'error'
  | 'populated';
export type YouTubeImportIdentity =
  | 'none'
  | 'authorized'
  | 'ambiguous'
  | 'mismatch';
export type YouTubeImportReasonCode =
  | 'wrong_channel'
  | 'missing_id'
  | 'uncertain_identity'
  | 'quota'
  | 'provider_error';

export interface YouTubeImportCounts {
  readonly discovered: number;
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly updated: number;
}
export interface YouTubeImportReason {
  readonly code: YouTubeImportReasonCode;
  readonly count: number;
}
export interface YouTubeImportCursor {
  readonly version: typeof YOUTUBE_IMPORT_CURSOR_VERSION;
  readonly channelId: string;
  readonly uploadsPlaylistId: string;
  readonly pageToken: string | null;
  readonly complete: boolean;
  readonly counts: YouTubeImportCounts;
  readonly reasons: readonly YouTubeImportReason[];
  readonly lastSuccessfulObservationAt: string | null;
  readonly providerAccountId: string;
  readonly providerTitle: string | null;
  readonly lastErrorCode: string | null;
}
export interface YouTubeImportAccountView {
  readonly status: 'connected' | 'needs_reauth' | 'error' | 'disabled';
  readonly channelId: string;
  readonly lastSyncAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorUserMessage: string | null;
  readonly providerTitle: string | null;
}
export interface YouTubeImportSnapshot {
  readonly state: YouTubeImportSurfaceState;
  readonly identity: YouTubeImportIdentity;
  readonly resumable: boolean;
  readonly channelId: string | null;
  readonly providerTitle: string | null;
  readonly lastSuccessfulObservationAt: string | null;
  readonly lastErrorUserMessage: string | null;
  readonly counts: YouTubeImportCounts;
  readonly reasons: readonly YouTubeImportReason[];
}

export const YOUTUBE_IMPORT_REASON_LABELS: Record<
  YouTubeImportReasonCode,
  string
> = {
  wrong_channel: 'Wrong channel',
  missing_id: 'Missing video',
  uncertain_identity: 'Uncertain identity',
  quota: 'Quota',
  provider_error: 'Provider error',
};

export function emptyYouTubeImportCounts(): YouTubeImportCounts {
  return { discovered: 0, imported: 0, skipped: 0, failed: 0, updated: 0 };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export function parseYouTubeImportCursor(
  value: unknown,
  authorizedChannelId: string
): YouTubeImportCursor | null {
  if (!isRecord(value) || value.version !== YOUTUBE_IMPORT_CURSOR_VERSION) {
    return null;
  }
  const channelId = asString(value.channelId);
  const providerAccountId = asString(value.providerAccountId);
  const uploadsPlaylistId = asString(value.uploadsPlaylistId);
  const counts = isRecord(value.counts) ? value.counts : null;
  if (
    !channelId ||
    !providerAccountId ||
    !uploadsPlaylistId ||
    !counts ||
    channelId !== authorizedChannelId ||
    providerAccountId !== authorizedChannelId
  ) {
    return null;
  }
  const keys = [
    'discovered',
    'imported',
    'skipped',
    'failed',
    'updated',
  ] as const;
  const parsed: {
    discovered: number;
    imported: number;
    skipped: number;
    failed: number;
    updated: number;
  } = emptyYouTubeImportCounts();
  for (const key of keys) {
    const raw = counts[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)
      return null;
    parsed[key] = raw;
  }
  return {
    version: YOUTUBE_IMPORT_CURSOR_VERSION,
    channelId,
    uploadsPlaylistId,
    pageToken: asString(value.pageToken),
    complete: value.complete === true,
    counts: parsed,
    reasons: Array.isArray(value.reasons)
      ? value.reasons.flatMap(entry => {
          if (!isRecord(entry)) return [];
          const code = asString(entry.code);
          const count = entry.count;
          if (!code || !(code in YOUTUBE_IMPORT_REASON_LABELS)) return [];
          if (typeof count !== 'number' || count < 0) return [];
          return [{ code: code as YouTubeImportReasonCode, count }];
        })
      : [],
    lastSuccessfulObservationAt: asString(value.lastSuccessfulObservationAt),
    providerAccountId,
    providerTitle: asString(value.providerTitle),
    lastErrorCode: asString(value.lastErrorCode),
  };
}

export function cursorBelongsToAnotherChannel(
  value: unknown,
  authorizedChannelId: string
): boolean {
  if (!isRecord(value)) return false;
  const channelId = asString(value.channelId);
  const providerAccountId = asString(value.providerAccountId);
  return Boolean(
    (channelId && channelId !== authorizedChannelId) ||
      (providerAccountId && providerAccountId !== authorizedChannelId)
  );
}

export function addYouTubeImportReason(
  reasons: readonly YouTubeImportReason[],
  code: YouTubeImportReasonCode,
  count: number
): YouTubeImportReason[] {
  if (count <= 0) return [...reasons];
  if (!reasons.some(reason => reason.code === code)) {
    return [...reasons, { code, count }];
  }
  return reasons.map(reason =>
    reason.code === code ? { code, count: reason.count + count } : reason
  );
}

export function resolveYouTubeImportSurface(input: {
  readonly accounts: readonly YouTubeImportAccountView[];
  readonly cursor?: YouTubeImportCursor | null;
  readonly localVideoCount?: number;
}): YouTubeImportSnapshot {
  const empty: YouTubeImportSnapshot = {
    state: 'disconnected',
    identity: 'none',
    resumable: false,
    channelId: null,
    providerTitle: null,
    lastSuccessfulObservationAt: null,
    lastErrorUserMessage: null,
    counts: emptyYouTubeImportCounts(),
    reasons: [],
  };
  const connected = input.accounts.filter(
    row => row.status === 'connected' || row.status === 'error'
  );
  if (connected.length > 1) {
    return {
      ...empty,
      state: 'error',
      identity: 'ambiguous',
      lastErrorUserMessage:
        'More than one connected YouTube channel is bound to this profile. Resolve ownership before import.',
    };
  }
  if (connected.length === 0) {
    const expired = input.accounts.find(row => row.status === 'needs_reauth');
    if (expired) {
      return {
        ...empty,
        state: 'authorization-expired',
        lastErrorUserMessage:
          expired.lastErrorUserMessage ??
          'Reconnect YouTube to refresh access.',
      };
    }
    const errored = input.accounts.find(row => row.status === 'error');
    return errored
      ? {
          ...empty,
          state: 'error',
          lastErrorUserMessage: errored.lastErrorUserMessage,
        }
      : empty;
  }
  const account = connected[0];
  const cursor = input.cursor ?? null;
  const resumable = Boolean(cursor?.pageToken) && cursor?.complete !== true;
  const base = {
    identity: 'authorized' as const,
    channelId: account.channelId,
    providerTitle: account.providerTitle ?? cursor?.providerTitle ?? null,
    lastSuccessfulObservationAt:
      cursor?.lastSuccessfulObservationAt ??
      account.lastSyncAt?.toISOString() ??
      null,
    lastErrorUserMessage: account.lastErrorUserMessage,
    counts: cursor?.counts ?? emptyYouTubeImportCounts(),
    reasons: cursor?.reasons ?? [],
  };
  if (account.lastErrorCode === 'youtube_quota_limited') {
    return { ...base, state: 'quota-limited', resumable };
  }
  if (account.status === 'error' || account.lastErrorCode) {
    return { ...base, state: 'error', resumable };
  }
  if (resumable) return { ...base, state: 'partial', resumable: true };
  if (cursor?.complete || (input.localVideoCount ?? 0) > 0) {
    return { ...base, state: 'populated', resumable: false };
  }
  return { ...base, state: 'empty', resumable: false };
}
