/**
 * Public-surface quality checks (pure, hermetic).
 *
 * Every function takes plain data (rects, strings, meta maps, perf numbers)
 * collected by a driver (Playwright spec, Lighthouse gate script) and returns
 * a list of violations. No DOM / Playwright globals at import time, so the
 * same checks run in unit tests, at PR time against the seeded server, and as
 * the prod canary against https://jov.ie.
 *
 * Mapping from audit findings to checks: docs/golden-path/public-surface-quality.md
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type PublicSurfaceRule =
  | 'perf-lcp'
  | 'perf-js-bytes'
  | 'perf-requests'
  | 'perf-cls'
  | 'perf-ratchet'
  | 'tap-target'
  | 'axe'
  | 'placeholder'
  | 'duplicate-contact'
  | 'text-over-art'
  | 'dial-missing'
  | 'dsp-above-fold'
  | 'cookie-fold'
  | 'meta-missing'
  | 'og-image-type'
  | 'alt-text'
  | 'fixture-ratchet'
  | 'consent-card'
  | 'og-quality'
  | 'jsonld-missing'
  | 'hero-cropped'
  | 'sheet-promise'
  | 'stuck-loader'
  | 'empty-events-tab'
  | 'share-depth'
  | 'taps-to-dsp';

export interface Violation {
  readonly rule: PublicSurfaceRule;
  readonly message: string;
}

const v = (rule: PublicSurfaceRule, message: string): Violation => ({
  rule,
  message,
});

// ---------------------------------------------------------------------------
// 1. Performance budgets (throttled mobile) + lock_down ratchet
// ---------------------------------------------------------------------------

export interface PerfMetrics {
  readonly lcpMs?: number;
  readonly jsTransferBytes?: number;
  readonly requestCount?: number;
  readonly cls?: number;
}

export interface RatchetNumber {
  /** Enforced ceiling today. May only ever be lowered. */
  readonly lock_down: number;
  /** Where the ratchet is heading. lock_down must stay >= target. */
  readonly target: number;
}

export interface PerfBudgets {
  readonly lcpMs: RatchetNumber;
  readonly jsTransferBytes: RatchetNumber;
  readonly requestCount: RatchetNumber;
  readonly cls: RatchetNumber;
}

/**
 * Hard ceilings baked into code. The JSON baseline may be at or below these;
 * raising the JSON above them fails the unit test, so a budget can only be
 * lowered without an explicit edit of this file in review.
 */
export const PERF_CEILINGS = {
  lcpMs: 4000,
  jsTransferBytes: 600_000,
  requestCount: 60,
  cls: 0.05,
} as const;

/** Final LCP target the ratchet walks toward. */
export const LCP_TARGET_MS = 2500;

export function evaluatePerfBudget(
  measured: PerfMetrics,
  budgets: PerfBudgets,
  label = 'page'
): Violation[] {
  const out: Violation[] = [];
  if (
    measured.lcpMs !== undefined &&
    measured.lcpMs > budgets.lcpMs.lock_down
  ) {
    out.push(
      v(
        'perf-lcp',
        `${label}: LCP ${Math.round(measured.lcpMs)}ms exceeds budget ${budgets.lcpMs.lock_down}ms (target ${budgets.lcpMs.target}ms)`
      )
    );
  }
  if (
    measured.jsTransferBytes !== undefined &&
    measured.jsTransferBytes > budgets.jsTransferBytes.lock_down
  ) {
    out.push(
      v(
        'perf-js-bytes',
        `${label}: JS transfer ${measured.jsTransferBytes}B exceeds budget ${budgets.jsTransferBytes.lock_down}B`
      )
    );
  }
  if (
    measured.requestCount !== undefined &&
    measured.requestCount > budgets.requestCount.lock_down
  ) {
    out.push(
      v(
        'perf-requests',
        `${label}: ${measured.requestCount} requests exceeds budget ${budgets.requestCount.lock_down}`
      )
    );
  }
  if (measured.cls !== undefined && measured.cls > budgets.cls.lock_down) {
    out.push(
      v(
        'perf-cls',
        `${label}: CLS ${measured.cls} exceeds budget ${budgets.cls.lock_down}`
      )
    );
  }
  return out;
}

