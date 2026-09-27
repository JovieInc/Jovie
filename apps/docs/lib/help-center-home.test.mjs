import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHelpCenterDestination,
  HELP_CENTER_DESTINATIONS,
  HELP_CENTER_SUPPORT,
  HELP_CENTER_TITLE,
} from './help-center-home.mjs';

test('keeps the locked Help Center copy and destination order', () => {
  assert.equal(HELP_CENTER_TITLE, 'Jovie Help Center');
  assert.equal(
    HELP_CENTER_SUPPORT,
    'Clear answers for building your profile, sharing your work, and understanding your audience.'
  );
  assert.deepEqual(
    HELP_CENTER_DESTINATIONS.map(({ title, description }) => ({
      title,
      description,
    })),
    [
      {
        title: 'Start with Jovie',
        description:
          'Find or claim your profile, connect your accounts, and publish.',
      },
      {
        title: 'Profile & identity',
        description:
          'Manage your bio, images, links, music, and public presence.',
      },
      {
        title: 'Releases & links',
        description:
          'Add releases, create smart links, and give fans the right destination.',
      },
      {
        title: 'Audience & insights',
        description: 'Understand who visits, follows, listens, and returns.',
      },
      {
        title: 'Account & billing',
        description: 'Manage access, settings, subscriptions, and your data.',
      },
      {
        title: 'Troubleshooting',
        description:
          'Fix missing music, connection errors, publishing issues, and login problems.',
      },
    ]
  );
});

test('uses the six canonical migration-map routes with stable slug lookup', () => {
  assert.deepEqual(
    HELP_CENTER_DESTINATIONS.map(destination => destination.route),
    [
      '/docs/jovie-essentials/start-here',
      '/docs/build-your-presence/profile-and-identity',
      '/docs/build-your-presence/releases-and-smart-links',
      '/docs/build-your-presence/audience',
      '/docs/manage-jovie/account-and-login',
      '/docs/manage-jovie/troubleshooting',
    ]
  );
  for (const destination of HELP_CENTER_DESTINATIONS) {
    assert.equal(getHelpCenterDestination(destination.slug), destination);
  }
  assert.equal(getHelpCenterDestination('not-a-destination'), undefined);
});
