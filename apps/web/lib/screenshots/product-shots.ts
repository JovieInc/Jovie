import productShotManifest from './product-shots.manifest.json';
import type { ScreenshotTheme, ScreenshotViewport } from './types';

/**
 * Product shots: composed marketing imagery rendered from real components.
 *
 * This extends the screenshot registry (`registry.ts`), it does not replace
 * it. A scenario captures a surface for the catalog; a shot is the one
 * product moment a marketing section shows. Each shot names a demo route that
 * renders the real component in a curated state with canary data, crops
 * tightly to one element, and records the source files that make it stale.
 *
 * Render: `pnpm --filter @jovie/web shots:render [--only <id>] [--stale]`
 * against a running demo-mode server. The renderer writes
 * `public/product-shots/<id>.{avif,webp}` and `product-shots.manifest.json`.
 * Guard: `scripts/invariants/art-direction/product-shots.mjs` fails when a
 * source file changes after the shot was rendered.
 *
 * Framing rules (shared by every shot):
 * - The pixels are the UI only. Frames, radius, hairline and shadow come from
 *   `<ProductShot>` in CSS on DS tokens, never baked into the image.
 * - One moment per shot: crop to the element, not the viewport.
 * - Rendered at 2x DPR; `displayWidth` is the largest CSS width it shows at.
 * - Dark first; a light variant is a separate shot id when a page needs it.
 */

export type ProductShotFrame = 'bare' | 'window' | 'phone';

export interface ProductShotSpec {
  readonly id: string;
  readonly title: string;
  /** Visible description for assistive tech. Describe the moment, not the image. */
  readonly alt: string;
  readonly route: string;
  readonly viewport: ScreenshotViewport;
  readonly theme: ScreenshotTheme;
  readonly waitFor: string;
  /**
   * Elements that make up the moment. The crop is the union of their
   * bounding boxes plus `padding`, so a shot can frame a heading and its
   * control without wrapping product markup in a capture-only element.
   */
  readonly crop: readonly string[];
  /**
   * CSS px of surrounding UI kept around the element (default 0). Per-side
   * values let a crop compensate for a heading's line-box leading so the
   * visible margins balance optically.
   */
  readonly padding?:
    | number
    | {
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
        readonly left: number;
      };
  /** Clip the crop height in CSS px (keeps tall lists to one moment). */
  readonly maxHeight?: number;
  readonly frame: ProductShotFrame;
  /** Largest CSS width the shot renders at on a marketing page. */
  readonly displayWidth: number;
  /** Repo-relative files whose change makes this shot stale. */
  readonly sources: readonly string[];
  /** Marketing routes that show this shot. */
  readonly placements: readonly string[];
  readonly fixedNow?: string;
  /**
   * Narrow-screen art direction: the same moment captured from the real
   * component at the mobile viewport, served below 48rem by `<ProductShot>`.
   * Use it when the desktop crop would shrink type below legibility on a
   * phone (manifest id `<id>--mobile`).
   */
  readonly mobile?: ProductShotVariantSpec;
}

export interface ProductShotVariantSpec {
  readonly route?: string;
  readonly crop: readonly string[];
  readonly padding?: ProductShotSpec['padding'];
  readonly displayWidth: number;
}

export const PRODUCT_SHOT_MOBILE_SUFFIX = '--mobile';

export const PRODUCT_SHOT_DPR = 2;
export const PRODUCT_SHOT_PUBLIC_DIR = '/product-shots';

const DEMO = 'apps/web/components/features/demo';
const ONBOARDING =
  'apps/web/components/features/dashboard/organisms/onboarding';
const PROFILE = 'apps/web/components/features/profile';
const ONBOARDING_COPY =
  'apps/web/components/features/dashboard/organisms/onboarding-v2/shared/types.ts';
const STAGE = '[data-testid="onboarding-stage-framed"]';

