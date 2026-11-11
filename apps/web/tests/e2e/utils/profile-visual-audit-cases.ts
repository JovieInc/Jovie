// Only the legacy shell exists today: the v2 shell flag (ff_profile_v2) was
// removed from the app in #8391. Re-add a variant when a new shell flag ships.
export type ShellVariant = 'legacy';
export type ThemeVariant = 'dark' | 'light';
export type BreakpointVariant = 'mobile' | 'tablet' | 'desktop';

export interface BreakpointConfig {
  readonly name: BreakpointVariant;
  readonly width: number;
  readonly height: number;
}

export interface ProfileAuditCase {
  readonly id: string;
  readonly path: string;
  readonly readySelector: string;
  readonly shells: readonly ShellVariant[];
  readonly composerVisible?: boolean;
  readonly focusComposerInput?: boolean;
}

export const TEST_PROFILE = 'dualipa';
export const TIP_PROFILE = 'testartist';
export const PROFILE_READY_SELECTOR = 'h1, [data-testid="profile-header"]';
// Dead ready selectors removed: subscribe-cta-container and profile-tour-heading
// were dropped from the app in #8391; the header fallback above is the live gate.
export const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
export const BREAKPOINTS: readonly BreakpointConfig[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];
export const THEMES: readonly ThemeVariant[] = ['dark', 'light'];
export const PROFILE_CASES: readonly ProfileAuditCase[] = [
  {
    id: 'profile',
    path: `/${TEST_PROFILE}`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
  },
  {
    id: 'listen',
    path: `/${TEST_PROFILE}?mode=listen`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
  },
  {
    id: 'subscribe',
    path: `/${TEST_PROFILE}?mode=subscribe`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
    composerVisible: true,
  },
  {
    id: 'subscribe-focus',
    path: `/${TEST_PROFILE}?mode=subscribe`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
    composerVisible: true,
    focusComposerInput: true,
  },
  {
    id: 'about',
    path: `/${TEST_PROFILE}?mode=about`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
  },
  {
    id: 'tour',
    path: `/${TEST_PROFILE}?mode=tour`,
    readySelector: PROFILE_READY_SELECTOR,
    shells: ['legacy'],
  },
  {
    id: 'contact',
    path: `/${TEST_PROFILE}?mode=contact`,
    readySelector: `${PROFILE_READY_SELECTOR}, [data-testid="contact-drawer"]`,
    shells: ['legacy'],
  },
  {
    id: 'tip',
    path: `/${TIP_PROFILE}?mode=pay`,
    readySelector: `${PROFILE_READY_SELECTOR}, [data-testid="tip-drawer"]`,
    shells: ['legacy'],
  },
];
