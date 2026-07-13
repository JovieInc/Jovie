import { describe, expect, it, vi } from 'vitest';
import { validateProductionRobots } from '@/lib/seo/ratchet';
import * as aiPage from '../../../app/(marketing)/ai/page';
import * as investorsPage from '../../../app/(marketing)/investors/page';
import * as demoLayout from '../../../app/demo/layout';
import * as hudPage from '../../../app/hud/page';
import * as investorPortalLayout from '../../../app/investor-portal/layout';
import * as investorPortalPage from '../../../app/investor-portal/page';
import * as investorPortalRespondPage from '../../../app/investor-portal/respond/page';
import * as pitchPage from '../../../app/pitch/page';
import * as sandboxPage from '../../../app/sandbox/page';
import * as sentryExampleLayout from '../../../app/sentry-example-page/layout';
import * as spinnerTestPage from '../../../app/spinner-test/page';
import * as uiLayout from '../../../app/ui/layout';

describe('public surface guardrails', () => {
  it('keeps production robots disallows scoped to safe namespaces', async () => {
    vi.resetModules();
    vi.doMock('@/constants/app', () => ({
      BASE_URL: 'https://jov.ie',
    }));
    vi.doMock('@/lib/env-server', () => ({
      env: {
        VERCEL_ENV: 'production',
      },
    }));

    const { default: robots } = await import('../../../app/robots');
    const metadata = robots();
    const rules = Array.isArray(metadata.rules) ? metadata.rules : [];
    const wildcardRule = rules.find(rule => rule.userAgent === '*');

    expect(wildcardRule?.disallow).toEqual(
      expect.arrayContaining(['/app/', '/api/', '/out/', '/investors/'])
    );
    expect(wildcardRule?.disallow).not.toEqual(
      expect.arrayContaining([
        '/investor-portal',
        '/demo',
        '/sandbox',
        '/spinner-test',
        '/sentry-example-page',
        '/ui',
        '/hud',
      ])
    );
  });

  describe('robots() VERCEL_ENV branch matrix — fail-safe default', () => {
    async function getRobotsMeta(vercelEnv: string | undefined) {
      vi.resetModules();
      vi.doMock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: vercelEnv },
      }));
      const { default: robots } = await import('../../../app/robots');
      return robots();
    }

    it('VERCEL_ENV=production → allow-rules (sitemap present)', async () => {
      const meta = await getRobotsMeta('production');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
      expect(meta.sitemap).toBeTruthy();
    });

    it('VERCEL_ENV=preview → Disallow: / (block all)', async () => {
      const meta = await getRobotsMeta('preview');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.disallow).toBe('/');
      expect(wildcard?.allow).toBeUndefined();
    });

    it('VERCEL_ENV=development → Disallow: / (block all)', async () => {
      const meta = await getRobotsMeta('development');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.disallow).toBe('/');
      expect(wildcard?.allow).toBeUndefined();
    });

    it('VERCEL_ENV="" (empty) → allow-rules (fail-safe: empty ≠ preview)', async () => {
      const meta = await getRobotsMeta('');
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
    });

    it('VERCEL_ENV=undefined → allow-rules (fail-safe: missing ≠ preview)', async () => {
      const meta = await getRobotsMeta(undefined);
      const rules = Array.isArray(meta.rules) ? meta.rules : [];
      const wildcard = rules.find(r => r.userAgent === '*');
      expect(wildcard?.allow).toBe('/');
    });
  });

  describe('AEO ratchet — AI crawler allow rules (JOV-11044)', () => {
    async function getProductionRobots() {
      vi.resetModules();
      vi.doMock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));
      vi.doMock('@/lib/env-server', () => ({
        env: { VERCEL_ENV: 'production' },
      }));
      const { default: robots } = await import('../../../app/robots');
      return robots();
    }

    it('production robots config passes SEO/AEO ratchet (JOV-11044)', async () => {
      const meta = await getProductionRobots();
      const issues = validateProductionRobots(meta);

      expect(
        issues,
        issues
          .map(issue => `${issue.message}\n  ↳ ${issue.remediation}`)
          .join('\n')
      ).toEqual([]);
    });
  });

  it('marks sensitive utility and investor routes as noindex', () => {
    const modules = [
      demoLayout,
      uiLayout,
      sandboxPage,
      spinnerTestPage,
      sentryExampleLayout,
      hudPage,
      investorPortalLayout,
      investorPortalPage,
      investorPortalRespondPage,
      aiPage,
      investorsPage,
      pitchPage,
    ];

    for (const routeModule of modules) {
      expect(routeModule.metadata).toMatchObject({
        robots: {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        },
      });
    }
  });
});