/** Structural sanity of a baseline: ceilings respected, target reachable. */
export function validatePerfBaseline(budgets: PerfBudgets): Violation[] {
  const out: Violation[] = [];
  for (const key of Object.keys(PERF_CEILINGS) as (keyof PerfBudgets)[]) {
    const entry = budgets[key];
    if (!entry || !Number.isFinite(entry.lock_down) || entry.lock_down <= 0) {
      out.push(v('perf-ratchet', `${key}: lock_down missing or invalid`));
      continue;
    }
    if (entry.lock_down > PERF_CEILINGS[key]) {
      out.push(
        v(
          'perf-ratchet',
          `${key}: lock_down ${entry.lock_down} is above the ceiling ${PERF_CEILINGS[key]} (budgets can only be lowered)`
        )
      );
    }
    if (entry.target > entry.lock_down) {
      out.push(
        v('perf-ratchet', `${key}: target ${entry.target} above lock_down`)
      );
    }
  }
  if (budgets.lcpMs?.target !== LCP_TARGET_MS) {
    out.push(v('perf-ratchet', `lcpMs.target must stay ${LCP_TARGET_MS}ms`));
  }
  return out;
}

/** Compare a proposed baseline with the previous one: no number may rise. */
export function validateRatchetTransition(
  previous: PerfBudgets,
  next: PerfBudgets
): Violation[] {
  const out: Violation[] = [];
  for (const key of Object.keys(PERF_CEILINGS) as (keyof PerfBudgets)[]) {
    if (next[key].lock_down > previous[key].lock_down) {
      out.push(
        v(
          'perf-ratchet',
          `${key}: lock_down raised ${previous[key].lock_down} -> ${next[key].lock_down}`
        )
      );
    }
  }
  return out;
}

interface LighthouseAudit {
  readonly numericValue?: number;
  readonly details?: {
    readonly items?: ReadonlyArray<Record<string, unknown>>;
  };
}
export interface LighthouseResultLike {
  readonly audits: Readonly<Record<string, LighthouseAudit | undefined>>;
}

/** Extract the budgeted metrics from a Lighthouse result (mobile, throttled). */
export function perfMetricsFromLighthouse(
  lhr: LighthouseResultLike
): PerfMetrics {
  const audits = lhr.audits;
  const summary = audits['resource-summary']?.details?.items ?? [];
  const script = summary.find(item => item.resourceType === 'script');
  const requests = audits['network-requests']?.details?.items;
  const scriptTransfer = requests
    ? requests
        .filter(item => item.resourceType === 'Script')
        .reduce((sum, item) => sum + Number(item.transferSize ?? 0), 0)
    : Number(script?.transferSize ?? 0);
  return {
    lcpMs: audits['largest-contentful-paint']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
    jsTransferBytes: scriptTransfer,
    requestCount: requests ? requests.length : undefined,
  };
}

// ---------------------------------------------------------------------------
// 2. Tap targets
// ---------------------------------------------------------------------------

export const MIN_TAP_TARGET_PX = 44;

export interface InteractiveElement {
  readonly description: string;
  readonly rect: Rect;
  readonly visible: boolean;
}

export function findTapTargetViolations(
  elements: readonly InteractiveElement[],
  minPx: number = MIN_TAP_TARGET_PX
): Violation[] {
  return elements
    .filter(
      el =>
        el.visible &&
        el.rect.width > 0 &&
        el.rect.height > 0 &&
        (el.rect.width + 0.5 < minPx || el.rect.height + 0.5 < minPx)
    )
    .map(el =>
      v(
        'tap-target',
        `${el.description} is ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}px (min ${minPx}x${minPx})`
      )
    );
}

// ---------------------------------------------------------------------------
// 3. axe
// ---------------------------------------------------------------------------

export interface AxeViolationLike {
  readonly id: string;
  readonly impact?: string | null;
  readonly nodes?: ReadonlyArray<unknown>;
}

export function findBlockingAxeViolations(
  violations: readonly AxeViolationLike[]
): Violation[] {
  return violations
    .filter(item => item.impact === 'serious' || item.impact === 'critical')
    .map(item =>
      v(
        'axe',
        `axe ${item.impact} ${item.id} (${item.nodes?.length ?? 0} nodes)`
      )
    );
}

