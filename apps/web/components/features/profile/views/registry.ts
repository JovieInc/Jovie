import {
  Bell,
  Disc3,
  Info,
  Mail,
  Menu as MenuIcon,
  Play,
  Share2,
  Ticket,
  Wallet,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { ProfileMode } from '../contracts';

/**
 * Public profile view keys. A superset of `ProfileMode`:
 *
 * - `ProfileMode` (8 entries) = routed surfaces that mount at `/[username]/[mode]`.
 * - `ProfileViewKey` adds:
 *     - `menu`, `share` — future routed modes (PR 3a adds the routes).
 *     - `notifications` — secondary drawer sub-view inside `menu`. Not a route.
 *
 * The routed / sub-view distinction isn't modeled in the type (kept flat for
 * ergonomics). `menuOrder === null` identifies non-menu entries (containers
 * and sub-views); `analyticsEvent === null` identifies those that don't emit
 * on open.
 */
export type ProfileViewKey = ProfileMode | 'menu' | 'share' | 'notifications';

export const PROFILE_VIEW_KEYS = [
  'profile',
  'listen',
  'subscribe',
  'pay',
  'contact',
  'tour',
  'releases',
  'about',
  'share',
  'menu',
  'notifications',
] as const satisfies readonly ProfileViewKey[];

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Visibility inputs for `shouldShow`. Views with no data worth presenting
 * (e.g. `pay` without a venmo handle, `contact` with zero contacts) opt out.
 */
export interface ProfileViewVisibilityInput {
  readonly hasAbout: boolean;
  readonly hasTourDates: boolean;
  readonly hasTip: boolean;
  readonly hasContacts: boolean;
  readonly hasReleases: boolean;
}

export interface ProfileViewRegistryEntry {
  readonly key: ProfileViewKey;
  /** Header title — rendered by the wrapper (drawer header or page chrome). */
  readonly title: string;
  /** Header subtitle — optional, rendered by the wrapper. */
  readonly subtitle?: string;
  /** Lucide icon used in `MenuView` and any future navigation rails. */
  readonly icon: IconComponent;
  /**
   * Sort order inside `MenuView`. Locked by the design review: conversion
   * intents first (Listen, Subscribe, Pay), relationship intents middle
   * (Contact, Tour, Releases), context last (About, Share). `profile` and
   * `menu` are containers and never appear as entries.
   */
  readonly menuOrder: number | null;
  /**
   * Analytics event name emitted when this view opens. Existing drawer
   * components use the `*_drawer_open` convention; we keep it so dashboards
   * don't break during the route cutover (plan PR 3a will dual-emit).
   */
  readonly analyticsEvent: string | null;
  /**
   * Whether the view should appear in menu surfaces / be reachable on a given
   * profile. `profile` always shows; `menu` is implicit. Per-view data
   * predicates filter the rest.
   */
  readonly shouldShow: (input: ProfileViewVisibilityInput) => boolean;
}

const alwaysShow = (): boolean => true;

export const PROFILE_VIEW_REGISTRY: Record<
  ProfileViewKey,
  ProfileViewRegistryEntry
> = {
  profile: {
    key: 'profile',
    title: 'Profile',
    icon: MenuIcon,
    menuOrder: null,
    analyticsEvent: null,
    shouldShow: alwaysShow,
  },
  listen: {
    key: 'listen',
    title: 'Listen',
    subtitle: 'Stream or download on your favorite platform.',
    icon: Play,
    menuOrder: 1,
    analyticsEvent: 'listen_drawer_open',
    shouldShow: alwaysShow,
  },
  subscribe: {
    key: 'subscribe',
    title: 'Get Notified',
    subtitle: 'Get notified about new releases and shows.',
    icon: Bell,
    menuOrder: 2,
    analyticsEvent: 'subscribe_drawer_open',
    shouldShow: alwaysShow,
  },
  pay: {
    key: 'pay',
    title: 'Pay',
    subtitle: 'Send support instantly with Venmo.',
    icon: Wallet,
    menuOrder: 3,
    analyticsEvent: 'tip_drawer_open',
    shouldShow: ({ hasTip }) => hasTip,
  },
  contact: {
    key: 'contact',
    title: 'Contact',
    subtitle: 'Management, booking, press, and more.',
    icon: Mail,
    menuOrder: 4,
    analyticsEvent: 'contacts_drawer_open',
    shouldShow: ({ hasContacts }) => hasContacts,
  },
  tour: {
    key: 'tour',
    title: 'Tour Dates',
    subtitle: 'Upcoming shows and ticket links.',
    icon: Ticket,
    menuOrder: 5,
    analyticsEvent: 'tour_drawer_open',
    shouldShow: ({ hasTourDates }) => hasTourDates,
  },
  releases: {
    key: 'releases',
    title: 'Releases',
    subtitle: 'Discography',
    icon: Disc3,
    menuOrder: 6,
    analyticsEvent: 'releases_drawer_open',
    shouldShow: ({ hasReleases }) => hasReleases,
  },
  about: {
    key: 'about',
    title: 'About',
    subtitle: 'Profile details, genres, and press assets.',
    icon: Info,
    menuOrder: 7,
    analyticsEvent: 'about_drawer_open',
    shouldShow: ({ hasAbout }) => hasAbout,
  },
  share: {
    key: 'share',
    title: 'Share',
    subtitle: 'Share this profile',
    icon: Share2,
    menuOrder: 8,
    analyticsEvent: 'share_drawer_open',
    shouldShow: alwaysShow,
  },
  menu: {
    key: 'menu',
    title: 'Menu',
    icon: MenuIcon,
    menuOrder: null,
    analyticsEvent: null,
    shouldShow: alwaysShow,
  },
  notifications: {
    key: 'notifications',
    title: 'Notifications',
    subtitle: 'Choose what you hear about.',
    icon: Bell,
    // Secondary drawer sub-view reached from MenuView; not a menu entry itself.
    menuOrder: null,
    analyticsEvent: null,
    shouldShow: alwaysShow,
  },
};

/**
 * Ordered list of menu entries for a given profile. Filters out views whose
 * data isn't available and sorts by the locked menu order. `profile` and
 * `menu` are excluded (they're containers, not entries).
 */
export function getMenuEntries(
  input: ProfileViewVisibilityInput
): readonly ProfileViewRegistryEntry[] {
  return PROFILE_VIEW_KEYS.map(key => PROFILE_VIEW_REGISTRY[key])
    .filter(
      (entry): entry is ProfileViewRegistryEntry & { menuOrder: number } =>
        entry.menuOrder !== null
    )
    .filter(entry => entry.shouldShow(input))
    .sort((a, b) => a.menuOrder - b.menuOrder);
}

export function getViewTitle(key: ProfileViewKey): string {
  return PROFILE_VIEW_REGISTRY[key].title;
}

export function getViewSubtitle(key: ProfileViewKey): string | undefined {
  return PROFILE_VIEW_REGISTRY[key].subtitle;
}
