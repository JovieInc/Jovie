import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  assertExactNavigationUrl,
  primeVercelBypassCookie,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

/**
 * Browser-owned overlays must never block sign-in (Tim, 2026-11-08: "both the
 * google one touch and one password have overlays on screen ... make sure
 * that they never block users on auth screens").
 *
 * Google One Tap (GSI iframe or Chrome's FedCM dialog) and password-manager
 * prompts (1Password's inline sign-in bar, Chrome's own) are drawn by the
 * browser or an extension, so tests can't summon the real ones. Each model
 * below is the overlay's real position and a generous size, drawn in the
 * top layer (a manual popover) so it sits above everything the page draws,
 * the sign-in dialog included, exactly as browser UI does.
 *
 * With every overlay up at once, each primary control must:
 * - on desktop, be fully clear of every overlay without scrolling;
 * - on every size, take a tap where it sits, or scroll clear of the overlay
 *   the way a person pushes the page up past a bottom sheet;
 * - keep focus and keyboard submit working while an overlay is open.
 */

test.use({ storageState: { cookies: [], origins: [] } });

interface OverlayModel {
  readonly id: string;
  /** Box in CSS pixels for a viewport of this size. */
  readonly rect: (vw: number, vh: number) => Rect;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Matches GoogleOneTap's ONE_TAP_PHONE_QUERY, (max-width: 599px). */
const PHONE_MAX_WIDTH = 599;

/**
 * One Tap / FedCM: a card in the top-right corner on desktop. On phones it
 * would be a bottom sheet over the form, so the app doesn't prompt it there
 * (GoogleOneTap's phone guard, covered by its unit test).
 */
const ONE_TAP: OverlayModel = {
  id: 'google-one-tap',
  rect: vw => ({ x: vw - 16 - 400, y: 16, width: 400, height: 380 }),
};

/** 1Password inline sign-in bar: centered at the top of the viewport. */
const PASSWORD_MANAGER_BAR: OverlayModel = {
  id: 'password-manager-bar',
  rect: vw => {
    const width = Math.min(400, vw - 24);
    return { x: Math.round((vw - width) / 2), y: 12, width, height: 96 };
  },
};

function overlaysFor(width: number): readonly OverlayModel[] {
  return width <= PHONE_MAX_WIDTH
    ? [PASSWORD_MANAGER_BAR]
    : [ONE_TAP, PASSWORD_MANAGER_BAR];
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, desktop: true },
  { name: 'laptop', width: 1280, height: 720, desktop: true },
  { name: 'phone', width: 390, height: 844, desktop: false },
  { name: 'small phone', width: 375, height: 667, desktop: false },
] as const;

const OTP_SEND_ROUTE = '**/api/auth/email-otp/send-verification-otp';

async function open(page: Page, pathname: string) {
  const expectedOrigin = requireExactNavigationOrigin(process.env.BASE_URL);
  await primeVercelBypassCookie(page, process.env.BASE_URL, pathname);
  await page.goto(pathname, {
    waitUntil: 'domcontentloaded',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  assertExactNavigationUrl(page.url(), expectedOrigin, `Auth ${pathname}`);
}

async function showOverlays(page: Page, only?: readonly OverlayModel[]) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('viewport size is required');
  const models = only ?? overlaysFor(viewport.width);
  const boxes = models.map(model => ({
    id: model.id,
    ...model.rect(viewport.width, viewport.height),
  }));
  await page.evaluate(list => {
    for (const box of list) {
      document.getElementById(`overlay-model-${box.id}`)?.remove();
      const el = document.createElement('div');
      el.id = `overlay-model-${box.id}`;
      el.dataset.overlayModel = box.id;
      el.setAttribute('popover', 'manual');
      el.style.cssText = [
        'position:fixed',
        'margin:0',
        'padding:0',
        'border:0',
        `left:${box.x}px`,
        `top:${box.y}px`,
        `width:${box.width}px`,
        `height:${box.height}px`,
        'background:rgba(255,0,255,0.35)',
        'inset:auto',
        `inset-inline-start:${box.x}px`,
        `inset-block-start:${box.y}px`,
      ].join(';');
      document.body.append(el);
      // Top layer, opened last, so it is drawn above the sign-in dialog.
      el.showPopover();
    }
  }, boxes);
  return boxes;
}

function intersects(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

async function expectClearOnFirstView(
  controls: Record<string, Locator>,
  overlays: readonly (Rect & { id: string })[]
) {
  for (const [name, control] of Object.entries(controls)) {
    const box = await control.boundingBox();
    expect(box, `${name} is laid out`).not.toBeNull();
    if (!box) continue;
    for (const overlay of overlays) {
      expect(
        intersects(box, overlay),
        `${name} ${JSON.stringify(box)} sits under ${overlay.id} ${JSON.stringify(overlay)}`
      ).toBe(false);
    }
  }
}

/** Is the control itself what a tap at its center lands on? */
function hitAtCenter(control: Locator) {
  return control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth)
      return false;
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit.closest('[data-overlay-model]')) return false;
    // A disabled button takes no pointer events, so the tap reaches the
    // form around it; that still means nothing sits on top of it.
    return node.contains(hit) || hit.contains(node);
  });
}

