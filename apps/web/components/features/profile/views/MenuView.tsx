'use client';

import { PROFILE_DRAWER_MENU_ITEM_CLASS } from '../profile-drawer-classes';
import { PROFILE_VIEW_REGISTRY, type ProfileViewKey } from './registry';

const ICON_CLASS = 'size-4 text-quaternary-token';
const MENU_ENTRIES = [
  {
    key: 'share',
    isVisible: () => true,
  },
  {
    key: 'releases',
    isVisible: ({ hasReleases }: MenuViewVisibility) => hasReleases,
  },
  {
    key: 'pay',
    isVisible: ({ hasTip }: MenuViewVisibility) => hasTip,
  },
  {
    key: 'contact',
    isVisible: ({ hasContacts }: MenuViewVisibility) => hasContacts,
  },
] as const satisfies readonly {
  readonly key: ProfileViewKey;
  readonly isVisible: (visibility: MenuViewVisibility) => boolean;
}[];

interface MenuViewVisibility {
  readonly hasReleases: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
}

export interface MenuViewProps {
  readonly onNavigate: (view: ProfileViewKey) => void;
  readonly hasReleases: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
}

/**
 * Body of the `menu` view: the navigation rail the user lands on when they
 * tap the profile's overflow menu.
 *
 * Pure view component — no title or shell. Entries are data-dependent; the
 * caller passes in visibility flags. Bottom-tab destinations stay out of this
 * overflow menu so navigation copy does not repeat across surfaces.
 */
export function MenuView({
  onNavigate,
  hasReleases,
  hasTourDates,
  hasTip,
  hasContacts,
}: MenuViewProps) {
  const visibility = {
    hasReleases,
    hasTourDates,
    hasTip,
    hasContacts,
  };
  const visibleEntries = MENU_ENTRIES.filter(entry =>
    entry.isVisible(visibility)
  ).map(entry => PROFILE_VIEW_REGISTRY[entry.key]);

  return (
    <div className='flex flex-col gap-0.5' role='menu'>
      {visibleEntries.map(entry => {
        const Icon = entry.icon;
        return (
          <button
            key={entry.key}
            type='button'
            role='menuitem'
            className={PROFILE_DRAWER_MENU_ITEM_CLASS}
            onClick={() => onNavigate(entry.key)}
          >
            <Icon className={ICON_CLASS} />
            {entry.title}
          </button>
        );
      })}
    </div>
  );
}
