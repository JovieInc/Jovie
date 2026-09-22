import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_PROFILE_JOURNEYS,
  LIVE_PROFILE_ROUTE,
} from '@/features/profile/live-profile-lock';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';

const REQUIRED_JOURNEYS = [
  'home',
  'music',
  'shows',
  'about',
  'get-updates',
  'share',
  'pay',
  'custom-amount',
  'contact',
  'menu',
  'credits',
  'cookie-consent',
  'cookie-preferences',
] as const;

describe('live public profile lock', () => {
  it('renders the compact shell and not a legacy profile template', () => {
    expect(LIVE_PROFILE_ROUTE.page).toBe('StaticArtistPage');
    expect(LIVE_PROFILE_ROUTE.template).toBe('ProfileCompactTemplate');
    expect(LIVE_PROFILE_ROUTE.legacyTemplates).not.toContain(
      LIVE_PROFILE_ROUTE.page
    );
    expect(LIVE_PROFILE_ROUTE.legacyTemplates).not.toContain(
      LIVE_PROFILE_ROUTE.template
    );
    expect(typeof StaticArtistPage).toBe('function');
    expect(typeof ProfileCompactTemplate).toBe('function');

    const pageSource = readFileSync(
      path.resolve(process.cwd(), 'app/[username]/page.tsx'),
      'utf8'
    );
    const staticSource = readFileSync(
      path.resolve(
        process.cwd(),
        'components/features/profile/StaticArtistPage.tsx'
      ),
      'utf8'
    );
    expect(pageSource).toContain('StaticArtistPage');
    expect(pageSource).not.toContain('PublicProfileTemplate');
    expect(pageSource).not.toContain('AnimatedArtistPage');
    expect(staticSource).toContain('ProfileCompactTemplate');
    expect(staticSource).not.toContain('PublicProfileTemplate');
    expect(staticSource).not.toContain('AnimatedArtistPage');
  });

  it('exposes every locked profile journey on the live route', () => {
    for (const journey of REQUIRED_JOURNEYS) {
      expect(LIVE_PROFILE_JOURNEYS).toContain(journey);
    }
  });
});
