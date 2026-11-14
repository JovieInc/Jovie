import type { ProfileMode } from '@/features/profile/contracts';
import {
  resolvePublicProfileBackAction,
  shouldShowPublicProfileBackChevron,
} from '@/features/profile/profile-surface-state';
import { PUBLIC_PROFILE_NAVIGATION } from '@/lib/profile/route-config';

/**
 * Music, Events and About sit beside Home in the visible tab row, so they are
 * siblings of the profile root, not pages nested under it. The top chrome on
 * a sibling tab matches Home's (no Back to a tab that is one tap away), and a
 * Back there exits the profile exactly as it does from Home. Nested modes
 * (releases, subscribe, pay, contact) keep their Back to the profile root.
 */
export function isPublicProfileSiblingTab(mode: ProfileMode): boolean {
  return PUBLIC_PROFILE_NAVIGATION.some(
    destination => destination.id !== 'profile' && destination.id === mode
  );
}

/** Home and its sibling tabs share one top chrome and one Back behaviour. */
export function isPublicProfileRootLevel(mode: ProfileMode): boolean {
  return mode === 'profile' || isPublicProfileSiblingTab(mode);
}

type BackChevronParams = Parameters<
  typeof shouldShowPublicProfileBackChevron
>[0];

/**
 * Back chevron visibility by mode. Every live surface shows the tab row
 * (shouldShowColdVisitorTabBar), so sibling tabs are root level.
 */
export function shouldShowTabBackChevron({
  mode,
  ...params
}: Omit<BackChevronParams, 'isProfileRoot'> & {
  readonly mode: ProfileMode;
}): boolean {
  return shouldShowPublicProfileBackChevron({
    ...params,
    isProfileRoot: isPublicProfileRootLevel(mode),
  });
}

type BackActionParams = Parameters<typeof resolvePublicProfileBackAction>[0];

/** Back action by mode: a sibling tab exits the profile exactly as Home does. */
export function resolveTabBackAction({
  mode,
  ...params
}: Omit<BackActionParams, 'isProfileRoot'> & {
  readonly mode: ProfileMode;
}) {
  return resolvePublicProfileBackAction({
    ...params,
    isProfileRoot: isPublicProfileRootLevel(mode),
  });
}
