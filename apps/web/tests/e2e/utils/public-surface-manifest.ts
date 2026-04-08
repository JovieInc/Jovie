import { APP_ROUTES } from '@/constants/routes';

export type PublicSurfaceFamily =
  | 'marketing'
  | 'legal'
  | 'auth-entry'
  | 'profile-core'
  | 'profile-mode'
  | 'release'
  | 'track'
  | 'countdown'
  | 'playlist-or-sounds'
  | 'download'
  | 'redirect'
  | 'not-found';

export type PublicSurfaceState = 'ok' | 'redirect' | 'not-found';

export type PublicInteractionId =
  | 'cookie-banner'
  | 'header-navigation'
  | 'safe-trigger-sweep'
  | 'profile-mode-drawer'
  | 'notification-form'
  | 'audio-preview'
  | 'credits'
  | 'artwork-menu'
  | 'dsp-actions';

export interface PublicInteractionSpec {
  readonly id: PublicInteractionId;
  readonly optional?: boolean;
  readonly selectors?: readonly string[];
  readonly viewport?: 'all' | 'desktop' | 'mobile';
  readonly maxClicks?: number;
}

export interface PublicSurfaceSpec {
  readonly id: string;
  readonly family: PublicSurfaceFamily;
  readonly expectedState: PublicSurfaceState;
  readonly path: string;
  readonly resolvePath?: () => Promise<string>;
  readonly readySelectors: readonly string[];
  readonly readyText?: RegExp;
  readonly mainSelector?: string;
  readonly minMainTextLength?: number;
  readonly expectedRedirects?: readonly RegExp[];
  readonly allowedFinalDocumentStatuses?: readonly number[];
  readonly allowMissingMain?: boolean;
  readonly lighthouse: boolean;
  readonly perfGroups: readonly string[];
  readonly interactions: readonly PublicInteractionSpec[];
}

export interface ResolvedPublicSurfaceSpec extends PublicSurfaceSpec {
  readonly resolvedPath: string;
}

const DEFAULTS = {
  founderHandle: process.env.PUBLIC_SURFACE_FOUNDER_HANDLE?.trim() || 'tim',
  musicHandle: process.env.PUBLIC_SURFACE_MUSIC_HANDLE?.trim() || 'dualipa',
  tipHandle: process.env.PUBLIC_SURFACE_TIP_HANDLE?.trim() || 'testartist',
  downloadHandle:
    process.env.PUBLIC_SURFACE_DOWNLOAD_HANDLE?.trim() || 'e2e-test-user',
  releaseSlug:
    process.env.PUBLIC_SURFACE_RELEASE_SLUG?.trim() || 'neon-skyline',
  trackSlug: process.env.PUBLIC_SURFACE_TRACK_SLUG?.trim() || 'neon-skyline',
  countdownReleaseSlug:
    process.env.PUBLIC_SURFACE_COUNTDOWN_SLUG?.trim() || 'future-glow',
  missingProfile:
    process.env.PUBLIC_SURFACE_MISSING_PROFILE?.trim() || 'missing-qa-user',
  missingReleaseSlug:
    process.env.PUBLIC_SURFACE_MISSING_RELEASE_SLUG?.trim() ||
    'missing-release-qa',
} as const;

const GLOBAL_INTERACTIONS = [
  { id: 'cookie-banner', optional: true },
  { id: 'header-navigation', optional: true },
  {
    id: 'safe-trigger-sweep',
    optional: true,
    maxClicks: 8,
    selectors: [
      'button:not([type="submit"]):not([disabled])',
      'summary',
      '[aria-haspopup="dialog"]',
      '[aria-haspopup="menu"]',
      '[aria-haspopup="listbox"]',
      '[role="tab"]',
      '[data-state]',
    ],
  },
] as const satisfies readonly PublicInteractionSpec[];

const PROFILE_INTERACTIONS = [
  ...GLOBAL_INTERACTIONS,
  { id: 'profile-mode-drawer', optional: true, viewport: 'mobile' },
] as const satisfies readonly PublicInteractionSpec[];

