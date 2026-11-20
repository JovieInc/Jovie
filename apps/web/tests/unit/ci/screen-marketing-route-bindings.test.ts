import { describe, expect, it } from 'vitest';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import * as screenCert from '../../../../../scripts/invariants/screen-certification.mjs';

// scripts/ is plain JS (allowJs infers its types); pin the shapes this test
// relies on explicitly.
const SCREEN_MARKETING_ROUTES =
  screenCert.SCREEN_MARKETING_ROUTES as unknown as Record<string, string>;
const SCREEN_REGISTRY = screenCert.SCREEN_REGISTRY as unknown as readonly {
  id: string;
  sources: readonly string[];
}[];

// JOV-INV-018 incident 2026-10-30 (Product Screenshots run 41106813919):
// SCREEN_MARKETING_ROUTES bound web.engineering-preview to /engineering/preview,
// but that route is production-blocked (lib/security/production-blocked-routes.ts)
// and noindex, so MARKETING_EXACT_PUBLIC_ROUTE_TARGETS — the exact capture set
// marketing-routes.spec.ts iterates — excludes it (healthCheck expected
// 'not-found'). The shared marketing artifact could therefore never contain the
// screen's receipt pair, and every per-screen certification invocation (each
// exporting SCREEN_CERT_ARTIFACT_ID) rejected that artifact as unacceptable
// while the changed screen also reported "missing exact-head proof". Three
// more bindings had the same defect latent (deprecated-redirect routes and
// render-fixture routes are excluded from the capture set too).
//
// The SCREEN_MARKETING_ROUTES table's own contract (see its header comment in
// scripts/invariants/screen-certification.mjs) is that every bound route is a
// live capture target, i.e. the marketing artifact provably contains the
// screen's evidence. This test enforces that contract against the real
// manifest so a dead binding can never merge again.

const coversSource = (sourcePath: string, sources: readonly string[]) =>
  sources.some(source => {
    const normalized = source.replace(/\\/g, '/');
    return (
      sourcePath === normalized ||
      sourcePath.startsWith(
        normalized.endsWith('/') ? normalized : `${normalized}/`
      )
    );
  });

describe('SCREEN_MARKETING_ROUTES capture-target bindings', () => {
  it('binds only routes marketing-routes.spec.ts actually captures', () => {
    const targets = new Map(
      MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.map(target => [target.url, target])
    );

    const bound = Object.entries(SCREEN_MARKETING_ROUTES);
    expect(bound.length).toBeGreaterThan(0);

    for (const [screenId, route] of bound) {
      const target = targets.get(route);
      expect(
        target,
        `${screenId} binds ${route}, which MARKETING_EXACT_PUBLIC_ROUTE_TARGETS does not contain — the marketing producer can never capture it and every certification invocation will reject the shared artifact. Leave the screen unmapped or give it a real producer.`
      ).toBeDefined();

      const screen = SCREEN_REGISTRY.find(entry => entry.id === screenId);
      expect(screen, `${screenId} must stay registered`).toBeDefined();

      const covered = coversSource(
        target?.sourcePath ?? '',
        screen?.sources ?? []
      );
      expect(
        covered,
        `${screenId} binds ${route}, but the capture target's sourcePath ${target?.sourcePath} is not covered by the screen's registered sources (${(screen?.sources ?? []).join(', ')}) — the marketing receipt could never match.`
      ).toBe(true);
    }
  });

  it('keeps the incident dead bindings removed', () => {
    // Regression pins for the 2026-10-30 incident and the same-class latent
    // defects found in the same sweep. Each route below is excluded from
    // MARKETING_EXACT_PUBLIC_ROUTE_TARGETS: /engineering/preview is
    // production-blocked and noindex (healthCheck expected 'not-found');
    // /new and /artist-profile are deprecated redirect entries; /renders and
    // /renders/profile-admission are render-fixture routes
    // (lib/render-fixture-policy.ts RENDER_FIXTURE_ROUTE_GLOBS).
    expect(SCREEN_MARKETING_ROUTES['web.engineering-preview']).toBeUndefined();
    expect(SCREEN_MARKETING_ROUTES['web.marketing-new']).toBeUndefined();
    expect(SCREEN_MARKETING_ROUTES['web.artist-profile']).toBeUndefined();
    expect(SCREEN_MARKETING_ROUTES['web.marketing-renders']).toBeUndefined();
    expect(SCREEN_MARKETING_ROUTES['web.profile-admission']).toBeUndefined();
  });
});
