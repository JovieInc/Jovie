/**
 * Warm-navigation is only valid when the destination is a desktop-visible
 * link. OqZTF locks the desktop rail to Library / Contacts / Presence; Inbox
 * and Chat stay as header command links. Destinations that live only in the
 * mobile More menu cannot be clicked from `/app` at desktop width, so the
 * performance guard must use a documented route-load contract instead of a
 * hidden `a[href]` selector.
 */

export type ResponsiveWarmNavReason =
  | 'desktop-visible-link'
  | 'mobile-more-route-load';

export interface ResponsiveWarmNavMeasurement {
  readonly measureMode: 'warm-navigation' | 'page-load';
  readonly warmupStrategy: 'authenticated-shell' | 'authenticated-route';
  readonly navTrigger: readonly string[] | undefined;
  readonly reason: ResponsiveWarmNavReason;
}

export interface ResponsiveWarmNavInput {
  readonly destinationHref: string;
  readonly desktopVisibleHrefs: readonly string[];
  readonly mobileMoreHrefs: readonly string[];
}

export function hrefNavTriggers(href: string): readonly string[] {
  return [`a[href="${href}"]`, `a[href^="${href}?"]`];
}

export function resolveResponsiveWarmNavMeasurement(
  input: ResponsiveWarmNavInput
): ResponsiveWarmNavMeasurement {
  const { destinationHref, desktopVisibleHrefs, mobileMoreHrefs } = input;

  if (desktopVisibleHrefs.includes(destinationHref)) {
    return {
      measureMode: 'warm-navigation',
      warmupStrategy: 'authenticated-shell',
      navTrigger: hrefNavTriggers(destinationHref),
      reason: 'desktop-visible-link',
    };
  }

  if (mobileMoreHrefs.includes(destinationHref)) {
    return {
      measureMode: 'page-load',
      warmupStrategy: 'authenticated-route',
      navTrigger: undefined,
      reason: 'mobile-more-route-load',
    };
  }

  throw new Error(
    `Destination "${destinationHref}" is not on the desktop-visible rail or the mobile More menu.`
  );
}
