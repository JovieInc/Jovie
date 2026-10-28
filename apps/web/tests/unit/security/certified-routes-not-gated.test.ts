import { describe, expect, it } from 'vitest';
import {
  MARKETING_EXACT_PUBLIC_ROUTE_TARGETS,
  MARKETING_ROUTE_HEALTH_TARGETS,
} from '@/data/marketing';
import { isProductionBlockedDebugPath } from '@/lib/security/production-blocked-routes';

/**
 * Guard (2026-10-25): #23229 production-blocked /engineering/preview, but the
 * route manifest still certified it as a public page, so Route DOM
 * certification expected <400, got 404, and ejected a merge group (run
 * 40190084141). A production-gated route may stay in the manifest only with
 * an expected `not-found` health check, never as a certified public page.
 */
describe('certified public routes are reachable in production', () => {
  it('no Route DOM certification target is production-blocked', () => {
    const gated = MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.flatMap(target =>
      [target.url, target.fixturePath].filter(path =>
        isProductionBlockedDebugPath(path)
      )
    );
    expect(gated).toEqual([]);
  });

  it('no route health target expects a page at a production-blocked path', () => {
    const gated = MARKETING_ROUTE_HEALTH_TARGETS.filter(
      target =>
        target.expected !== 'not-found' &&
        isProductionBlockedDebugPath(target.path)
    ).map(target => `${target.glob} -> ${target.path} (${target.expected})`);
    expect(gated).toEqual([]);
  });

  it('keeps the engineering preview gated with an expected 404', () => {
    const preview = MARKETING_ROUTE_HEALTH_TARGETS.filter(target =>
      target.path.startsWith('/engineering/preview')
    );
    expect(preview.length).toBe(2);
    for (const target of preview) expect(target.expected).toBe('not-found');
  });
});
