'use client';

import { TooltipShortcut } from '@jovie/ui';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';
import { cn } from '@/lib/utils';
import { ArtistAvatarStack } from './ArtistAvatarStack';

/**
 * Shell header control for opening/closing the artist profile right rail on
 * home + chat routes. Uses preview-panel state so the rail stays mounted and
 * RightDrawer can run the cinematic width transition.
 *
 * Identity display scales with artist count:
 *   1 → single avatar
 *   2 → two overlapping avatars
 *   3+ → two overlapping avatars + "+N artists"
 */
export function ArtistProfileRailToggle() {
  const { selectedProfile, creatorProfiles } = useDashboardData();
  const { isOpen, toggle } = usePreviewPanelState();

  const rawProfiles =
    creatorProfiles.length > 0
      ? creatorProfiles
      : selectedProfile
        ? [selectedProfile]
        : [];

  const artists = rawProfiles.map(p => ({
    id: p.id,
    displayName: p.displayName?.trim() || p.username?.trim() || 'Artist',
    avatarUrl: p.avatarUrl,
  }));

  const primaryName =
    selectedProfile?.displayName?.trim() ||
    artists[0]?.displayName?.trim() ||
    'Artist profile';

  const label = isOpen
    ? `Hide ${primaryName} profile`
    : `Show ${primaryName} profile`;

  if (artists.length === 0) return null;

  return (
    <TooltipShortcut
      label={label}
      shortcut={RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE}
      side='bottom'
    >
      <button
        type='button'
        data-testid='artist-profile-rail-toggle'
        aria-label={label}
        aria-pressed={isOpen}
        onClick={toggle}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full px-1.5',
          'text-xs font-semibold text-secondary-token',
          'transition-[background,color,opacity] duration-subtle ease-subtle',
          'hover:bg-surface-0 hover:text-primary-token',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
          isOpen && 'bg-surface-0 text-primary-token'
        )}
      >
        <ArtistAvatarStack artists={artists} />
      </button>
    </TooltipShortcut>
  );
}