const RELEASE_INTERACTIONS = [
  ...GLOBAL_INTERACTIONS,
  { id: 'audio-preview', optional: true },
  { id: 'credits', optional: true },
  { id: 'artwork-menu', optional: true },
  { id: 'dsp-actions', optional: true },
] as const satisfies readonly PublicInteractionSpec[];

const COUNTDOWN_INTERACTIONS = [
  ...RELEASE_INTERACTIONS,
  { id: 'notification-form', optional: true },
] as const satisfies readonly PublicInteractionSpec[];

const AUTH_INTERACTIONS = [
  { id: 'cookie-banner', optional: true },
  { id: 'header-navigation', optional: true },
] as const satisfies readonly PublicInteractionSpec[];

function replacePathToken(
  template: string,
  token: string,
  value: string
): string {
  return template.replaceAll(`[${token}]`, value);
}

function resolveProfileHandle(
  profile: 'founder' | 'music' | 'tip' = 'music'
): string {
  switch (profile) {
    case 'founder':
      return DEFAULTS.founderHandle;
    case 'tip':
      return DEFAULTS.tipHandle;
    case 'music':
    default:
      return DEFAULTS.musicHandle;
  }
}

function resolveReleasePath(
  pathTemplate: string,
  profile: 'founder' | 'music' | 'tip' = 'music'
): string {
  return replacePathToken(
    replacePathToken(
      replacePathToken(pathTemplate, 'username', resolveProfileHandle(profile)),
      'slug',
      DEFAULTS.releaseSlug
    ),
    'trackSlug',
    DEFAULTS.trackSlug
  );
}

async function resolveBlogPostPath(): Promise<string> {
  return '/blog/the-contact-problem';
}

async function resolveBlogAuthorPath(): Promise<string> {
  return '/blog/authors/tim';
}

async function resolveBlogCategoryPath(): Promise<string> {
  return '/blog/category/artist-management';
}

async function resolveAlternativesPath(): Promise<string> {
  return '/alternatives/linktree';
}

async function resolveComparePath(): Promise<string> {
  return '/compare/linktree';
}

