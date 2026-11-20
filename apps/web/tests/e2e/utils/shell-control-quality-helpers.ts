import { expect, type Page } from '@playwright/test';
import {
  detectReversibleControl,
  type ReversibleActivation,
} from '../../utils/reversible-control-detector';
import { controls } from './shell-rail-controls';
import {
  gotoAuthenticatedChatRoute,
  waitForHydration,
} from './smoke-test-utils';

/**
 * Shared probes for shell-control-quality.spec.ts: the reversible rail
 * certification, the focus and draft anchors that hold input while rails
 * move, and the single-selected-row check for the left rail.
 */

// Reuse the existing detector with ten COMPLETE cycles, mixing activation
// methods. Hidden staged controls are mounted but never logical actions.
const sequence: ReversibleActivation[] = Array.from(
  { length: 20 },
  (_, index) => (index % 3 === 0 ? 'keyboard' : 'pointer')
);

export async function certify(page: Page, side: 'left' | 'right') {
  const toggle = controls(page, side);
  const count = await toggle.count();
  if (count !== 1)
    throw new Error(`expected one logical ${side} rail action, found ${count}`);
  const initial =
    (await toggle.getAttribute('aria-expanded')) === 'true' ? 'open' : 'closed';
  return detectReversibleControl({
    name: `real composed ${side} rail`,
    states: initial === 'open' ? ['open', 'closed'] : ['closed', 'open'],
    activationSequence: sequence,
    observe: async () => ({
      pinned:
        side === 'left'
          ? await page
              .locator('#shell-left-rail')
              .getAttribute('data-rail-pinned')
          : null,
      preview: await page
        .locator(`[data-rail-preview-region="${side}"]`)
        .getAttribute('data-rail-preview'),
      state:
        (await controls(page, side).getAttribute('aria-expanded')) === 'true'
          ? 'open'
          : 'closed',
    }),
    activate: async via => {
      if (via === 'pointer') await controls(page, side).click();
      else await controls(page, side).press(side === 'left' ? '[' : ']');
      const movingRail = page
        .locator(
          side === 'left'
            ? '[data-state][data-rail-phase]'
            : '[data-testid="app-shell-right-rail"] [data-rail-phase]'
        )
        .first();
      await expect(movingRail).toHaveAttribute(
        'data-rail-phase',
        /^(open|closed)$/
      );
    },
    assertContinuity: async () => {
      const count = await controls(page, side).count();
      if (count !== 1)
        throw new Error(
          `expected one logical ${side} rail action, found ${count}`
        );
      await expect(controls(page, side)).toBeEnabled();
      await expect(page.locator('[data-app-shell-frame]')).toHaveAttribute(
        'data-quality-probe',
        'mounted'
      );
    },
  });
}

/** Always-present Home control used to hold keyboard focus while rails move. */
export function homeFocusAnchor(page: Page) {
  return page.getByRole('button', { name: 'Needs You', exact: true });
}

/**
 * A main-plane text field that holds a typed draft while rails move. Home only
 * renders Notes beside a real queue item, so draft checks use the chat
 * composer; `panel=profile` is the existing E2E switch for its profile rail.
 */
export async function openDraftAnchor(page: Page) {
  await gotoAuthenticatedChatRoute(page, { path: '/app/chat?panel=profile' });
  await waitForHydration(page);
  const composer = page.getByRole('textbox', {
    name: 'Chat Message Input',
    exact: true,
  });
  await expect(composer).toBeVisible();
  await expect(controls(page, 'left')).toHaveCount(1);
  await page
    .locator('[data-app-shell-frame]')
    .evaluate(element => element.setAttribute('data-quality-probe', 'mounted'));
  return composer;
}

/**
 * At most one rail row may be the page (`aria-current="page"`) and at most
 * one may paint the selected style (`data-nav-highlighted`). Tim's
 * 2026-11-14 screenshot showed Inbox and Audience selected together on
 * `/app` while a navigation was pending.
 */
export async function expectAtMostOneSelectedNavRow(page: Page, route: string) {
  const rail = page.locator('#shell-left-rail');
  const current = await rail
    .locator('[data-navigation-item-id][aria-current="page"]')
    .evaluateAll(rows =>
      rows.map(row => row.getAttribute('data-navigation-item-id'))
    );
  const painted = await rail
    .locator('[data-navigation-item-id][data-nav-highlighted]')
    .evaluateAll(rows =>
      rows.map(row => row.getAttribute('data-navigation-item-id'))
    );
  expect(current.length, `${route} aria-current rows: ${current}`).toBeLessThan(
    2
  );
  expect(painted.length, `${route} selected rows: ${painted}`).toBeLessThan(2);
}
