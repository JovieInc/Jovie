export const HELP_CENTER_TITLE = 'Jovie Help Center';

export const HELP_CENTER_SUPPORT =
  'Clear answers for building your profile, sharing your work, and understanding your audience.';

export const HELP_CENTER_DESTINATIONS = Object.freeze([
  {
    slug: 'jovie-essentials/start-here',
    title: 'Start with Jovie',
    description:
      'Find or claim your profile, connect your accounts, and publish.',
    route: '/docs/jovie-essentials/start-here',
    category: 'jovie-essentials',
    icon: 'start',
  },
  {
    slug: 'build-your-presence/profile-and-identity',
    title: 'Profile & identity',
    description: 'Manage your bio, images, links, music, and public presence.',
    route: '/docs/build-your-presence/profile-and-identity',
    category: 'build-your-presence',
    icon: 'profile',
  },
  {
    slug: 'build-your-presence/releases-and-smart-links',
    title: 'Releases & links',
    description:
      'Add releases, create smart links, and give fans the right destination.',
    route: '/docs/build-your-presence/releases-and-smart-links',
    category: 'build-your-presence',
    icon: 'release',
  },
  {
    slug: 'build-your-presence/audience',
    title: 'Audience & insights',
    description: 'Understand who visits, follows, listens, and returns.',
    route: '/docs/build-your-presence/audience',
    category: 'build-your-presence',
    icon: 'audience',
  },
  {
    slug: 'manage-jovie/account-and-login',
    title: 'Account & billing',
    description: 'Manage access, settings, subscriptions, and your data.',
    route: '/docs/manage-jovie/account-and-login',
    category: 'manage-jovie',
    icon: 'account',
  },
  {
    slug: 'manage-jovie/troubleshooting',
    title: 'Troubleshooting',
    description:
      'Fix missing music, connection errors, publishing issues, and login problems.',
    route: '/docs/manage-jovie/troubleshooting',
    category: 'manage-jovie',
    icon: 'troubleshooting',
  },
]);

export function getHelpCenterDestination(slug) {
  return HELP_CENTER_DESTINATIONS.find(
    destination => destination.slug === slug
  );
}
