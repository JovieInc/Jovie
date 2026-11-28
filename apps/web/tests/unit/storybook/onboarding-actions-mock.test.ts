import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mock from '@/.storybook/onboarding-actions-mock';

// .storybook/main.ts aliases these real server-action modules onto this mock.
const ALIASED_MODULES = [
  'app/onboarding/actions/connect-spotify.ts',
  'app/onboarding/actions/update-profile.ts',
  'app/onboarding/actions/upgrade-offer.ts',
];

function exportedNames(relativePath: string): string[] {
  const source = readFileSync(
    path.resolve(__dirname, '../../..', relativePath),
    'utf8'
  );
  return [
    ...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
  ].map(match => match[1]);
}

describe('onboarding-actions-mock', () => {
  it.each(ALIASED_MODULES)('exports every name %s exports', modulePath => {
    const names = exportedNames(modulePath);
    expect(names.length).toBeGreaterThan(0);
    const missing = names.filter(name => !(name in mock));
    expect(missing).toEqual([]);
  });

  it('records an upgrade offer decision without a server', async () => {
    await expect(
      mock.recordOnboardingUpgradeOfferDecision('profile-1', 'accepted', 'pro')
    ).resolves.toEqual({ ok: true });
  });
});