// ---------------------------------------------------------------------------
// 4. Placeholder content + duplicate contact roles
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['TBF', /\bTBF\b/],
  ['TBD', /\bTBD\b/],
  ['lorem ipsum', /\blorem\b|\bipsum\b/i],
];

export type TextScope = 'general' | 'contact';

/**
 * `contact` scope additionally forbids the company name appearing as if it
 * were the artist's contact (the marketing footer legitimately carries it).
 */
export function findPlaceholderText(
  text: string,
  scope: TextScope = 'general',
  label = 'page'
): Violation[] {
  const out: Violation[] = [];
  for (const [name, pattern] of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      out.push(v('placeholder', `${label}: placeholder "${name}" rendered`));
    }
  }
  if (scope === 'contact' && /Jovie Technology Inc/i.test(text)) {
    out.push(
      v(
        'placeholder',
        `${label}: "Jovie Technology Inc" shown as an artist contact`
      )
    );
  }
  return out;
}

export const CONTACT_ROLE_LABELS: readonly string[] = [
  'Bookings / Touring',
  'Management',
  'Press / PR',
  'Brand partnerships',
  'Fan contact / General',
  'Other',
];

export function findDuplicateContactRoles(
  roles: readonly string[],
  label = 'contacts'
): Violation[] {
  const seen = new Map<string, number>();
  for (const role of roles) {
    const key = role.trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([role, count]) =>
      v('duplicate-contact', `${label}: contact role "${role}" shown ${count}x`)
    );
}

/** Count lines that are exactly a known contact-role label. */
export function extractContactRoleLines(text: string): string[] {
  const known = new Set(CONTACT_ROLE_LABELS.map(r => r.toLowerCase()));
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => known.has(line.toLowerCase()));
}

// ---------------------------------------------------------------------------
// 5. Text over cover art
// ---------------------------------------------------------------------------

export interface TextBox {
  readonly text: string;
  readonly rect: Rect;
}

export function rectsOverlap(a: Rect, b: Rect, tolerancePx = 1): boolean {
  return (
    a.x + a.width - tolerancePx > b.x &&
    b.x + b.width - tolerancePx > a.x &&
    a.y + a.height - tolerancePx > b.y &&
    b.y + b.height - tolerancePx > a.y
  );
}