/**
 * Each control can be reached with an overlay up: either a tap lands on it
 * where it is, or the page scrolls far enough to bring it clear, the way a
 * person would push the page up past a bottom sheet.
 */
async function expectReachable(controls: Record<string, Locator>) {
  for (const [name, control] of Object.entries(controls)) {
    await control.scrollIntoViewIfNeeded();
    if (await hitAtCenter(control)) continue;
    await control.evaluate(node =>
      node.scrollIntoView({ block: 'start', inline: 'nearest' })
    );
    expect(
      await hitAtCenter(control),
      `${name} stays under a browser overlay and can't be scrolled clear of it`
    ).toBe(true);
  }
}

async function expectWaitlistUsable(page: Page, desktop: boolean) {
  const form = page.getByRole('form', { name: /request (access|an invite)/i });
  await expect(form).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  // One Tap only mounts on the sign-in shell; password managers go anywhere.
  const overlays = await showOverlays(page, [PASSWORD_MANAGER_BAR]);
  const controls = {
    'Email address': form.getByRole('textbox', { name: /email/i }),
    Join: form.getByRole('button', { name: /join/i }),
  };
  if (desktop) await expectClearOnFirstView(controls, overlays);
  await expectReachable(controls);
}

function startControls(page: Page) {
  const scope = page.locator('[data-auth-sso-surface]').first();
  return {
    'Continue with Apple': scope.getByRole('button', { name: /apple/i }),
    'Continue with Google': scope.getByRole('button', { name: /google/i }),
    'Email field': scope.getByRole('textbox', { name: /email/i }),
    'Send sign-in code': scope.getByRole('button', {
      name: /send sign-in code/i,
    }),
  };
}

async function reachCodeStep(page: Page) {
  // Never send a real email: the send call is answered locally.
  await page.route(OTP_SEND_ROUTE, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );
  const email = page
    .locator('[data-auth-sso-surface]')
    .first()
    .getByRole('textbox', { name: /email/i });
  await email.fill('overlay-check@example.com');
  // Keyboard submit: a password-manager menu can sit over the button.
  await email.press('Enter');
  const code = page.getByLabel('Digit 1 of 6');
  await expect(code).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  return code;
}

for (const pathname of ['/signin', '/signup']) {
  test.describe(`${pathname} stays usable under browser overlays`, () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await open(page, pathname);
        const shell = page.locator('[data-auth-shell-hydrated="true"]').first();
        const waitlist = page.getByRole('form', {
          name: /request (access|an invite)/i,
        });
        await expect(shell.or(waitlist).first()).toBeVisible({
          timeout: SMOKE_TIMEOUTS.VISIBILITY,
        });
        if (await waitlist.isVisible()) {
          // Sign-up is behind the waitlist here: its form is the surface.
          await expectWaitlistUsable(page, viewport.desktop);
          return;
        }
        const overlays = await showOverlays(page);
        const controls = startControls(page);
        for (const control of Object.values(controls))
          await expect(control).toBeVisible();
        // Pen odZZY: the column sits on the blue gradient backdrop.
        await expect(page.locator('[data-auth-backdrop]')).toHaveCount(1);
        // Pen sizes: 28px pill face inside a 44px tap target.
        const faceBox = await page
          .locator('[data-auth-provider-face]')
          .first()
          .boundingBox();
        expect(Math.round(faceBox?.height ?? 0)).toBe(28);
        const hitBox = await page
          .locator('.auth-provider-button')
          .first()
          .boundingBox();
        expect(hitBox?.height ?? 0).toBeGreaterThanOrEqual(44);

        if (viewport.desktop) await expectClearOnFirstView(controls, overlays);
        await expectReachable(controls);

        // Focus survives an overlay opening, and typing still lands.
        const email = controls['Email field'];
        await email.focus();
        await showOverlays(page);
        await expect(email).toBeFocused();
        await email.pressSequentially('a', { delay: 0 });
        await expect(email).toHaveValue('a');
        await email.fill('');

        const code = await reachCodeStep(page);
        await showOverlays(page);
        const codeControls = {
          'Code field, first digit': code,
          'Code field, last digit': page.getByLabel('Digit 6 of 6'),
          'Verify code': page.getByRole('button', { name: /verify code/i }),
        };
        if (viewport.desktop) {
          await expectClearOnFirstView(codeControls, overlays);
        }
        await expectReachable(codeControls);
      });
    }
  });
}

test.describe('sign-in dialog over the homepage stays usable under browser overlays', () => {
  for (const viewport of VIEWPORTS.filter(v => v.desktop)) {
    test(`${viewport.name} ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page, '/');
      // The dialog only opens from a hydrated page; an early click is a
      // plain navigation to the full sign-in page.
      await page
        .waitForLoadState('networkidle', { timeout: 20_000 })
        .catch(() => {
          // Background requests can stay open; the dialog check below decides.
        });
      await page.locator('nav a[href^="/signin"]').first().click();
      const dialog = page.locator('[data-auth-modal-shell]');
      await expect(dialog).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      await expect(
        dialog.locator('[data-auth-shell-hydrated="true"]').first()
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      const overlays = await showOverlays(page);
      const controls = startControls(page);
      await expectClearOnFirstView(controls, overlays);
      await expectReachable(controls);
    });
  }
});
