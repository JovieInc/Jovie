import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_AUTH_SMOKE_PATH = path.resolve(
  __dirname,
  '../../e2e/smoke-prod-auth.spec.ts'
);

describe('production auth smoke session contract', () => {
  it('uses one rendered sign-in for dashboard and tab assertions', () => {
    const source = fs.readFileSync(PRODUCTION_AUTH_SMOKE_PATH, 'utf8');

    expect(source).toContain("test.describe.configure({ mode: 'serial' });");
    expect(source.match(/await signInViaRenderedFlow\(/gu)).toHaveLength(1);
    expect(source).not.toContain(
      "test('dashboard tab navigation works', async"
    );
    expect(source).toContain('navigationPath: APP_ROUTES.RELEASES');
    // Claim step: the signed-in identity owns a profile that renders publicly.
    expect(source).toContain('/api/dashboard/profile');
    expect(source).toContain('must render publicly');
    expect(source).toContain('readyPath: APP_ROUTES.LIBRARY');
    expect(source).toContain("readyTestId: 'shell-releases-view'");
    expect(source).not.toContain("readyTestId: 'library-surface'");
    expect(source).toContain("readyView: 'releases'");
    expect(source).toContain('await page.waitForURL(');
    expect(source.match(/await page.reload\(\{/gu)).toHaveLength(1);
    expect(source).toContain("'Rendered sign-in reload'");
    expect(source).toContain('await waitForProductionDashboardContent(');
    expect(
      source.match(/await verifyProductionIosOAuthTokenFlow\(/gu)
    ).toHaveLength(1);
    expect(source).toContain('createNativeLikeOAuthRequest');
    expect(source).toContain('playwrightRequest.newContext');
    expect(source).toContain('x-vercel-protection-bypass');
    expect(source).toContain('error_description');
    expect(source).toContain('sessionRequest.get(authorizeUrl.href');
    expect(source).toContain("grant_type: 'authorization_code'");
    expect(source).toContain("grant_type: 'refresh_token'");
    expect(source.match(/token_type_hint: 'refresh_token'/g)).toHaveLength(1);
    expect(source).not.toContain('issuedTokens');
    expect(source).not.toContain('token_type_hint: hint');
    expect(source).toContain(
      'Revoked iOS OAuth token family should reject userinfo'
    );
    expect(source.match(/headers: \{ origin: expectedOrigin \}/g)).toHaveLength(
      3
    );
    expect(source).toContain('/api/auth/oauth2/userinfo');
    expect(source).toContain('/api/auth/oauth2/revoke');
    expect(source).toContain('recordPlaywrightSensitiveValues(');
    const tabNavigation = source.split('const tabs = ')[1];
    expect(tabNavigation).toBeDefined();
    expect(tabNavigation).not.toContain('.isVisible({ timeout:');
  });

  it('sends the profile save route contract for the edit-readback step', () => {
    const source = fs.readFileSync(PRODUCTION_AUTH_SMOKE_PATH, 'utf8');

    // PUT /api/dashboard/profile requires { profileId, updates } and rejects
    // a bare field payload 400 before any write (2026-10-30 promote freeze:
    // the JOV-9625 edit-readback step shipped a bare { bio } PUT).
    expect(source).toContain('data: { profileId, updates: { bio: marker } }');
    expect(source).toContain(
      'data: { profileId, updates: { bio: originalBio } }'
    );
    expect(source).not.toContain('data: { bio: marker }');
    expect(source).not.toContain('data: { bio: originalBio }');
    expect(source).toContain(
      'Profile edit save requires the claimed profile id'
    );
  });
});
