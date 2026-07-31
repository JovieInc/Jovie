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
    expect(source).toContain('readyPath: APP_ROUTES.LIBRARY');
    expect(source).toContain("readyTestId: 'library-surface'");
    expect(source).toContain("readyView: 'releases'");
    expect(source).toContain('await page.waitForURL(');
    expect(source).toContain('await waitForProductionDashboardContent(');
    expect(
      source.match(/await verifyProductionIosOAuthTokenFlow\(/gu)
    ).toHaveLength(1);
    expect(source).toContain("grant_type: 'authorization_code'");
    expect(source).toContain("grant_type: 'refresh_token'");
    expect(source).toContain('/api/auth/oauth2/userinfo');
    // Native public-client token POSTs must stay cookie-free. Browser session
    // cookies without Origin trip Better Auth CSRF (HTTP 403) before OAuth.
    expect(source).toContain('playwrightRequest.newContext');
    expect(source).toContain('x-vercel-protection-bypass');
    expect(source).toContain('nativeRequest.dispose');
    expect(source).toContain('safeOAuthErrorBody');
    expect(source).toContain('/api/auth/oauth2/revoke');
    expect(source).toContain('recordPlaywrightSensitiveValues(');
    const tabNavigation = source.split('const tabs = ')[1];
    expect(tabNavigation).toBeDefined();
    expect(tabNavigation).not.toContain('.isVisible({ timeout:');
  });
});
