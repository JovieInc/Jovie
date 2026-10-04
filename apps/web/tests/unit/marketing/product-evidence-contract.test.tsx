/**
 * Product-evidence contract (JOV-6917, invariant `product-page-shows-product`).
 *
 * Every product route in the marketing route manifest must declare the
 * canonical product-evidence component it renders (framed screenshot,
 * interactive primitive mockup, or annotated callout) and the rendered page
 * must expose that evidence inside the hero — i.e. the first top-level
 * section — or the first two top-level sections on mobile ordering.
 *
 * The deliberate-red fixture proves both gates fire: a product route that
 * declares no evidence fails the declaration gate, and a copy-only product
 * page fails the rendered-evidence gate.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import {
  isProductRouteEntry,
  MARKETING_ROUTE_MANIFEST,
  productEvidenceDeclarationIssue,
  type RouteManifestEntry,
} from '@/data/marketing';

const mutateMock = vi.hoisted(() => vi.fn());

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: unknown }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    readonly href: string;
    readonly children?: React.ReactNode;
    readonly prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@/lib/queries/useConfirmChatMerchActionMutation', () => ({
  useConfirmChatMerchActionMutation: () => ({
    mutate: mutateMock,
    mutateAsync: mutateMock,
    isPending: false,
  }),
}));

vi.mock('@/lib/analytics', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  track: vi.fn(),
}));

import { JovieCardLanding } from '@/app/(marketing)/card/JovieCardLanding';
import DownloadPage from '@/app/(marketing)/download/page';
import { InstantMerchLanding } from '@/app/(marketing)/instant-merch/InstantMerchLanding';
import { ProductLanding } from '@/app/(marketing)/product/ProductLanding';
import { SmartLinksLanding } from '@/app/(marketing)/smart-links/SmartLinksLanding';
import { SolutionsRecordBody } from '@/app/(marketing)/solutions/[audience]/sections';
import { YoutubeThumbnailsLanding } from '@/app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding';
import { PayLanding } from '@/components/features/pay/PayLanding';
import { ArtistNotificationsLanding } from '@/components/marketing/artist-notifications/ArtistNotificationsLanding';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { VoicePageContent } from '@/components/organisms/VoicePageContent';
import { solutionsArtistsPage } from '@/content/pages/solutions/artists';

// Vitest runs this package with cwd = apps/web.
const WEB_ROOT = process.cwd();
const REPO_ROOT = resolve(WEB_ROOT, '../..');

function componentPathExists(componentPath: string): boolean {
  return (
    existsSync(resolve(REPO_ROOT, componentPath)) ||
    existsSync(resolve(WEB_ROOT, componentPath))
  );
}

/**
 * Rendered-page gate: the declared evidence testId must exist and live
 * inside the hero (first top-level section) or the first two top-level
 * sections — the jsdom proxy for "above the fold on desktop / first two
 * sections on mobile".
 */
function renderedEvidenceIssue(
  container: HTMLElement,
  testId: string
): string | null {
  const root = container.querySelector('main') ?? container;
  const evidence = root.querySelector(`[data-testid="${testId}"]`);
  if (!evidence) {
    return `rendered page does not contain [data-testid="${testId}"]`;
  }
  const topLevelSections = Array.from(
    root.querySelectorAll('section, article')
  ).filter(element => {
    const ancestor = element.parentElement?.closest('section, article');
    return !(ancestor && root.contains(ancestor));
  });
  const fold = topLevelSections.slice(0, 2);
  const withinFold = fold.some(
    section => section === evidence || section.contains(evidence)
  );
  if (!withinFold) {
    return `[data-testid="${testId}"] renders below the first two top-level sections`;
  }
  return null;
}

const RENDERERS: Readonly<Record<string, () => ReactElement>> = {
  '(marketing)/artist-profiles/page.tsx': () => <ArtistProfileLandingRoute />,
  '(marketing)/solutions/[audience]/page.tsx': () => (
    <SolutionsRecordBody record={solutionsArtistsPage} />
  ),
  '(marketing)/artist-notifications/page.tsx': () => (
    <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />
  ),
  '(marketing)/download/page.tsx': () => <DownloadPage />,
  '(marketing)/pay/page.tsx': () => <PayLanding />,
  '(marketing)/voice/page.tsx': () => <VoicePageContent />,
  '(marketing)/instant-merch/page.tsx': () => <InstantMerchLanding />,
  '(marketing)/youtube-thumbnails/page.tsx': () => <YoutubeThumbnailsLanding />,
  '(marketing)/product/page.tsx': () => <ProductLanding />,
  '(marketing)/card/page.tsx': () => <JovieCardLanding />,
  '(marketing)/smart-links/page.tsx': () => <SmartLinksLanding />,
};

const productRoutes = MARKETING_ROUTE_MANIFEST.filter(isProductRouteEntry);

/** Deliberate-red fixture: a product landing page with copy only. */
function CopyOnlyProductLanding() {
  return (
    <main>
      <section>
        <h1>A product page that only talks about the product</h1>
        <p>This hero describes features but never shows them.</p>
      </section>
      <section>
        <h2>More copy about the product</h2>
        <p>Still no framed screenshot, interactive mockup, or callout.</p>
      </section>
    </main>
  );
}

const COPY_ONLY_FIXTURE_ENTRY: Pick<
  RouteManifestEntry,
  'glob' | 'recipeId' | 'status' | 'exempt' | 'productEvidence'
> = {
  glob: '(marketing)/copy-only-fixture/page.tsx',
  recipeId: 'feature',
  status: 'active',
};

describe('product-evidence contract (JOV-6917)', () => {
  it('marks every product route with a declared evidence component', () => {
    expect(productRoutes.length).toBeGreaterThan(0);
    const issues = productRoutes.flatMap(entry => {
      const issue = productEvidenceDeclarationIssue(entry);
      if (issue) return [issue];
      if (!componentPathExists(entry.productEvidence!.componentPath)) {
        return [
          `${entry.glob} productEvidence.componentPath does not exist: ${entry.productEvidence!.componentPath}`,
        ];
      }
      return [];
    });
    expect(issues).toEqual([]);
  });

  it('has a renderer for every product route and no extras', () => {
    expect(Object.keys(RENDERERS).sort()).toEqual(
      productRoutes.map(entry => entry.glob).sort()
    );
  });

  it.each(productRoutes.map(entry => [entry.glob, entry] as const))(
    'renders declared evidence above the fold for %s',
    (_glob, entry) => {
      const renderPage = RENDERERS[entry.glob];
      expect(renderPage, `${entry.glob} needs a renderer`).toBeDefined();
      const { container } = render(renderPage!());
      const issue = renderedEvidenceIssue(
        container,
        entry.productEvidence!.testId
      );
      expect(issue, issue ?? '').toBeNull();
    }
  );

  it('fails the declaration gate for a product route with no evidence (deliberate red)', () => {
    expect(isProductRouteEntry(COPY_ONLY_FIXTURE_ENTRY)).toBe(true);
    expect(productEvidenceDeclarationIssue(COPY_ONLY_FIXTURE_ENTRY)).toMatch(
      /no productEvidence declaration/
    );
  });

  it('fails the rendered gate for a copy-only product page (deliberate red)', () => {
    const { container } = render(<CopyOnlyProductLanding />);
    expect(renderedEvidenceIssue(container, 'chat-merch-option-card')).toMatch(
      /does not contain/
    );
  });
});