export const PRODUCT_SHOTS = [
  {
    id: 'setup-claim-handle',
    title: 'Claim your handle',
    alt: 'Jovie onboarding with the handle tim entered after jov.ie/.',
    route: '/demo/showcase/onboarding-handle?profile=tim-white',
    // The real mobile layout at every width: at 1440 the desktop field is
    // 672px wide and the handle reads as a mostly empty pill.
    viewport: 'mobile',
    theme: 'dark',
    waitFor: '[data-testid="onboarding-handle-submit"]',
    crop: [`${STAGE} h1`, '[data-testid="onboarding-handle-submit"]'],
    // 16px sides keep the crop inside the stage's 24px corner radius
    // (stage edge x=16, heading x=37) so no frame arc shows; the bottom
    // balances the ~21px the heading's line box leaves above its caps
    // (blind critique 2026-10-29: 32 read bottom-heavy).
    padding: { top: 14, right: 16, bottom: 26, left: 16 },
    frame: 'bare',
    displayWidth: 358,
    sources: [
      `${ONBOARDING}/OnboardingHandleStep.tsx`,
      ONBOARDING_COPY,
      `${DEMO}/DemoShowcaseSurface.tsx`,
      'apps/web/components/features/onboarding/OnboardingExperienceShell.tsx',
    ],
    placements: ['/artist-profiles', '/solutions/artists'],
  },
  {
    id: 'setup-connect-music',
    title: 'Connect your music',
    alt: 'Jovie onboarding asking the artist to find their music on Spotify.',
    route: '/demo/showcase/onboarding-dsp',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="demo-showcase-onboarding-dsp"]',
    crop: [`${STAGE} h1`, `${STAGE} button:has-text("Skip For Now")`],
    padding: 40,
    frame: 'bare',
    displayWidth: 560,
    sources: [
      `${ONBOARDING}/OnboardingDspStep.tsx`,
      ONBOARDING_COPY,
      `${DEMO}/DemoShowcaseSurface.tsx`,
      'apps/web/components/features/onboarding/OnboardingExperienceShell.tsx',
    ],
    placements: ['/artist-profiles', '/solutions/artists'],
  },
  {
    id: 'setup-share-profile',
    title: 'Share your profile',
    alt: "The share sheet on Tim White's Jovie profile: Copy Link, Instagram Story, X, Threads and Email.",
    route: '/demo/showcase/tim-white-profile?state=share',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="profile-menu-drawer"]',
    crop: ['[data-testid="profile-menu-drawer"]'],
    frame: 'bare',
    displayWidth: 382,
    sources: [
      `${DEMO}/DemoTimWhiteProfileSurface.tsx`,
      `${PROFILE}/ProfileUnifiedDrawer.tsx`,
      'apps/web/components/features/share/PublicShareMenu.tsx',
      'apps/web/components/features/home/homepage-profile-preview-fixture.ts',
    ],
    placements: ['/artist-profiles', '/solutions/artists'],
  },
  {
    id: 'profile-hero-desktop',
    title: 'Profile, release day',
    alt: "Tim White's Jovie profile on desktop leading with the new release.",
    route: '/demo/showcase/tim-white-profile?release=live',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="profile-compact-shell"]',
    crop: [
      '[data-testid="profile-identity-header"]',
      '[data-testid="profile-pac"]',
    ],
    padding: 48,
    frame: 'bare',
    displayWidth: 820,
    sources: [
      `${DEMO}/DemoTimWhiteProfileSurface.tsx`,
      `${PROFILE}/templates/ProfileCompactTemplate.tsx`,
      `${PROFILE}/ProfileIdentityHeader.tsx`,
      `${PROFILE}/pac/ProfilePacCard.tsx`,
    ],
    placements: ['/artist-profiles', '/solutions/artists'],
  },
  {
    id: 'home-profile-release',
    title: 'One link, release first',
    alt: "Tim White's Jovie link leading with Take Me Over, with Get Updates beside the handle.",
    route: '/demo/showcase/tim-white-profile?release=live',
    viewport: 'mobile',
    theme: 'dark',
    waitFor: '[data-testid="profile-pac"]',
    // From the handle down: the face stays off the homepage (approved
    // people only), the release art stays square with its title below.
    crop: [
      '[data-testid="profile-identity-handle"]',
      '[data-testid="profile-pac"]',
    ],
    // Top stays tight so the name above the handle never enters the crop.
    padding: { top: 6, right: 20, bottom: 20, left: 20 },
    frame: 'bare',
    displayWidth: 400,
    sources: [
      `${DEMO}/DemoTimWhiteProfileSurface.tsx`,
      `${PROFILE}/templates/ProfileCompactTemplate.tsx`,
      `${PROFILE}/ProfileIdentityHeader.tsx`,
      `${PROFILE}/pac/ProfilePacCard.tsx`,
    ],
    placements: ['/'],
  },
  {
    id: 'home-smart-link',
    title: 'Smart link chooser',
    alt: 'The Take Me Over smart link opening Spotify, with Apple Music and YouTube Music below.',
    route: '/demo/showcase/homepage-moment?moment=smart-link',
    viewport: 'mobile',
    theme: 'dark',
    waitFor: '[data-testid="homepage-moment-smart-link"]',
    // The chooser only: the page's title sits on the cover art, and the
    // homepage never shows text on lettered art.
    crop: [
      '[data-testid="homepage-moment-smart-link"] :is(a,button,[role="button"]):has-text("Stream Now")',
      'text=YouTube Music',
    ],
    padding: 24,
    frame: 'bare',
    displayWidth: 360,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${DEMO}/homepage-moment-fixtures.ts`,
      'apps/web/app/r/[slug]/ReleaseLandingPage.tsx',
      'apps/web/components/features/release/MusicServiceDial.tsx',
    ],
    placements: ['/'],
  },
  {
    id: 'home-capture',
    title: 'Get Updates email step',
    alt: 'The Get Updates step asking for an email address on a Jovie link.',
    route: '/demo/showcase/homepage-moment?moment=capture',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="homepage-moment-capture"] input',
    crop: ['text=Get New Music', 'text=Not Now'],
    padding: 28,
    frame: 'bare',
    displayWidth: 360,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${PROFILE}/artist-notifications-cta/ProfileInlineNotificationsCTA.tsx`,
      `${PROFILE}/artist-notifications-cta/shared.tsx`,
      'apps/web/components/features/release/ReleaseNotificationsProvider.tsx',
    ],
    placements: ['/'],
  },
  {
    id: 'home-release-email',
    title: 'Release day email',
    alt: 'The release day email: Tim White just dropped new music, The Deep End is out now, with Spotify and Apple Music buttons.',
    route: '/demo/showcase/homepage-email',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="homepage-moment-email"]',
    crop: ['[data-testid="homepage-moment-email"]'],
    frame: 'bare',
    displayWidth: 400,
    sources: [
      `${DEMO}/DemoHomepageEmailMoment.tsx`,
      `${DEMO}/homepage-moment-email.ts`,
      `${DEMO}/homepage-moment-fixtures.ts`,
      'apps/web/lib/email/templates/release-day-notification.ts',
    ],
    placements: ['/'],
  },
  {
    id: 'home-subscriber-list',
    title: 'Subscribers',
    alt: 'The Jovie audience table listing new email subscribers, each marked Subscriber with email alerts on.',
    route: '/demo/showcase/homepage-moment?moment=list',
    viewport: 'desktop',
    theme: 'dark',
    // Last Seen formats after hydration; wait for the first relative time.
    waitFor: '[data-testid="homepage-moment-list"] td:has-text("1h")',
    crop: ['[data-testid="homepage-moment-list"] table'],
    maxHeight: 260,
    frame: 'window',
    displayWidth: 720,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${DEMO}/homepage-moment-fixtures.ts`,
      'apps/web/components/features/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx',
    ],
    placements: ['/'],
  },
  {
    id: 'home-catalog',
    title: 'Imported catalog',
    alt: "Tim White's releases imported into Jovie: The Deep End and Take Me Over, each live.",
    route: '/demo/showcase/homepage-moment?moment=catalog',
    viewport: 'desktop',
    theme: 'dark',
    // Wait for real cover art, not the loading placeholder.
    waitFor: '[data-testid="homepage-moment-catalog"] [style*="take-me-over"]',
    // Title to status only: the date column is fixture-relative, so it
    // never enters the crop (no invented dates on the homepage).
    crop: [
      '[data-testid="homepage-moment-catalog"] :text("The Deep End")',
      '[data-testid="homepage-moment-catalog"] :nth-match(:text-is("Live"), 2)',
    ],
    padding: { top: 18, right: 20, bottom: 18, left: 44 },
    frame: 'window',
    displayWidth: 720,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${DEMO}/DemoReleasesExperience.tsx`,
      `${DEMO}/mock-release-data.ts`,
    ],
    placements: ['/'],
  },
  {
    // Phone art direction for home-subscriber-list: the address and its
    // state only, legible at phone width (shown below 48rem by the page).
    id: 'home-subscriber-list-phone',
    title: 'Subscribers (phone)',
    alt: 'New email subscribers in the Jovie audience table, each marked Subscriber.',
    route: '/demo/showcase/homepage-moment?moment=list',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="homepage-moment-list"] td:has-text("1h")',
    crop: [
      '[data-testid="homepage-moment-list"] th:has-text("Member")',
      '[data-testid="homepage-moment-list"] tbody tr:last-child :text-is("Subscriber")',
    ],
    padding: 12,
    frame: 'window',
    displayWidth: 358,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${DEMO}/homepage-moment-fixtures.ts`,
      'apps/web/components/features/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx',
    ],
    placements: ['/'],
  },
  {
    // Phone art direction for home-catalog: cover, title and type.
    id: 'home-catalog-phone',
    title: 'Imported catalog (phone)',
    alt: "Tim White's releases imported into Jovie: The Deep End and Take Me Over.",
    route: '/demo/showcase/homepage-moment?moment=catalog',
    viewport: 'desktop',
    theme: 'dark',
    waitFor: '[data-testid="homepage-moment-catalog"] [style*="take-me-over"]',
    crop: [
      '[data-testid="homepage-moment-catalog"] :text("The Deep End")',
      '[data-testid="homepage-moment-catalog"] :nth-match(:text-is("Single"), 2)',
    ],
    padding: { top: 18, right: 6, bottom: 18, left: 44 },
    frame: 'window',
    displayWidth: 358,
    sources: [
      `${DEMO}/DemoHomepageMomentSurface.tsx`,
      `${DEMO}/DemoReleasesExperience.tsx`,
      `${DEMO}/mock-release-data.ts`,
    ],
    placements: ['/'],
  },
] as const satisfies readonly ProductShotSpec[];

export type ProductShotId = (typeof PRODUCT_SHOTS)[number]['id'];

interface ProductShotManifestEntry {
  readonly width: number;
  readonly height: number;
  readonly sourceHash: string;
  readonly specHash: string;
  readonly renderedAt: string;
  readonly sources: readonly string[];
  readonly bytes: { readonly avif: number; readonly webp: number };
}

interface ProductShotManifest {
  readonly schema: 'jovie.product-shots/v1';
  readonly shots: Readonly<Record<string, ProductShotManifestEntry>>;
}

const MANIFEST = productShotManifest as ProductShotManifest;

export interface ProductShotImage {
  readonly id: ProductShotId;
  readonly alt: string;
  readonly frame: ProductShotFrame;
  readonly avif: string;
  readonly webp: string;
  /** CSS px at `displayWidth`; intrinsic pixels are `PRODUCT_SHOT_DPR`x. */
  readonly width: number;
  readonly height: number;
  readonly mobile: {
    readonly avif: string;
    readonly webp: string;
    readonly width: number;
    readonly height: number;
  } | null;
}

export function getProductShotSpec(id: string): ProductShotSpec | null {
  return PRODUCT_SHOTS.find(shot => shot.id === id) ?? null;
}

export function getProductShotManifestEntry(
  id: string
): ProductShotManifestEntry | null {
  return MANIFEST.shots[id] ?? null;
}

/** Resolves a rendered shot. Throws when it is unregistered or unrendered. */
export function getProductShot(id: ProductShotId): ProductShotImage {
  const spec = getProductShotSpec(id);
  if (!spec) throw new Error(`Unknown product shot: ${id}`);
  const entry = getProductShotManifestEntry(id);
  if (!entry) {
    throw new Error(
      `Product shot ${id} has not been rendered; run pnpm --filter @jovie/web shots:render --only ${id}`
    );
  }
  return {
    id,
    alt: spec.alt,
    frame: spec.frame,
    ...resolveRendered(id, entry),
    mobile: spec.mobile ? resolveMobile(id) : null,
  };
}

function resolveRendered(fileId: string, entry: ProductShotManifestEntry) {
  const version = entry.sourceHash.slice(0, 12);
  const base = `${PRODUCT_SHOT_PUBLIC_DIR}/${fileId}`;
  return {
    avif: `${base}.avif?v=${version}`,
    webp: `${base}.webp?v=${version}`,
    width: Math.round(entry.width / PRODUCT_SHOT_DPR),
    height: Math.round(entry.height / PRODUCT_SHOT_DPR),
  };
}

function resolveMobile(id: string) {
  const fileId = `${id}${PRODUCT_SHOT_MOBILE_SUFFIX}`;
  const entry = getProductShotManifestEntry(fileId);
  if (!entry) {
    throw new Error(
      `Product shot ${fileId} has not been rendered; run pnpm --filter @jovie/web shots:render --only ${id}`
    );
  }
  return resolveRendered(fileId, entry);
}
