'use client';

import { TooltipShortcut } from '@jovie/ui';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { Avatar } from '@/components/molecules/Avatar';
import { RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useRightRailKeyboardShortcut';
import { cn } from '@/lib/utils';

/**
 * Shell header control for opening/closing the artist profile right rail on
 * home + chat routes. Uses preview-panel state so the rail stays mounted and
 * RightDrawer can run the cinematic width transition.
 */
export function ArtistProfileRailToggle() {
  const { selectedProfile } = useDashboardData();
  const { isOpen, toggle } = usePreviewPanelState();

  const displayName = selectedProfile?.displayName?.trim() || 'Artist profile';
  const label = isOpen
    ? `Hide ${displayName} profile`
    : `Show ${displayName} profile`;

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
          'inline-flex h-7 max-w-44 items-center gap-1.5 rounded-full px-1.5',
          'text-xs font-semibold text-secondary-token',
          'transition-[background,color,opacity] duration-subtle ease-subtle',
          'hover:bg-surface-0 hover:text-primary-token',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
          isOpen && 'bg-surface-0 text-primary-token'
        )}
      >
        <Avatar
          src={selectedProfile?.avatarUrl}
          alt={displayName}
          size='xs'
          className='size-5 shrink-0 rounded-full'
        />
        <span className='hidden truncate sm:inline'>{displayName}</span>
      </button>
    </TooltipShortcut>
  );
}
