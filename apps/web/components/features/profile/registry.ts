import { type ProfileMode, type ProfileModeDefinition } from './contracts';

export { PROFILE_MODE_KEYS as profileModes } from './contracts';

export const PROFILE_MODE_REGISTRY: Record<ProfileMode, ProfileModeDefinition> =
  {
    profile: {
      mode: 'profile',
      subtitle: 'Artist',
      pathSegment: '',
      shell: {
        showBackButton: false,
        showSocialBar: true,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    listen: {
      mode: 'listen',
      subtitle: 'Listen now',
      pathSegment: 'listen',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    pay: {
      mode: 'pay',
      subtitle: 'Support',
      pathSegment: 'pay',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    subscribe: {
      mode: 'subscribe',
      subtitle: 'Turn on notifications',
      pathSegment: 'subscribe',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    about: {
      mode: 'about',
      subtitle: 'About',
      pathSegment: 'about',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    contact: {
      mode: 'contact',
      subtitle: 'Contact',
      pathSegment: 'contact',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    tour: {
      mode: 'tour',
      subtitle: 'Tour dates',
      pathSegment: 'tour',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
    releases: {
      mode: 'releases',
      subtitle: 'Discography',
      pathSegment: 'releases',
      shell: {
        showBackButton: true,
        showSocialBar: false,
        showNotificationButton: true,
        showTourButton: true,
        showFooter: true,
      },
    },
  };

export function isProfileMode(
  value: string | null | undefined
): value is ProfileMode {
  return Boolean(value && value in PROFILE_MODE_REGISTRY);
}

export function getProfileMode(value: string | null | undefined): ProfileMode {
  if (value === 'tip') return 'pay';
  return isProfileMode(value) ? value : 'profile';
}

export function getProfileModeDefinition(
  value: string | null | undefined
): ProfileModeDefinition {
  return PROFILE_MODE_REGISTRY[getProfileMode(value)];
}

export function getProfileModeSubtitle(
  value: string | null | undefined
): string {
  return getProfileModeDefinition(value).subtitle;
}

export function getProfileModeHref(
  handle: string,
  value: string | null | undefined,
  searchSuffix = ''
): string {
  const mode = getProfileMode(value);
  let normalizedSuffix: string;
  if (searchSuffix.startsWith('&')) {
    normalizedSuffix = searchSuffix;
  } else if (searchSuffix) {
    normalizedSuffix = `&${searchSuffix}`;
  } else {
    normalizedSuffix = '';
  }

  if (mode === 'profile') {
    return normalizedSuffix
      ? `/${handle}?${normalizedSuffix.slice(1)}`
      : `/${handle}`;
  }

  return `/${handle}?mode=${mode}${normalizedSuffix}`;
}

export function getProfileModePath(
  handle: string,
  value: string | null | undefined
): string {
  const definition = getProfileModeDefinition(value);
  return definition.pathSegment
    ? `/${handle}/${definition.pathSegment}`
    : `/${handle}`;
}
