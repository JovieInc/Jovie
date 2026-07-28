import type {
  PreviewPanelData,
  PreviewPanelLink,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';

/**
 * In-flight profile-rail edits. Hydrators must not clobber preview state while
 * this is > 0 — concurrent server snapshots are often older than the optimistic
 * paint and would flash stale values back into the rail.
 */
let pendingPreviewPanelEdits = 0;

export function beginPreviewPanelEdit(): void {
  pendingPreviewPanelEdits += 1;
}

export function endPreviewPanelEdit(): void {
  pendingPreviewPanelEdits = Math.max(0, pendingPreviewPanelEdits - 1);
}

export function hasPendingPreviewPanelEdits(): boolean {
  return pendingPreviewPanelEdits > 0;
}

/** Test-only reset so unit suites do not leak counter state. */
export function __resetPreviewPanelEditCountForTests(): void {
  pendingPreviewPanelEdits = 0;
}

function mergePreviewLinks(
  current: readonly PreviewPanelLink[],
  incoming: readonly PreviewPanelLink[]
): PreviewPanelLink[] {
  const currentById = new Map(current.map(link => [link.id, link]));
  const merged: PreviewPanelLink[] = incoming.map(link => {
    const existing = currentById.get(link.id);
    if (
      existing?.version !== undefined &&
      link.version !== undefined &&
      existing.version > link.version
    ) {
      return existing;
    }
    return link;
  });

  const incomingIds = new Set(incoming.map(link => link.id));
  const incomingPlatforms = new Set(
    incoming
      .filter(link => link.platform !== 'youtube')
      .map(link => link.platform)
  );

  for (const link of current) {
    if (!link.id.startsWith('temp-') || incomingIds.has(link.id)) continue;
    // Keep optimistic adds that the server snapshot has not confirmed yet.
    if (link.platform !== 'youtube' && incomingPlatforms.has(link.platform)) {
      continue;
    }
    merged.push(link);
  }

  return merged;
}

/**
 * Merge a dashboard/chat hydration snapshot into live preview-panel state.
 *
 * Rules:
 * - Different username → full replace (profile switch).
 * - Incoming CAS version older than local → keep local field edits + version.
 * - While rail mutations are pending → keep local field edits and links that
 *   optimistic UI already painted (only adopt non-editable chrome).
 * - Otherwise take the incoming snapshot, preserving temp links and higher
 *   per-link versions.
 */
export function mergePreviewPanelHydration(
  current: PreviewPanelData | null,
  incoming: PreviewPanelData
): PreviewPanelData {
  if (!current) return incoming;
  if (current.username !== incoming.username) return incoming;

  const currentVersion = current.profileEditVersion ?? 0;
  const incomingVersion = incoming.profileEditVersion ?? 0;
  const pending = hasPendingPreviewPanelEdits();
  const keepLocalFields = pending || incomingVersion < currentVersion;

  if (keepLocalFields) {
    return {
      ...incoming,
      bio: current.bio,
      genres: current.genres,
      location: current.location,
      hometown: current.hometown,
      displayName: current.displayName,
      avatarUrl: current.avatarUrl,
      activeSinceYear: current.activeSinceYear,
      profileEditVersion: current.profileEditVersion,
      links: pending
        ? current.links.map(link => ({ ...link }))
        : mergePreviewLinks(current.links, incoming.links),
    };
  }

  return {
    ...incoming,
    links: mergePreviewLinks(current.links, incoming.links),
  };
}
