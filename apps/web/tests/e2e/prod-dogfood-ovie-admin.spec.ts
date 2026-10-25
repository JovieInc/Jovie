import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type APIResponse, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  type DogfoodCheck,
  dogfoodOutDir,
  inspectPage,
} from './utils/prod-dogfood-inspect';
import { resolveProductionAdminObserverCredentials } from './utils/production-auth-credentials';
import { signInViaRenderedFlow } from './utils/production-auth-signin';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production dogfood agent, Ovie admin half. Signs in as the seeded
 * browse-admin identity, which must hold the read-only operator role
 * (users.admin_role = 'read_only'), walks the Ovie admin pages READ-ONLY, and
 * proves in production that a write attempt is refused.
 *
 * Safety fuse: before browsing, a harmless write probe (POST /api/admin/roles
 * with an empty body) must answer 403. A full admin would answer 400 (the body
 * is validated after the admin check) and nothing is written either way. Any
 * answer other than 403 stops the run with a P0 finding, so a missing or revoked
 * role can never leave CI browsing Ovie as a full admin.
 *
 * @production-dogfood
 */

test.use({ storageState: { cookies: [], origins: [] } });

const MISSION = 'dogfood:ovie-admin';

// GET renders only. These are exactly the pages a read-only operator may open
// (admin-read-only-contract.test.ts pins the same list in the app).
const OBSERVER_PAGES = [
  { page: 'ov-home', path: APP_ROUTES.ADMIN },
  { page: 'ov-inbox', path: APP_ROUTES.ADMIN_INBOX },
  { page: 'ov-shipping', path: APP_ROUTES.ADMIN_SHIPPING },
  { page: 'ov-product', path: APP_ROUTES.ADMIN_PRODUCT },
  { page: 'ov-operations', path: APP_ROUTES.ADMIN_OPERATIONS },
  { page: 'ov-ops', path: APP_ROUTES.ADMIN_OPS },
  { page: 'ov-costs', path: `${APP_ROUTES.ADMIN}/costs` },
  { page: 'ov-certifications', path: `${APP_ROUTES.ADMIN}/certifications` },
] as const;

// Pages that show PII or live bearer tokens (investor links). They must be
// invisible to the observer: opening one has to bounce away, never render.
const HIDDEN_PAGES = [
  APP_ROUTES.ADMIN_INVESTORS,
  APP_ROUTES.ADMIN_PEOPLE,
  APP_ROUTES.ADMIN_USERS,
  APP_ROUTES.ADMIN_WAITLIST,
  APP_ROUTES.ADMIN_LEADS,
  APP_ROUTES.ADMIN_OUTREACH,
  APP_ROUTES.ADMIN_INTERVIEWS,
  APP_ROUTES.ADMIN_FEEDBACK,
] as const;

// Write attempts that a read-only operator must be refused. The empty body is
// deliberate: even if an attempt were ever admitted, it validates and changes
// nothing. All are refused at the gate before any validation, so 403 exactly.
const WRITE_PROBES = [
  { name: 'role-grant', method: 'POST', path: '/api/admin/roles' },
  { name: 'role-revoke', method: 'DELETE', path: '/api/admin/roles' },
  {
    name: 'privileged-invite',
    method: 'POST',
    path: '/api/admin/creator-invite',
  },
] as const;

