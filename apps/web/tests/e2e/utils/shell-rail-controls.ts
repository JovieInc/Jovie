import { expect, type Locator, type Page } from '@playwright/test';

/** The one visible, non-inert rail toggle for a side of the composed shell. */
export const controls = (page: Page, side: 'left' | 'right') =>
  page
    .locator(`[data-rail-toggle="${side}"]:not([inert] *)`)
    .filter({ visible: true });

/**
 * A pinned (open) right rail is a column that pushes the route and never lays
 * on top of it: it is open, presents as push, starts at or after the route's
 * right edge, and the route ends up narrower than it was before the rail.
 */
export async function expectRailPushesRoute(
  plane: Locator,
  inspector: Locator,
  initial: { width: number } | null
) {
  await expect(inspector).toHaveAttribute('data-rail-phase', 'open');
  await expect(inspector).toHaveAttribute('data-rail-presentation', 'push');
  await expect
    .poll(async () => {
      const [route, rail] = await Promise.all([
        plane.boundingBox(),
        inspector.boundingBox(),
      ]);
      return route && rail ? rail.x - (route.x + route.width) : -1;
    })
    .toBeGreaterThanOrEqual(-0.5);
  expect((await plane.boundingBox())!.width).toBeLessThan(initial!.width);
}