export function findTextOverCoverArt(
  textBoxes: readonly TextBox[],
  coverArtRects: readonly Rect[],
  label = 'page'
): Violation[] {
  const out: Violation[] = [];
  for (const box of textBoxes) {
    if (box.rect.width <= 0 || box.rect.height <= 0) continue;
    if (coverArtRects.some(art => rectsOverlap(box.rect, art))) {
      out.push(
        v(
          'text-over-art',
          `${label}: text "${box.text.slice(0, 40)}" overlaps cover art`
        )
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6. Service dial
// ---------------------------------------------------------------------------

export const DIAL_MIN_SERVICES = 2;

export function checkServiceDial(input: {
  readonly serviceCount: number;
  readonly dialPresent: boolean;
  readonly label?: string;
}): Violation[] {
  if (input.serviceCount >= DIAL_MIN_SERVICES && !input.dialPresent) {
    return [
      v(
        'dial-missing',
        `${input.label ?? 'release'}: ${input.serviceCount} services but the service dial did not render`
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// 7. OG / Twitter / canonical + alt text
// ---------------------------------------------------------------------------

export const REQUIRED_META_KEYS = [
  'og:image',
  'og:title',
  'og:description',
  'twitter:card',
] as const;

/** `meta` maps property/name -> content; `canonical` is the link rel href. */
export function checkSocialMeta(
  meta: Readonly<Record<string, string | undefined>>,
  canonical: string | undefined,
  label = 'page'
): Violation[] {
  const out: Violation[] = [];
  for (const key of REQUIRED_META_KEYS) {
    if (!meta[key]?.trim()) {
      out.push(v('meta-missing', `${label}: <meta ${key}> missing or empty`));
    }
  }
  if (!canonical?.trim()) {
    out.push(v('meta-missing', `${label}: canonical link missing`));
  }
  return out;
}

export function checkOgImageContentType(
  contentType: string | undefined | null,
  status: number,
  label = 'page'
): Violation[] {
  if (status < 200 || status >= 300) {
    return [v('og-image-type', `${label}: og:image returned HTTP ${status}`)];
  }
  if (!/^image\//i.test(contentType ?? '')) {
    return [
      v(
        'og-image-type',
        `${label}: og:image content-type "${contentType ?? ''}" is not an image`
      ),
    ];
  }
  return [];
}

const GENERIC_ALT =
  /^(image|img|cover|artwork|photo|picture|thumbnail|untitled)$/i;
const FILE_EXT = /\.(jpe?g|png|webp|avif|gif|svg|heic)(\?.*)?$/i;

export function isRealAltText(alt: string | null | undefined): boolean {
  const text = (alt ?? '').trim();
  if (!text) return false;
  if (GENERIC_ALT.test(text)) return false;
  if (FILE_EXT.test(text)) return false;
  // Machine-looking token: no spaces, only id characters (IMG_1234, a1b2c3).
  if (!/\s/.test(text) && /^[\w.-]+$/.test(text) && /[\d_]/.test(text)) {
    return false;
  }
  return true;
}

export function findBadAltText(
  images: ReadonlyArray<{ alt: string | null; src: string }>,
  label = 'page'
): Violation[] {
  return images
    .filter(img => !isRealAltText(img.alt))
    .map(img =>
      v(
        'alt-text',
        `${label}: artwork image alt "${img.alt ?? ''}" is not descriptive (${img.src.slice(0, 60)})`
      )
    );
}

// ---------------------------------------------------------------------------
// Finding (1): direct DSP link above the fold; finding (2): cookie card
// ---------------------------------------------------------------------------

export const DSP_HOSTS: readonly string[] = [
  'open.spotify.com',
  'music.apple.com',
  'itunes.apple.com',
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'tidal.com',
  'listen.tidal.com',
  'www.deezer.com',
  'deezer.com',
  'music.amazon.com',
  'soundcloud.com',
  'bandcamp.com',
];

export interface AnchorInfo {
  readonly href: string;
  readonly rect: Rect;
  readonly visible: boolean;
}

export function findDirectDspLinkAboveFold(
  anchors: readonly AnchorInfo[],
  viewportHeight: number,
  label = 'release'
): Violation[] {
  const found = anchors.some(a => {
    if (!a.visible) return false;
    let host = '';
    try {
      host = new URL(a.href).hostname;
    } catch {
      return false;
    }
    const isDsp = DSP_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
    return isDsp && a.rect.y >= 0 && a.rect.y + a.rect.height <= viewportHeight;
  });
  return found
    ? []
    : [
        v(
          'dsp-above-fold',
          `${label}: no direct DSP link visible above the fold (${viewportHeight}px); needs extra taps`
        ),
      ];
}

/** Cookie card may not take more than `maxFraction` of the first fold. */
export function checkCookieCardFold(
  banner: Rect | null,
  viewportHeight: number,
  maxFraction = 0.2,
  label = 'page'
): Violation[] {
  if (!banner || banner.width <= 0 || banner.height <= 0) return [];
  const visibleTop = Math.max(0, banner.y);
  const visibleBottom = Math.min(viewportHeight, banner.y + banner.height);
  const covered = Math.max(0, visibleBottom - visibleTop);
  if (covered / viewportHeight > maxFraction) {
    return [
      v(
        'cookie-fold',
        `${label}: cookie card covers ${Math.round((covered / viewportHeight) * 100)}% of the first fold (max ${Math.round(maxFraction * 100)}%)`
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Templates matrix + pending-fixture ratchet
// ---------------------------------------------------------------------------

export type PublicSurfaceTemplateId =
  | 'profile-empty'
  | 'profile-single-release'
  | 'profile-many-release'
  | 'profile-no-events'
  | 'release-1-service'
  | 'release-2plus-services'
  | 'release-no-services';

export interface PublicSurfaceTemplate {
  readonly id: PublicSurfaceTemplateId;
  readonly kind: 'profile' | 'release';
  /** Seeded handle (local / PR lane). */
  readonly handle: string;
  /** Release slug for release templates. */
  readonly releaseSlug?: string;
  /** Services the seeded fixture is known to carry (release templates). */
  readonly expectedServices?: number;
  /** Seeded in apps/web/tests/seed-test-data.ts; false = pendingFixtures. */
  readonly fixture: 'seeded' | 'pending';
  readonly fixtureNote: string;
  /** Profile templates: does the fixture carry events / merch? */
  readonly hasEvents?: boolean;
  readonly hasMerch?: boolean;
}

export const PUBLIC_SURFACE_TEMPLATES: readonly PublicSurfaceTemplate[] = [
  {
    id: 'profile-empty',
    hasEvents: false,
    hasMerch: false,
    kind: 'profile',
    handle: 'edgecase-empty',
    fixture: 'seeded',
    fixtureNote: 'No socials, releases, events, contacts, bio.',
  },
  {
    id: 'profile-single-release',
    hasEvents: true,
    hasMerch: true,
    kind: 'profile',
    handle: 'edgecase-long',
    fixture: 'seeded',
    fixtureNote: 'Exactly one (extreme-length) release; also has tour dates.',
  },
  {
    id: 'profile-many-release',
    hasEvents: true,
    hasMerch: true,
    kind: 'profile',
    handle: 'dualipa',
    fixture: 'seeded',
    fixtureNote: 'Seven releases of every type, tour dates, contacts, merch.',
  },
  {
    id: 'profile-no-events',
    hasEvents: false,
    hasMerch: false,
    kind: 'profile',
    handle: 'testartist',
    fixture: 'seeded',
    fixtureNote: 'No tour dates (and no releases) seeded.',
  },
  {
    id: 'release-1-service',
    kind: 'release',
    handle: 'dualipa',
    releaseSlug: 'midnight-drive',
    expectedServices: 1,
    fixture: 'seeded',
    fixtureNote: 'Spotify provider link only.',
  },
  {
    id: 'release-2plus-services',
    kind: 'release',
    handle: 'dualipa',
    releaseSlug: 'neon-skyline',
    expectedServices: 2,
    fixture: 'seeded',
    fixtureNote: 'Spotify + Apple Music (+ short-form sound providers).',
  },
  {
    id: 'release-no-services',
    kind: 'release',
    handle: 'dualipa',
    releaseSlug: 'pending-no-services',
    expectedServices: 0,
    fixture: 'pending',
    fixtureNote: 'No seeded release without provider links yet.',
  },
];

/** Shrink-only: the pending list may never grow beyond the baseline. */
export function checkPendingFixtureRatchet(
  baselinePending: readonly string[],
  currentPending: readonly string[]
): Violation[] {
  const allowed = new Set(baselinePending);
  return currentPending
    .filter(id => !allowed.has(id))
    .map(id =>
      v(
        'fixture-ratchet',
        `template "${id}" added to pendingFixtures (shrink-only)`
      )
    );
}

export function pendingTemplateIds(
  templates: readonly PublicSurfaceTemplate[] = PUBLIC_SURFACE_TEMPLATES
): string[] {
  return templates.filter(t => t.fixture === 'pending').map(t => t.id);
}

export function formatViolations(violations: readonly Violation[]): string {
  return violations.map(x => `[${x.rule}] ${x.message}`).join('\n');
}

// ---------------------------------------------------------------------------
// Findings 1, 2, 4, 6, 7, 9, 10, 11 (objective sub-assertions)
// ---------------------------------------------------------------------------

/** Finding 1: primary DSP must be reachable in at most `maxTaps` taps. */
export function checkTapsToDsp(
  taps: number | null,
  maxTaps = 1,
  label = 'home'
): Violation[] {
  if (taps === null || taps > maxTaps) {
    return [
      v(
        'taps-to-dsp',
        `${label}: DSP reachable in ${taps ?? 'no'} taps (max ${maxTaps})`
      ),
    ];
  }
  return [];
}

/**
 * Finding 2: consent card buttons must be >=44px and the card must not
 * overlap other fixed UI (Claim bar, dock).
 */
export function checkConsentCard(
  card: { rect: Rect; buttons: readonly Rect[] } | null,
  otherFixedRects: readonly Rect[],
  label = 'page'
): Violation[] {
  if (!card) return [];
  const out: Violation[] = [];
  card.buttons.forEach((b, i) => {
    if (
      b.width + 0.5 < MIN_TAP_TARGET_PX ||
      b.height + 0.5 < MIN_TAP_TARGET_PX
    ) {
      out.push(
        v(
          'consent-card',
          `${label}: consent button ${i + 1} is ${Math.round(b.width)}x${Math.round(b.height)}px (min 44x44)`
        )
      );
    }
  });
  if (otherFixedRects.some(r => rectsOverlap(card.rect, r))) {
    out.push(
      v('consent-card', `${label}: consent card overlaps the Claim bar or dock`)
    );
  }
  return out;
}

/** Finding 4: cover art must not be cropped by object-fit: cover. */
export function checkHeroNotCropped(
  rendered: Rect,
  natural: { width: number; height: number },
  objectFit: string,
  tolerance = 0.03,
  label = 'release'
): Violation[] {
  if (natural.width <= 0 || natural.height <= 0 || rendered.height <= 0) {
    return [];
  }
  const diff = Math.abs(
    rendered.width / rendered.height - natural.width / natural.height
  );
  if (objectFit === 'cover' && diff > tolerance) {
    return [
      v(
        'hero-cropped',
        `${label}: cover art is cropped (rendered ratio differs from natural by ${diff.toFixed(2)})`
      ),
    ];
  }
  return [];
}

const GENERIC_OG_ALT =
  /^(public profile preview|preview|image|cover|artwork|open graph image)$/i;
const GENERIC_DESCRIPTION = /^music by\b/i;

/** Finding 6: OG alt/description not generic; release pages carry JSON-LD. */
export function checkOgQuality(input: {
  readonly ogImageAlt: string | undefined;
  readonly description: string | undefined;
  readonly jsonLdTypes: readonly string[];
  readonly kind: 'profile' | 'release';
  readonly label?: string;
}): Violation[] {
  const label = input.label ?? 'page';
  const out: Violation[] = [];
  const alt = input.ogImageAlt?.trim() ?? '';
  if (!alt || GENERIC_OG_ALT.test(alt)) {
    out.push(
      v('og-quality', `${label}: og:image:alt "${alt}" is missing or generic`)
    );
  }
  const description = input.description?.trim() ?? '';
  if (!description || GENERIC_DESCRIPTION.test(description)) {
    out.push(
      v(
        'og-quality',
        `${label}: description "${description.slice(0, 40)}" is generic`
      )
    );
  }
  if (
    input.kind === 'release' &&
    !input.jsonLdTypes.some(t => t === 'MusicRecording' || t === 'MusicAlbum')
  ) {
    out.push(
      v('jsonld-missing', `${label}: no MusicRecording/MusicAlbum JSON-LD`)
    );
  }
  return out;
}

/** Finding 7: updates sheet may not promise shows/merch that do not exist. */
export function checkSheetPromises(
  sheetText: string,
  has: { readonly events: boolean; readonly merch: boolean },
  label = 'page'
): Violation[] {
  const out: Violation[] = [];
  if (!has.merch && /\bmerch\b/i.test(sheetText)) {
    out.push(
      v('sheet-promise', `${label}: sheet promises merch but none exists`)
    );
  }
  if (!has.events && /\b(shows?|tour|events?)\b/i.test(sheetText)) {
    out.push(
      v('sheet-promise', `${label}: sheet promises shows but no events exist`)
    );
  }
  return out;
}

/** Finding 9: no loader still on screen after the settle window. */
export function checkNoStuckLoader(
  visibleLoaders: readonly string[],
  label = 'page'
): Violation[] {
  return visibleLoaders.map(l =>
    v('stuck-loader', `${label}: loader ${l} still visible after settle window`)
  );
}

/** Finding 10: an Events tab must not render when there are no events. */
export function checkEmptyEventsTab(
  tabLabels: readonly string[],
  hasEvents: boolean,
  label = 'profile'
): Violation[] {
  if (hasEvents) return [];
  return tabLabels
    .filter(t => /^(events|shows|tour)$/i.test(t.trim()))
    .map(t =>
      v('empty-events-tab', `${label}: "${t}" tab rendered with no events`)
    );
}

/** Finding 11: a share control must be at most `maxTaps` taps from home. */
export function checkShareDepth(
  taps: number | null,
  maxTaps = 1,
  label = 'home'
): Violation[] {
  if (taps === null || taps > maxTaps) {
    return [
      v(
        'share-depth',
        `${label}: share is ${taps ?? 'not'} reachable in <= ${maxTaps} taps`
      ),
    ];
  }
  return [];
}
