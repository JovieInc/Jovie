/**
 * SEO/AEO Ratchet Guardrail (JOV-11044)
 *
 * Ratchet principle: once a route is in this baseline, it can never silently
 * lose required SEO tags. A PR that removes title/description/OG from a
 * baseline-clean route will fail CI here.
 *
 * To add a new route: import it and add an entry to BASELINE_ROUTES.
 * To intentionally remove SEO from a route: remove it from BASELINE_ROUTES in
 * the same PR (requires human review).
 *
 * Related: JOV-11043 (incident), JOV-11029 (AEO epic)
 */
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequiredField = 'title' | 'description' | 'openGraph' | 'twitter';

interface BaselineEntry {
  /** Human-readable name used in test failure messages */
  route: string;
  /** Dynamic import of the route module */
  importFn: () => Promise<{ metadata?: Metadata }>;
  /** Which SEO fields this route must have */
  required: RequiredField[];
}

// ---------------------------------------------------------------------------
// Baseline — the ratchet lock
//
// Add routes here once they have clean SEO. Remove only with intentional PR.
// ---------------------------------------------------------------------------

const BASELINE_ROUTES: BaselineEntry[] = [
  {
    route: '/about',
    importFn: () => import('../../../app/(marketing)/about/page'),
    required: ['title', 'description', 'openGraph'],
  },
  {
    route: '/pricing',
    importFn: () => import('../../../app/(marketing)/pricing/page'),
    required: ['title', 'description', 'openGraph', 'twitter'],
  },
  {
    route: '/support',
    importFn: () => import('../../../app/(marketing)/support/page'),
    required: ['title', 'description', 'openGraph'],
  },
  {
    route: '/artist-profiles',
    importFn: () => import('../../../app/(marketing)/artist-profiles/page'),
    required: ['title', 'description', 'openGraph', 'twitter'],
  },
  {
    route: '/download',
    importFn: () => import('../../../app/(marketing)/download/page'),
    required: ['title', 'description', 'openGraph', 'twitter'],
  },
  {
    route: '/blog',
    importFn: () => import('../../../app/(marketing)/blog/page'),
    required: ['title', 'description'],
  },
  {
    route: '/changelog',
    importFn: () => import('../../../app/(marketing)/changelog/page'),
    required: ['title', 'description'],
  },
];

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertTitle(metadata: Metadata | undefined, route: string) {
  const title = metadata?.title;
  const resolved =
    typeof title === 'string'
      ? title
      : typeof title === 'object' && title !== null && 'default' in title
        ? (title as { default: string }).default
        : null;

  expect(
    resolved,
    `${route}: metadata.title must be a non-empty string`
  ).toBeTruthy();
  expect(typeof resolved, `${route}: metadata.title must be a string`).toBe(
    'string'
  );
}

function assertDescription(metadata: Metadata | undefined, route: string) {
  expect(
    metadata?.description,
    `${route}: metadata.description must be a non-empty string`
  ).toBeTruthy();
  expect(
    typeof metadata?.description,
    `${route}: metadata.description must be a string`
  ).toBe('string');
}

function assertOpenGraph(metadata: Metadata | undefined, route: string) {
  const og = metadata?.openGraph;
  expect(og, `${route}: metadata.openGraph must be present`).toBeDefined();
  expect(
    og?.title,
    `${route}: metadata.openGraph.title must be non-empty`
  ).toBeTruthy();
  expect(
    og?.description,
    `${route}: metadata.openGraph.description must be non-empty`
  ).toBeTruthy();
}

function assertTwitter(metadata: Metadata | undefined, route: string) {
  const tw = metadata?.twitter;
  expect(tw, `${route}: metadata.twitter must be present`).toBeDefined();
  expect(tw?.card, `${route}: metadata.twitter.card must be set`).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SEO ratchet — baseline routes must never lose required tags (JOV-11044)', () => {
  for (const entry of BASELINE_ROUTES) {
    it(`${entry.route} has required SEO fields: ${entry.required.join(', ')}`, async () => {
      const mod = await entry.importFn();
      const metadata = mod.metadata as Metadata | undefined;

      // Every route in the baseline must export metadata
      expect(
        metadata,
        `${entry.route}: must export a metadata object`
      ).toBeDefined();

      // The route must not be noindex (that would belong in the noindex baseline instead)
      const robotsMeta = metadata?.robots;
      if (
        robotsMeta &&
        typeof robotsMeta === 'object' &&
        'index' in robotsMeta
      ) {
        expect(
          (robotsMeta as { index?: boolean }).index,
          `${entry.route}: is in the SEO ratchet baseline but has robots.index=false — move to noindex baseline if intentional`
        ).not.toBe(false);
      }

      for (const field of entry.required) {
        switch (field) {
          case 'title':
            assertTitle(metadata, entry.route);
            break;
          case 'description':
            assertDescription(metadata, entry.route);
            break;
          case 'openGraph':
            assertOpenGraph(metadata, entry.route);
            break;
          case 'twitter':
            assertTwitter(metadata, entry.route);
            break;
        }
      }
    });
  }
});