test.describe('Production dogfood (Ovie admin, read-only observer) @production-dogfood', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420_000);

  test('read-only observer views Ovie and cannot write', async ({
    page,
  }, testInfo) => {
    const credentials = resolveProductionAdminObserverCredentials();
    const baseUrl = testInfo.project.use.baseURL;
    if (typeof baseUrl !== 'string') throw new Error('baseURL required');
    const origin = new URL(baseUrl).origin;
    const checks: DogfoodCheck[] = [];
    const add = (check: Omit<DogfoodCheck, 'mission'>) =>
      checks.push({ mission: MISSION, ...check });
    const write = () => {
      mkdirSync(dogfoodOutDir(), { recursive: true });
      writeFileSync(
        path.join(dogfoodOutDir(), 'admin-checks.json'),
        `${JSON.stringify({ origin, checks }, null, 2)}\n`
      );
    };
    const unverified = (summary: string) => {
      add({
        id: 'auth-signin',
        target: `${origin}/signin`,
        status: 'unverified',
        summary,
      });
      write();
    };

    if (!credentials) {
      unverified(
        'Ovie admin observer not run: DATABASE_URL (OTP source) is unavailable'
      );
      return;
    }

    let result = 'unknown';
    try {
      for (
        let attempt = 0;
        attempt < 2 && result !== 'authenticated';
        attempt += 1
      ) {
        await page.goto(APP_ROUTES.SIGNIN, {
          waitUntil: 'domcontentloaded',
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        });
        result = await signInViaRenderedFlow(page, credentials, origin);
      }
    } catch (error) {
      result = `error: ${String((error as Error).message).split('\n')[0]}`;
    }
    if (result !== 'authenticated') {
      unverified(
        `observer sign-in did not complete (${result}); is the browse-admin identity seeded in production?`
      );
      return;
    }
    await waitForHydration(page);

    const request = page.context().request;
    const probe = (method: string, probePath: string): Promise<APIResponse> =>
      request.fetch(`${origin}${probePath}`, { method, data: {} });

    // Fuse: must be refused before anything else happens.
    const fuse = await probe('POST', '/api/admin/roles');
    if (fuse.status() !== 403) {
      add({
        id: 'ovie-admin-role-fuse',
        target: `${origin}/api/admin/roles#fuse`,
        status: 'failed',
        severity: 'P0',
        summary:
          'the Ovie observer identity is not read-only; the run stopped before browsing',
        expected: 'HTTP 403 for a write probe',
        actual: `HTTP ${fuse.status()} (400 means a full admin session)`,
        url: `${origin}/api/admin/roles`,
      });
      write();
      return;
    }
    add({
      id: 'ovie-admin-role-fuse',
      target: `${origin}/api/admin/roles#fuse`,
      status: 'passed',
      summary: 'observer is read-only: the write probe was refused with 403',
    });

    for (const attempt of WRITE_PROBES) {
      const response = await probe(attempt.method, attempt.path);
      const target = `${origin}${attempt.path}#${attempt.name}`;
      add(
        response.status() === 403
          ? {
              id: 'ovie-admin-write-refused',
              target,
              status: 'passed',
              summary: `${attempt.name} refused with 403`,
            }
          : {
              id: 'ovie-admin-write-refused',
              target,
              status: 'failed',
              severity: 'P0',
              summary: `a read-only operator write attempt was not refused: ${attempt.name}`,
              expected: 'HTTP 403',
              actual: `HTTP ${response.status()}`,
              url: `${origin}${attempt.path}`,
            }
      );
    }

    const read = await request.get(`${origin}/api/hud/shipping-state`);
    add(
      read.status() === 200
        ? {
            id: 'ovie-admin-read-api',
            target: `${origin}/api/hud/shipping-state`,
            status: 'passed',
            summary: 'observation API readable',
          }
        : {
            id: 'ovie-admin-read-api',
            target: `${origin}/api/hud/shipping-state`,
            status: 'failed',
            severity: 'P1',
            summary:
              'the read-only observer cannot read the Ovie shipping state',
            expected: 'HTTP 200',
            actual: `HTTP ${read.status()}`,
            url: `${origin}/api/hud/shipping-state`,
          }
    );

    for (const hidden of HIDDEN_PAGES) {
      const target = `${origin}${hidden}#hidden`;
      await page.goto(hidden, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      const landed = new URL(page.url()).pathname;
      const stayed = landed === hidden || landed.startsWith(`${hidden}/`);
      add(
        stayed
          ? {
              id: 'ovie-admin-pii-pages-hidden',
              target,
              status: 'failed',
              severity: 'P0',
              summary: `a read-only operator can open a PII or token page: ${hidden}`,
              expected: 'redirected away from the page',
              actual: `stayed on ${landed}`,
              url: `${origin}${hidden}`,
            }
          : {
              id: 'ovie-admin-pii-pages-hidden',
              target,
              status: 'passed',
              summary: `${hidden} is not visible to the observer`,
            }
      );
    }

    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const spec of OBSERVER_PAGES) {
        await inspectPage(
          page,
          { ...spec, mission: MISSION, checkId: 'ovie-admin-page-clean' },
          viewport,
          checks
        );
      }
    }
    write();
  });
});
