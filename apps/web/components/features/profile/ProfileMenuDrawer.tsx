'use client';

import { Switch } from '@jovie/ui';
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronRight,
  Info,
  Mail,
  Share2,
  Ticket,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import type { NotificationContentType } from '@/types/notifications';
import { NOTIFICATION_CONTENT_TYPES } from '@/types/notifications';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import {
  PROFILE_DRAWER_DANGER_ITEM_CLASS,
  PROFILE_DRAWER_MENU_ITEM_CLASS,
  PROFILE_DRAWER_META_CLASS,
  PROFILE_DRAWER_TITLE_CLASS,
  PROFILE_DRAWER_TOGGLE_ROW_CLASS,
} from './profile-drawer-classes';

interface ProfileMenuDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly isSubscribed: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onUnsubscribe: () => void;
  readonly isUnsubscribing: boolean;
  readonly onShare: () => void;
  readonly onOpenAbout: () => void;
  readonly onOpenTour: () => void;
  readonly onOpenTip: () => void;
  readonly onOpenContact: () => void;
  readonly onOpenSubscribe: () => void;
  readonly hasAbout: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
}

const iconClass = 'h-[16px] w-[16px] text-white/40';

export function ProfileMenuDrawer({
  open,
  onOpenChange,
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  onShare,
  onOpenAbout,
  onOpenTour,
  onOpenTip,
  onOpenContact,
  onOpenSubscribe,
  hasAbout,
  hasTourDates,
  hasTip,
  hasContacts,
}: ProfileMenuDrawerProps) {
  const [view, setView] = useState<'menu' | 'notifications'>('menu');

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setView('menu');
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleAction = useCallback(
    (action: () => void) => {
      handleOpenChange(false);
      action();
    },
    [handleOpenChange]
  );

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={view === 'menu' ? 'Menu' : 'Notifications'}
      subtitle={view === 'notifications' ? 'Choose your updates.' : undefined}
      onBack={view === 'notifications' ? () => setView('menu') : undefined}
      navigationLevel={view === 'notifications' ? 'secondary' : 'root'}
      dataTestId='profile-menu-drawer'
    >
      {view === 'menu' ? (
        <div className='flex flex-col gap-0.5'>
          <button
            type='button'
            className={PROFILE_DRAWER_MENU_ITEM_CLASS}
            onClick={() => handleAction(onShare)}
          >
            <Share2 className={iconClass} />
            Share Profile
          </button>

          {hasAbout ? (
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => handleAction(onOpenAbout)}
            >
              <Info className={iconClass} />
              About
            </button>
          ) : null}

          {hasTourDates ? (
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => handleAction(onOpenTour)}
            >
              <CalendarDays className={iconClass} />
              Tour Dates
            </button>
          ) : null}

          {hasTip ? (
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => handleAction(onOpenTip)}
            >
              <Ticket className={iconClass} />
              Pay
            </button>
          ) : null}

          {hasContacts ? (
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => handleAction(onOpenContact)}
            >
              <Mail className={iconClass} />
              Contact
            </button>
          ) : null}

          {isSubscribed ? (
            <button
              type='button'
              className={`${PROFILE_DRAWER_MENU_ITEM_CLASS} justify-between`}
              onClick={() => setView('notifications')}
            >
              <span className='flex items-center gap-3'>
                <Bell className={iconClass} />
                Notifications
              </span>
              <ChevronRight className='h-3.5 w-3.5 text-white/30' />
            </button>
          ) : (
            <button
              type='button'
              className={PROFILE_DRAWER_MENU_ITEM_CLASS}
              onClick={() => handleAction(onOpenSubscribe)}
            >
              <Bell className={iconClass} />
              Turn on alerts
            </button>
          )}
        </div>
      ) : (
        <div className='flex flex-col gap-1'>
          {NOTIFICATION_CONTENT_TYPES.map(pref => (
            <div key={pref.key} className={PROFILE_DRAWER_TOGGLE_ROW_CLASS}>
              <div className='flex flex-col gap-0.5'>
                <span className={PROFILE_DRAWER_TITLE_CLASS}>{pref.label}</span>
                <span className={PROFILE_DRAWER_META_CLASS}>
                  {pref.description}
                </span>
              </div>
              <Switch
                checked={contentPrefs[pref.key]}
                onCheckedChange={() => onTogglePref(pref.key)}
                aria-label={pref.label}
                className='data-[state=checked]:bg-green-500 data-[state=checked]:hover:bg-green-600 data-[state=unchecked]:bg-white/[0.16] data-[state=unchecked]:hover:bg-white/[0.22]'
              />
            </div>
          ))}

          <div className='mx-1 my-1 h-px bg-white/[0.06]' />

          <button
            type='button'
            className={PROFILE_DRAWER_DANGER_ITEM_CLASS}
            onClick={onUnsubscribe}
            disabled={isUnsubscribing}
          >
            <BellOff className='h-[16px] w-[16px] text-red-400/50' />
            {isUnsubscribing ? 'Turning off\u2026' : 'Turn off notifications'}
          </button>
        </div>
      )}
    </ProfileDrawerShell>
  );
}
