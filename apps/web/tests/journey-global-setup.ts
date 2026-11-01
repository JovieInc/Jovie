import type { FullConfig } from '@playwright/test';
import { verifyWorktreeApp } from '../scripts/playwright-worktree';

// The journey runs against a dev server that compiles each route on first
// request. Compile the signed-out entry routes up front, one at a time with a
// generous bound, so the first browser step measures the product and not a
// cold webpack compile. A route that fails to compile still fails the run here
// with its own name instead of as a hydration timeout deep inside the journey.
const WARM_ROUTES = ['/signup', '/signin', '/start'] as const;

export default async function journeyGlobalSetup(config: FullConfig) {
  await verifyWorktreeApp(config);
  const origin = config.metadata?.worktree?.origin;
  if (!origin) return;
  for (const route of WARM_ROUTES) {
    const response = await fetch(`${origin}${route}`, {
      signal: AbortSignal.timeout(180_000),
      redirect: 'manual',
    });
    if (response.status >= 500) {
      throw new Error(`Journey warm-up: ${route} returned ${response.status}`);
    }
    await response.arrayBuffer();
  }
}
