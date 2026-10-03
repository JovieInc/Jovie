/**
 * Work inspector action contract (JOV-7475).
 *
 * Separates the three work actions the inspector may surface:
 *   - Share page: the work has a live public destination (smart link / public
 *     share page). Sharing it never requires a launch.
 *   - Review & publish: the work is prepared but unpublished, and the viewer
 *     holds publish permission. Intentional private work never nags here.
 *   - Share privately: access-controlled file sharing via the branded share
 *     drop (JOV-2936). Always available independently of page state.
 *
 * The launch/press-kit summary is the small read contract agreed with
 * JOV-7472: the rail renders exactly the canonical per-work launch state it
 * is given — preparing, needs_input, failed (with retry), or ready — and
 * never invents an empty press-kit slot for work without a launch.
 */

import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';

export type WorkPrimaryActionKind =
  | 'share_page'
  | 'review_publish'
  | 'share_privately';

export interface WorkPrimaryAction {
  readonly kind: WorkPrimaryActionKind;
  readonly label: string;
  /** Action-specific blocker. Null when the action is usable now. */
  readonly blockedReason: string | null;
}

type WorkActionAsset = Pick<
  LibraryReleaseAsset,
  'id' | 'itemKind' | 'status' | 'smartLinkPath' | 'profileVisibility' | 'share'
>;

export function isIntentionallyPrivateWork(asset: WorkActionAsset): boolean {
  return (
    asset.profileVisibility === 'hidden' ||
    asset.share?.visibility === 'private'
  );
}

export function hasLivePublicPage(asset: WorkActionAsset): boolean {
  if (asset.status !== 'released') return false;
  if (asset.share?.visibility === 'public' && asset.share.shareUrl) {
    return true;
  }
  return Boolean(asset.smartLinkPath);
}

export function deriveWorkPrimaryAction(input: {
  readonly asset: WorkActionAsset;
  /** Whether the viewer may publish this work (release permission held). */
  readonly canPublish: boolean;
}): WorkPrimaryAction {
  const { asset, canPublish } = input;
  const isPrivate = isIntentionallyPrivateWork(asset);
  const isReleaseLike =
    asset.itemKind === undefined || asset.itemKind === 'release';

  if (isReleaseLike && !isPrivate && hasLivePublicPage(asset)) {
    return { kind: 'share_page', label: 'Share Page', blockedReason: null };
  }

  if (
    isReleaseLike &&
    !isPrivate &&
    (asset.status === 'scheduled' || asset.status === 'draft')
  ) {
    return {
      kind: 'review_publish',
      label: 'Review & Publish',
      blockedReason: canPublish
        ? null
        : 'You do not have permission to publish this work.',
    };
  }

  return {
    kind: 'share_privately',
    label: 'Share Privately',
    blockedReason: null,
  };
}

/**
 * Canonical per-launch read model supplied by JOV-7472. `workId` scopes the
 * launch to one work item so multiple launches stay distinguishable and a kit
 * is never shown for unrelated work.
 */
export type WorkLaunchKitStatus =
  | 'preparing'
  | 'needs_input'
  | 'failed'
  | 'ready';

export interface WorkLaunchSummary {
  readonly id: string;
  /** The work item this launch belongs to. */
  readonly workId: string;
  readonly title: string;
  readonly kitStatus: WorkLaunchKitStatus;
  /** Precise blocker/detail for needs_input and failed states. */
  readonly kitStatusDetail?: string | null;
  /** Canonical destinations for the generated artifacts. */
  readonly pressKitHref?: string | null;
  readonly pressReleaseHref?: string | null;
  /** Existing launch workspace entry, scoped to this launch. */
  readonly launchHref: string;
  /** Exact prepared revision the artifacts were generated from. */
  readonly revision?: string | null;
  readonly updatedAt?: string | null;
}

function launchUpdatedTime(launch: WorkLaunchSummary): number {
  const parsed = launch.updatedAt ? Date.parse(launch.updatedAt) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Launches that belong to the selected work, most recently updated first. */
export function launchesForWork(
  launches: readonly WorkLaunchSummary[],
  workId: string
): WorkLaunchSummary[] {
  return launches
    .filter(launch => launch.workId === workId)
    .sort((a, b) => launchUpdatedTime(b) - launchUpdatedTime(a));
}

/**
 * Resolve the launch the inspector should surface. An explicit launchId wins
 * (deep links / selection); otherwise the most recently updated launch *for
 * this work* — never whichever kit happens to be newest globally.
 */
export function resolveWorkLaunch(
  launches: readonly WorkLaunchSummary[],
  workId: string,
  launchId?: string | null
): WorkLaunchSummary | null {
  const scoped = launchesForWork(launches, workId);
  if (launchId) {
    return scoped.find(launch => launch.id === launchId) ?? null;
  }
  return scoped[0] ?? null;
}
