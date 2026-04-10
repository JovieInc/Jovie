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

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
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
      subtitle={
        view === 'notifications' ? 'Choose what you hear about.' : undefined
      }
      onBack={view === 'notifications' ? () => setView('menu') : undefined}
      dataTestId='profile-menu-drawer'
    >
      {view === 'menu' ? (
        <div className='flex flex-col gap-0.5'>
          <button
            type='button'
            className={menuItemClass}
            onClick={() => handleAction(onShare)}
          >
            <Share2 className={iconClass} />
            Share Profile
          </button>

          {hasAbout ? (
            <button
              type='button'
              className={menuItemClass}
              onClick={() => handleAction(onOpenAbout)}
            >
              <Info className={iconClass} />
              About
            </button>
          ) : null}

          {hasTourDates ? (
            <button
              type='button'
              className={menuItemClass}
              onClick={() => handleAction(onOpenTour)}
            >
              <CalendarDays className={iconClass} />
              Tour Dates
            </button>
          ) : null}

          {hasTip ? (
            <button
              type='button'
              className={menuItemClass}
              onClick={() => handleAction(onOpenTip)}
            >
              <Ticket className={iconClass} />
              Tip
            </button>
          ) : null}

          {hasContacts ? (
            <button
              type='button'
              className={menuItemClass}
              onClick={() => handleAction(onOpenContact)}
            >
              <Mail className={iconClass} />
              Contact
            </button>
          ) : null}

          {isSubscribed ? (
            <button
              type='button'
              className={`${menuItemClass} justify-between`}
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
              className={menuItemClass}
              onClick={() => handleAction(onOpenSubscribe)}
            >
              <Bell className={iconClass} />
              Get Notified
            </button>
          )}
        </div>
      ) : (
        <div className='flex flex-col gap-1'>
          {NOTIFICATION_CONTENT_TYPES.map(pref => (
            <div
              key={pref.key}
              className='flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left'
            >
              <div className='flex flex-col gap-0.5'>
                <span className='text-[14px] font-[470] text-white/88'>
                  {pref.label}
                </span>
                <span className='text-[11px] font-[400] text-white/40'>
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
            className='flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-red-400/85 transition-colors duration-150 active:bg-white/[0.06]'
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
