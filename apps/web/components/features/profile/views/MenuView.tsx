'use client';

import {
  Bell,
  CalendarDays,
  ChevronRight,
  Disc3,
  Info,
  Mail,
  Share2,
  Ticket,
} from 'lucide-react';
import { PROFILE_DRAWER_MENU_ITEM_CLASS } from '../profile-drawer-classes';
import type { ProfileViewKey } from './registry';

const ICON_CLASS = 'h-[16px] w-[16px] text-white/40';

export interface MenuViewProps {
  readonly onNavigate: (view: ProfileViewKey) => void;
  readonly hasAbout: boolean;
  readonly hasReleases: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly isSubscribed: boolean;
  /**
   * When the profile is not yet subscribed, clicking the notifications entry
   * prefers this drawer-close-and-reveal side effect (used by surfaces that
   * host a dedicated notifications sheet on the base profile). Falls back to
   * navigating into the `subscribe` view when absent.
   */
  readonly onRevealNotifications?: () => void;
  /**
   * Called before `onRevealNotifications` fires so the enclosing drawer can
   * animate closed. Optional — pass from the wrapper that owns open state.
   */
  readonly onBeforeReveal?: () => void;
}

/**
 * Body of the `menu` view: the navigation rail the user lands on when they
 * tap the profile's overflow menu.
 *
 * Pure view component — no title or shell. Entries are data-dependent; the
 * caller passes in visibility flags. Order is preserved verbatim from the
 * legacy in-drawer render and does NOT yet use
 * `PROFILE_VIEW_REGISTRY.menuOrder` — that reconciliation is intentionally
 * deferred to plan PR 3a so the registry-driven order doesn't land as a
 * hidden behavior change underneath the route rewrite.
 */
export function MenuView({
  onNavigate,
  hasAbout,
  hasReleases,
  hasTourDates,
  hasTip,
  hasContacts,
  isSubscribed,
  onRevealNotifications,
  onBeforeReveal,
}: MenuViewProps) {
  return (
    <div className='flex flex-col gap-0.5' role='menu'>
      <button
        type='button'
        role='menuitem'
        className={PROFILE_DRAWER_MENU_ITEM_CLASS}
        onClick={() => onNavigate('share')}
      >
        <Share2 className={ICON_CLASS} />
        Share Profile
      </button>

      {hasAbout ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('about')}
        >
          <Info className={ICON_CLASS} />
          About
        </button>
      ) : null}

      {hasReleases ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('releases')}
        >
          <Disc3 className={ICON_CLASS} />
          Releases
        </button>
      ) : null}

      {hasTourDates ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('tour')}
        >
          <CalendarDays className={ICON_CLASS} />
          Tour Dates
        </button>
      ) : null}

      {hasTip ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('pay')}
        >
          <Ticket className={ICON_CLASS} />
          Pay
        </button>
      ) : null}

      {hasContacts ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('contact')}
        >
          <Mail className={ICON_CLASS} />
          Contact
        </button>
      ) : null}

      {isSubscribed ? (
        <button
          type='button'
          role='menuitem'
          className={`${PROFILE_DRAWER_MENU_ITEM_CLASS} justify-between`}
          onClick={() => onNavigate('notifications')}
        >
          <span className='flex items-center gap-3'>
            <Bell className={ICON_CLASS} />
            Notifications
          </span>
          <ChevronRight className='h-3.5 w-3.5 text-white/30' />
        </button>
      ) : (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => {
            if (onRevealNotifications) {
              onBeforeReveal?.();
              setTimeout(() => onRevealNotifications(), 200);
            } else {
              onNavigate('subscribe');
            }
          }}
        >
          <Bell className={ICON_CLASS} />
          Turn on notifications
        </button>
      )}
    </div>
  );
}
