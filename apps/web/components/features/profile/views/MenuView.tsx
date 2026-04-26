'use client';

import { Disc3, Mail, Share2, Wallet } from 'lucide-react';
import { PROFILE_DRAWER_MENU_ITEM_CLASS } from '../profile-drawer-classes';
import type { ProfileViewKey } from './registry';

const ICON_CLASS = 'size-4 text-white/40';

export interface MenuViewProps {
  readonly onNavigate: (view: ProfileViewKey) => void;
  readonly hasReleases: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
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
  hasReleases,
  hasTip,
  hasContacts,
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

      {hasTip ? (
        <button
          type='button'
          role='menuitem'
          className={PROFILE_DRAWER_MENU_ITEM_CLASS}
          onClick={() => onNavigate('pay')}
        >
          <Wallet className={ICON_CLASS} />
          Support
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
    </div>
  );
}
