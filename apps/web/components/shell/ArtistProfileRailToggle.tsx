'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';
import { cn } from '@/lib/utils';

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
          'inline-flex size-7 items-center justify-center rounded-full',
          'text-secondary-token',
          'transition-[background,color,opacity] duration-subtle ease-subtle',
          'hover:bg-surface-0 hover:text-primary-token',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
          isOpen && 'bg-surface-0 text-primary-token'
        )}
      >
        <RailIcon
          data-testid='artist-profile-rail-icon'
          className='size-3.5'
          aria-hidden='true'
        />
      </button>
    </TooltipShortcut>
  );
}
