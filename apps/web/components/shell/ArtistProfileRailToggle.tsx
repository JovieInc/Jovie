'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';

/**
 * Shell header control for opening/closing the artist profile right rail on
 * home + chat routes. Uses preview-panel state so the rail stays mounted and
 * RightDrawer can run the cinematic width transition.
 *
 * This intentionally stays an icon control rather than another identity
 * surface: the sidebar footer owns the account/avatar entry.
 */
export function ArtistProfileRailToggle() {
  const { selectedProfile } = useDashboardData();
  const { isOpen, toggle } = usePreviewPanelState();

  const primaryName = selectedProfile?.displayName?.trim() || 'Artist profile';

  if (!selectedProfile) return null;

  return (
    <RailToggleButton
      side='right'
      open={isOpen}
      openLabel={`Hide ${primaryName} profile`}
      closedLabel={`Show ${primaryName} profile`}
      onToggle={toggle}
      shortcut={RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE}
      dataTestId='artist-profile-rail-toggle'
      iconTestId='artist-profile-rail-icon'
    />
  );
}
