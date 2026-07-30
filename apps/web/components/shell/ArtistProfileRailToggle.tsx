'use client';

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';
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

  const label = isOpen
    ? `Hide ${primaryName} profile`
    : `Show ${primaryName} profile`;

  if (!selectedProfile) return null;

  const RailIcon = isOpen ? PanelRightClose : PanelRightOpen;

  return (
    <DashboardHeaderActionButton
      ariaLabel={label}
      pressed={isOpen}
      onClick={toggle}
      dataTestId='artist-profile-rail-toggle'
      tooltipLabel={label}
      tooltipShortcut={RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE}
      icon={
        <RailIcon
          data-testid='artist-profile-rail-icon'
          className='size-3.5'
          aria-hidden='true'
        />
      }
    />
  );
}