const MARKETING_SURFACES = [
  {
    id: 'home',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.HOME,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 200,
    lighthouse: true,
    perfGroups: ['home'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-about',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.ABOUT,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-ai',
    family: 'marketing',
    expectedState: 'redirect',
    path: '/ai',
    readySelectors: ['html'],
    mainSelector: 'main',
    minMainTextLength: 0,
    expectedRedirects: [/\/investor-portal(?:\/)?(?:\?.*)?$/],
    allowedFinalDocumentStatuses: [404],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-artist-profiles',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.ARTIST_PROFILES,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 150,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-pricing',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.PRICING,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: true,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-launch',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.LAUNCH,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-launch-pricing',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.LAUNCH_PRICING,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-new',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.LANDING_NEW,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-support',
    family: 'marketing',
    expectedState: 'ok',
    path: APP_ROUTES.SUPPORT,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: true,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-tips',
    family: 'marketing',
    expectedState: 'ok',
    path: '/tips',
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-investors',
    family: 'marketing',
    expectedState: 'redirect',
    path: '/investors',
    readySelectors: ['html'],
    mainSelector: 'main',
    minMainTextLength: 0,
    expectedRedirects: [/\/investor-portal(?:\/)?(?:\?.*)?$/],
    allowedFinalDocumentStatuses: [404],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-engagement-engine',
    family: 'marketing',
    expectedState: 'ok',
    path: '/engagement-engine',
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-demo-video',
    family: 'marketing',
    expectedState: 'ok',
    path: '/demo/video',
    readySelectors: ['main', 'video, iframe'],
    mainSelector: 'main',
    minMainTextLength: 40,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-blog-index',
    family: 'marketing',
    expectedState: 'ok',
    path: '/blog',
    readySelectors: ['h1', 'main'],
    readyText: /thoughts on product|posts coming soon/i,
    mainSelector: 'main',
    minMainTextLength: 120,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-blog-post',
    family: 'marketing',
    expectedState: 'ok',
    path: '/blog/[slug]',
    resolvePath: resolveBlogPostPath,
    readySelectors: ['article', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 180,
    lighthouse: true,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-blog-author',
    family: 'marketing',
    expectedState: 'ok',
    path: '/blog/authors/[username]',
    resolvePath: resolveBlogAuthorPath,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 100,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-blog-category',
    family: 'marketing',
    expectedState: 'ok',
    path: '/blog/category/[slug]',
    resolvePath: resolveBlogCategoryPath,
    readySelectors: ['a[href^="/blog/"]:not([href="/blog"])'],
    mainSelector: 'main',
    minMainTextLength: 100,
    lighthouse: false,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-alternatives',
    family: 'marketing',
    expectedState: 'ok',
    path: '/alternatives/[slug]',
    resolvePath: resolveAlternativesPath,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 140,
    lighthouse: true,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'marketing-compare',
    family: 'marketing',
    expectedState: 'ok',
    path: '/compare/[slug]',
    resolvePath: resolveComparePath,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 140,
    lighthouse: true,
    perfGroups: ['marketing-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const LEGAL_SURFACES = [
  {
    id: 'legal-privacy',
    family: 'legal',
    expectedState: 'ok',
    path: APP_ROUTES.LEGAL_PRIVACY,
    readySelectors: ['h1', 'main'],
    mainSelector: 'body',
    minMainTextLength: 250,
    lighthouse: true,
    perfGroups: ['legal-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'legal-terms',
    family: 'legal',
    expectedState: 'ok',
    path: APP_ROUTES.LEGAL_TERMS,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 250,
    lighthouse: true,
    perfGroups: ['legal-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'legal-cookies',
    family: 'legal',
    expectedState: 'ok',
    path: APP_ROUTES.LEGAL_COOKIES,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 200,
    lighthouse: false,
    perfGroups: ['legal-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'legal-dmca',
    family: 'legal',
    expectedState: 'ok',
    path: APP_ROUTES.LEGAL_DMCA,
    readySelectors: ['h1', 'main'],
    mainSelector: 'main',
    minMainTextLength: 180,
    lighthouse: false,
    perfGroups: ['legal-public'],
    interactions: GLOBAL_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const AUTH_SURFACES = [
  {
    id: 'auth-signin',
    family: 'auth-entry',
    expectedState: 'ok',
    path: APP_ROUTES.SIGNIN,
    readySelectors: [
      'main',
      'h1',
      '[data-testid="auth-clerk-unavailable"]',
      'form',
      'input[name="identifier"]',
      'input[type="email"]',
      '[data-clerk-component]',
    ],
    mainSelector: 'body',
    minMainTextLength: 40,
    allowMissingMain: true,
    lighthouse: true,
    perfGroups: ['auth'],
    interactions: AUTH_INTERACTIONS,
  },
  {
    id: 'auth-signup',
    family: 'auth-entry',
    expectedState: 'ok',
    path: APP_ROUTES.SIGNUP,
    readySelectors: [
      'main',
      'h1',
      '[data-testid="auth-clerk-unavailable"]',
      'form',
      'input[name="identifier"]',
      'input[type="email"]',
      '[data-clerk-component]',
    ],
    mainSelector: 'body',
    minMainTextLength: 40,
    allowMissingMain: true,
    lighthouse: true,
    perfGroups: ['auth'],
    interactions: AUTH_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const PROFILE_SURFACES = [
  {
    id: 'profile-main',
    family: 'profile-core',
    expectedState: 'ok',
    path: '/[username]',
    resolvePath: async () => `/${resolveProfileHandle('music')}`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 40,
    lighthouse: true,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-about',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/about',
    resolvePath: async () => `/${resolveProfileHandle('music')}/about`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=about)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-contact',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/contact',
    resolvePath: async () => `/${resolveProfileHandle('music')}/contact`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=contact)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-listen',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/listen',
    resolvePath: async () => `/${resolveProfileHandle('music')}/listen`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=listen)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-notifications',
    family: 'profile-core',
    expectedState: 'ok',
    path: '/[username]/notifications',
    resolvePath: async () => `/${resolveProfileHandle('tip')}/notifications`,
    readySelectors: ['[data-testid="notifications-page"]', 'form', 'h1'],
    mainSelector: 'body',
    minMainTextLength: 60,
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: [
      ...PROFILE_INTERACTIONS,
      { id: 'notification-form', optional: true },
    ],
  },
  {
    id: 'profile-shop',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/shop',
    resolvePath: async () => `/${resolveProfileHandle('music')}/shop`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-subscribe',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/subscribe',
    resolvePath: async () => `/${resolveProfileHandle('music')}/subscribe`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=subscribe)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-tip',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/tip',
    resolvePath: async () => `/${resolveProfileHandle('tip')}/tip`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=tip)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-tour',
    family: 'profile-core',
    expectedState: 'redirect',
    path: '/[username]/tour',
    resolvePath: async () => `/${resolveProfileHandle('music')}/tour`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+(\?mode=tour)?$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-claim',
    family: 'profile-core',
    expectedState: 'ok',
    path: '/[username]/claim',
    resolvePath: async () => `/${resolveProfileHandle('music')}/claim`,
    readySelectors: ['body', 'form, button, h1'],
    mainSelector: 'body',
    minMainTextLength: 60,
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-core'],
    interactions: PROFILE_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const PROFILE_MODE_SURFACES = [
  {
    id: 'profile-mode-about',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=about',
    resolvePath: async () => `/${resolveProfileHandle('music')}?mode=about`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-about"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: false,
    perfGroups: ['public-profile-mode-shell'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-mode-contact',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=contact',
    resolvePath: async () => `/${resolveProfileHandle('music')}?mode=contact`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-contact"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: false,
    perfGroups: ['public-profile-mode-shell'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-mode-listen',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=listen',
    resolvePath: async () => `/${resolveProfileHandle('music')}?mode=listen`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-listen"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: true,
    perfGroups: ['public-profile-mode-shell'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-mode-subscribe',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=subscribe',
    resolvePath: async () => `/${resolveProfileHandle('music')}?mode=subscribe`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-subscribe"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: true,
    perfGroups: ['public-profile-mode-shell'],
    interactions: [
      ...PROFILE_INTERACTIONS,
      { id: 'notification-form', optional: true },
    ],
  },
  {
    id: 'profile-mode-tip',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=tip',
    resolvePath: async () => `/${resolveProfileHandle('tip')}?mode=tip`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-tip"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: true,
    perfGroups: ['public-profile-mode-shell'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-mode-tour',
    family: 'profile-mode',
    expectedState: 'ok',
    path: '/[username]?mode=tour',
    resolvePath: async () => `/${resolveProfileHandle('music')}?mode=tour`,
    readySelectors: [
      '[data-testid="profile-mode-drawer-tour"]',
      '[data-testid="profile-header"]',
    ],
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: false,
    perfGroups: ['public-profile-mode-shell'],
    interactions: PROFILE_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const SMART_LINK_SURFACES = [
  {
    id: 'public-release',
    family: 'release',
    expectedState: 'ok',
    path: '/[username]/[slug]',
    resolvePath: async () => resolveReleasePath('/[username]/[slug]'),
    readySelectors: ['h1'],
    mainSelector: 'main',
    minMainTextLength: 80,
    lighthouse: true,
    perfGroups: ['public-profile-detail'],
    interactions: RELEASE_INTERACTIONS,
  },
  {
    id: 'public-track',
    family: 'track',
    expectedState: 'ok',
    path: '/[username]/[slug]/[trackSlug]',
    resolvePath: async () =>
      resolveReleasePath('/[username]/[slug]/[trackSlug]'),
    readySelectors: ['h1'],
    mainSelector: 'main',
    minMainTextLength: 80,
    lighthouse: true,
    perfGroups: ['public-profile-detail'],
    interactions: RELEASE_INTERACTIONS,
  },
  {
    id: 'public-countdown',
    family: 'countdown',
    expectedState: 'ok',
    path: '/[username]/[slug]',
    resolvePath: async () =>
      replacePathToken(
        replacePathToken(
          '/[username]/[slug]',
          'username',
          resolveProfileHandle('music')
        ),
        'slug',
        DEFAULTS.countdownReleaseSlug
      ),
    readySelectors: ['h1'],
    readyText: /coming soon|turn on notifications|notify/i,
    mainSelector: 'main',
    minMainTextLength: 45,
    lighthouse: false,
    perfGroups: ['public-profile-detail'],
    interactions: COUNTDOWN_INTERACTIONS,
  },
  {
    id: 'public-sounds',
    family: 'playlist-or-sounds',
    expectedState: 'ok',
    path: '/[username]/[slug]/sounds',
    resolvePath: async () => resolveReleasePath('/[username]/[slug]/sounds'),
    readySelectors: ['h1'],
    mainSelector: 'main',
    minMainTextLength: 40,
    lighthouse: true,
    perfGroups: ['public-profile-detail'],
    interactions: RELEASE_INTERACTIONS,
  },
  {
    id: 'public-download',
    family: 'download',
    expectedState: 'ok',
    path: '/[username]/[slug]/download',
    resolvePath: async () =>
      replacePathToken(
        replacePathToken(
          '/[username]/[slug]/download',
          'username',
          DEFAULTS.downloadHandle
        ),
        'slug',
        DEFAULTS.releaseSlug
      ),
    readySelectors: ['h1'],
    mainSelector: 'main',
    minMainTextLength: 40,
    lighthouse: false,
    perfGroups: ['public-profile-detail'],
    interactions: RELEASE_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

const EDGE_CASE_SURFACES = [
  {
    id: 'profile-catchall',
    family: 'redirect',
    expectedState: 'redirect',
    path: '/[username]/performance-extra-path',
    resolvePath: async () =>
      `/${resolveProfileHandle('music')}/performance-extra-path`,
    readySelectors: ['[data-testid="profile-header"]', 'h1'],
    mainSelector: 'main',
    minMainTextLength: 60,
    expectedRedirects: [/\/[^/]+$/],
    allowMissingMain: true,
    lighthouse: false,
    perfGroups: ['public-profile-detail'],
    interactions: PROFILE_INTERACTIONS,
  },
  {
    id: 'profile-not-found',
    family: 'not-found',
    expectedState: 'not-found',
    path: '/missing-qa-user',
    resolvePath: async () => `/${DEFAULTS.missingProfile}`,
    readySelectors: ['h1'],
    mainSelector: 'body',
    minMainTextLength: 20,
    lighthouse: false,
    perfGroups: [],
    interactions: GLOBAL_INTERACTIONS,
  },
  {
    id: 'smart-link-not-found',
    family: 'not-found',
    expectedState: 'not-found',
    path: '/[username]/missing-release-qa',
    resolvePath: async () =>
      `/${resolveProfileHandle('music')}/${DEFAULTS.missingReleaseSlug}`,
    readySelectors: ['h1'],
    mainSelector: 'body',
    minMainTextLength: 20,
    lighthouse: false,
    perfGroups: [],
    interactions: GLOBAL_INTERACTIONS,
  },
] as const satisfies readonly PublicSurfaceSpec[];

export const PUBLIC_SURFACE_MANIFEST = [
  ...MARKETING_SURFACES,
  ...LEGAL_SURFACES,
  ...AUTH_SURFACES,
  ...PROFILE_SURFACES,
  ...PROFILE_MODE_SURFACES,
  ...SMART_LINK_SURFACES,
  ...EDGE_CASE_SURFACES,
] as const satisfies readonly PublicSurfaceSpec[];

export type PublicSurfaceId = (typeof PUBLIC_SURFACE_MANIFEST)[number]['id'];

export async function resolvePublicSurfaceManifest() {
  const resolved = await Promise.all(
    PUBLIC_SURFACE_MANIFEST.map(async spec => ({
      ...spec,
      resolvedPath: spec.resolvePath ? await spec.resolvePath() : spec.path,
    }))
  );

  return resolved as readonly ResolvedPublicSurfaceSpec[];
}

export async function getPublicSurfaceById(surfaceId: string) {
  const manifest = await resolvePublicSurfaceManifest();
  return manifest.find(surface => surface.id === surfaceId);
}

export async function getLighthousePublicSurfaceManifest() {
  const manifest = await resolvePublicSurfaceManifest();
  return manifest.filter(surface => surface.lighthouse);
}
