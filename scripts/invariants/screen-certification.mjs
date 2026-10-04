#!/usr/bin/env node
/** Screen certification gate (JOV-INV-018). Usage: pnpm screen-certification-gate */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScreenDecisionRouting } from './screen-decision-routing.mjs';
import {
  resolveTrustedArtifactId,
  resolveTrustedScreenProof,
} from './screen-proof-resolver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '../..');
export const SCREEN_CERT_INVARIANT_ID = 'JOV-INV-018';
export const SCREEN_CERT_SCHEMA = 'screen-certification/v2';
export const SCREEN_BROWSER_PROOF_SCHEMA = 'screen-browser-proof/v1';
export const SCREEN_CERT_GATE = 'screen-certification-gate';
export const SCREEN_REGISTRATION_GATE = 'screen-registration-gate';
export const CLS_INTERACTION_BUDGET = 0.05;
// Every entry below is a screen whose registered `sources` exactly matches
// (or, for a directory registration, is the sole capture inside) a route in
// `apps/web/data/marketing/routeManifest.ts` MARKETING_EXACT_PUBLIC_ROUTE_TARGETS
// — i.e. `marketing-routes.spec.ts` already captures real exact-head evidence
// for it every run. Wiring the binding lets the certification gate use that
// evidence instead of blocking on "missing exact-head proof". Screens with no
// matching manifest entry (dynamic/authenticated app-shell pages, iOS/macOS
// screens, or marketing pages not yet in either registry) are intentionally
// left unmapped: JOV-INV-018 has no producer for them on this workflow, and
// mapping them to the wrong route would silently accept unrelated evidence.
export const SCREEN_MARKETING_ROUTES = Object.freeze({
  'web.homepage': '/',
  'web.marketing-new': '/new',
  'web.marketing-pricing': '/pricing',
  'web.marketing-download': '/download',
  'web.marketing-pay': '/pay',
  'web.marketing-product': '/product',
  'web.marketing-card': '/card',
  'web.marketing-smart-links': '/smart-links',
  'web.marketing-launch': '/launch',
  'web.marketing-about': '/about',
  'web.marketing-support': '/support',
  'web.developers': '/developers',
  'web.api-versioning-policy': '/api-versioning',
  'web.cli-landing': '/cli',
  // JOV-7110: web.engineering-publication used to cover both engineering
  // routes as one screen, but the schema binds one route per screen. Split
  // into the index (this binding) and preview (below) screens so each keeps
  // its own exact-head proof instead of extending the schema to N routes.
  'web.engineering-publication': '/engineering',
  'web.engineering-preview': '/engineering/preview',
  'web.marketing-ai': '/ai',
  'web.marketing-compare': '/compare',
  'web.marketing-alternatives': '/alternatives',
  'web.blog': '/blog',
  'web.changelog': '/changelog',
  'web.waitlist': '/waitlist',
  // JOV-7110 registry-gap sweep: these routes were already captured by
  // marketing-routes.spec.ts (they're active MARKETING_ROUTE_MANIFEST
  // entries under (marketing)/ or waitlist/) but had no SCREEN_REGISTRY
  // entry, so a source change to any of them could never certify.
  // web.artists is intentionally NOT here: `apps/web/app/artists/page.tsx`
  // sits outside the (home)/(marketing)/(profile-admission)/waitlist roots
  // that MARKETING_ROUTE_MANIFEST covers (enforced by
  // apps/web/tests/contracts/global-page-contract.test.ts's filesystem
  // scan), so it needs its own SCREEN_PROOF_ROUTES-style producer — see
  // JOV-7110 follow-up.
  'web.artist-profiles': '/artist-profiles',
  'web.artist-profile': '/artist-profile',
  'web.artist-notifications': '/artist-notifications',
  'web.voice': '/voice',
  'web.instant-merch': '/instant-merch',
  'web.youtube-thumbnails': '/youtube-thumbnails',
  'web.demo-video': '/demo/video',
  'web.demovideo': '/demovideo',
  'web.waitlist-invite': '/waitlist/invite',
});
export const SCREEN_PROOF_ROUTES = Object.freeze({
  'web.public-profile': '/unfazed',
  'web.artists': '/artists',
  // JOV-7127: unlike web.artists, these revenue-sensitive dynamic routes have
  // no no-DB fallback branch on the real production path, so the producer
  // captures a reserved, env-gated fixture route instead — see
  // apps/web/app/[username]/[slug]/_lib/screen-cert-fixture.ts.
  'web.smartlink-release': '/jovie-screen-fixture/screen-cert-release',
  'web.smartlink-track':
    '/jovie-screen-fixture/screen-cert-release/screen-cert-track',
  // JOV-7126: `?fs=1` is the *only* way to reach this screen's registered
  // source (apps/web/app/hud/page.tsx). Plain `/hud` is rewritten
  // (next.config.js beforeFiles, `missing: [fs=1, kiosk, mode=kiosk]`) onto
  // the app-shell-wrapped `web.ov-hud-shell` screen instead. The isolated
  // layout (apps/web/app/hud/layout.tsx) also never renders
  // DashboardShellContent, so this route is the one authenticated app-shell
  // screen that does not hit the passkey/Touch ID admin step-up lock
  // (lib/admin/mfa.ts hasRecentAdminMfaReverification) — that lock fails
  // closed by design and correctly has no synthetic-capture bypass, which is
  // why every other admin screen under apps/web/app/app/(shell)/admin/ is
  // out of scope for this producer until a human decides how (or whether)
  // to give it one.
  'web.hud-isolated': '/hud?fs=1',
  // web.tasks and web.contacts are authenticated app-shell screens gated by
  // a real session (redirect to sign-in with none) plus, for tasks, a
  // Pro-plan entitlement whose billing lookup has no noop-DB fallback. Both
  // capture the real routes directly — unlike the smartlink fixture, there
  // is no separate reserved URL — because the visual-capture synthetic
  // dashboard fallback already resolves any bypass session's profile to one
  // reserved id once E2E_FAST_ONBOARDING is set (createE2EDashboardCoreData,
  // apps/web/app/app/(shell)/dashboard/actions/dashboard-data.ts). Both
  // getTasks()/getTask() (task-actions.ts) and GET /api/dashboard/contacts
  // (route.ts) serve a typed fixture instead of the database only for that
  // exact reserved profile id, additionally gated by isRenderFixtureEnabled()
  // — see apps/web/lib/screen-cert/app-shell-fixture-gate.ts.
  'web.tasks': '/app/tasks',
  'web.contacts': '/app/contacts',
});
export const SCREEN_PLATFORMS = Object.freeze(['web', 'macos-electron', 'ios']);
export const EXCLUDED_OWNERS = Object.freeze([
  'ovie',
  'auth-security',
  'macos-menu-monitor',
  'ios-shell',
]);
export const RETAINED_SWEEP_WORKFLOWS = Object.freeze([
  // JOV-5852: screenshots.yml is path-complete on push to main + manual
  // dispatch (its daily cron was retired); live external drift keeps a sweep.
  { path: '.github/workflows/visual-a11y.yml', cron: '37 7 * * *' },
]);

/**
 * @typedef {
 *   | 'apps/web/app/(dynamic)/start/page.tsx'
 *   | 'apps/web/app/app/(shell)/page.tsx'
 *   | 'apps/web/app/app/(shell)/jovie-work/page.tsx'
 *   | 'apps/web/app/app/(shell)/settings/billing/page.tsx'
 *   | 'apps/web/app/onboarding/checkout/page.tsx'
 *   | 'apps/web/app/billing/success/page.tsx'
 * } ProtectedRevenueScreenSource
 */

/** @type {Readonly<Record<ProtectedRevenueScreenSource, true>>} */
export const PROTECTED_REVENUE_SCREEN_SOURCES = Object.freeze({
  'apps/web/app/(dynamic)/start/page.tsx': true,
  'apps/web/app/app/(shell)/page.tsx': true,
  'apps/web/app/app/(shell)/jovie-work/page.tsx': true,
  'apps/web/app/app/(shell)/settings/billing/page.tsx': true,
  'apps/web/app/onboarding/checkout/page.tsx': true,
  'apps/web/app/billing/success/page.tsx': true,
});

function parseRegistry(raw) {
  return raw
    .trim()
    .split('\n')
    .map(line => {
      const [id, platform, owner, sources, viewports, flag, reason] =
        line.split('|');
      return Object.freeze({
        id,
        platform,
        owner,
        sources: sources.split(','),
        viewports: viewports.split(','),
        ...(flag === 'x' ? { excluded: true, reason } : {}),
      });
    });
}

/** @type {readonly object[]} */
export const SCREEN_REGISTRY = Object.freeze(
  parseRegistry(
    `
web.homepage|web|marketing-home|apps/web/app/(home)/page.tsx,apps/web/app/(home)/layout.tsx|desktop,mobile
web.root-document|web|root-document-shell|apps/web/app/layout.tsx|desktop,mobile
web.artists|web|marketing-artists|apps/web/app/artists/page.tsx|desktop,mobile
web.waitlist|web|marketing-waitlist|apps/web/app/waitlist/page.tsx,apps/web/app/waitlist/layout.tsx,apps/web/app/waitlist/error.tsx|desktop,mobile
web.developers|web|developer-documentation|apps/web/app/(marketing)/developers/page.tsx|desktop,mobile
web.api-versioning-policy|web|api-versioning-policy|apps/web/app/(marketing)/api-versioning/page.tsx|desktop,mobile
web.cli-landing|web|cli-landing|apps/web/app/(marketing)/cli/page.tsx|desktop,mobile
web.engineering-publication|web|engineering-publication|apps/web/app/(marketing)/engineering/page.tsx,apps/web/app/(marketing)/engineering/[slug]/page.tsx|desktop,mobile
web.engineering-preview|web|engineering-preview|apps/web/app/(marketing)/engineering/preview/|desktop,mobile
web.changelog|web|changelog|apps/web/app/(marketing)/changelog/|desktop,mobile
web.blog|web|blog|apps/web/app/(marketing)/blog/|desktop,mobile
web.marketing-ai|web|marketing-ai|apps/web/app/(marketing)/ai/page.tsx|desktop,mobile
web.marketing-alternatives|web|marketing-alternatives|apps/web/app/(marketing)/alternatives/|desktop,mobile
web.marketing-card|web|marketing-card|apps/web/app/(marketing)/card/page.tsx|desktop,mobile
web.marketing-compare|web|marketing-compare|apps/web/app/(marketing)/compare/page.tsx|desktop,mobile
web.marketing-download|web|marketing-download|apps/web/app/(marketing)/download/page.tsx|desktop,mobile
web.investor-portal|web|investor-portal|apps/web/app/investor-portal/|desktop,mobile
web.marketing-launch|web|marketing-launch|apps/web/app/(marketing)/launch/page.tsx|desktop,mobile
web.marketing-product|web|marketing-product|apps/web/app/(marketing)/product/page.tsx|desktop,mobile
web.marketing-smart-links|web|marketing-smart-links|apps/web/app/(marketing)/smart-links/page.tsx|desktop,mobile
web.marketing-pay|web|marketing-pay|apps/web/app/(marketing)/pay/page.tsx|desktop,mobile
web.marketing-pricing|web|marketing-pricing|apps/web/app/(marketing)/pricing/page.tsx,apps/web/app/(marketing)/pricing/layout.tsx|desktop,mobile
web.marketing-new|web|marketing-new|apps/web/app/(marketing)/new/page.tsx|desktop,mobile
web.marketing-not-found|web|marketing-not-found|apps/web/app/(marketing)/not-found.tsx|desktop,mobile
web.root-not-found|web|root-not-found|apps/web/app/not-found.tsx|desktop,mobile
web.marketing-shell|web|marketing-shell|apps/web/app/(marketing)/layout.tsx|desktop,mobile
web.marketing-about|web|marketing-about|apps/web/app/(marketing)/about/page.tsx|desktop,mobile
web.marketing-solutions|web|marketing-solutions|apps/web/app/(marketing)/solutions/|desktop,mobile
web.marketing-support|web|marketing-support|apps/web/app/(marketing)/support/page.tsx|desktop,mobile
web.artist-profiles|web|marketing-artist-profiles|apps/web/app/(marketing)/artist-profiles/|desktop,mobile
web.artist-profile|web|marketing-artist-profile|apps/web/app/(marketing)/artist-profile/page.tsx|desktop,mobile
web.artist-notifications|web|marketing-artist-notifications|apps/web/app/(marketing)/artist-notifications/page.tsx|desktop,mobile
web.voice|web|marketing-voice|apps/web/app/(marketing)/voice/page.tsx|desktop,mobile
web.instant-merch|web|marketing-instant-merch|apps/web/app/(marketing)/instant-merch/|desktop,mobile
web.youtube-thumbnails|web|marketing-youtube-thumbnails|apps/web/app/(marketing)/youtube-thumbnails/|desktop,mobile
web.demo-video|web|marketing-demo-video|apps/web/app/(marketing)/demo/video/page.tsx|desktop,mobile
web.demovideo|web|marketing-demovideo|apps/web/app/(marketing)/demovideo/page.tsx|desktop,mobile
web.waitlist-invite|web|marketing-waitlist-invite|apps/web/app/waitlist/invite/page.tsx|desktop,mobile
web.legal-shell|web|legal-shell|apps/web/app/(dynamic)/legal/layout.tsx|desktop,mobile
web.legal-privacy|web|legal-privacy|apps/web/app/(dynamic)/legal/privacy/|desktop,mobile
web.legal-terms|web|legal-terms|apps/web/app/(dynamic)/legal/terms/|desktop,mobile
web.legal-cookies|web|legal-cookies|apps/web/app/(dynamic)/legal/cookies/|desktop,mobile
web.legal-dmca|web|legal-dmca|apps/web/app/(dynamic)/legal/dmca/|desktop,mobile
web.playlists-index|web|public-playlists|apps/web/app/(dynamic)/playlists/page.tsx|desktop,mobile
web.brand|web|marketing-brand|apps/web/app/brand/page.tsx,apps/web/app/brand/layout.tsx|desktop,mobile
web.marketing-renders|web|marketing-renders|apps/web/app/(marketing)/renders/|desktop,mobile
web.profile-admission|web|profile-admission|apps/web/app/(profile-admission)/renders/profile-admission/page.tsx|desktop,mobile
web.app-not-found|web|app-shell-not-found|apps/web/app/app/not-found.tsx|desktop,mobile
web.app-shell|web|app-shell|apps/web/app/app/(shell)/layout.tsx|desktop,mobile
web.money|web|screen.money|apps/web/app/app/money/page.tsx,apps/web/app/app/money/layout.tsx|desktop,mobile
web.exp-library-v1|web|exp-library-v1|apps/web/app/exp/library-v1/page.tsx|desktop,mobile
web.exp-right-rail-shotgun|web|exp-right-rail-shotgun|apps/web/app/exp/right-rail-shotgun/page.tsx|desktop,mobile
web.public-profile|web|public-profile|apps/web/app/[username]/page.tsx,apps/web/app/[username]/layout.tsx|desktop,mobile
web.public-profile-about|web|public-profile|apps/web/app/[username]/about/page.tsx|desktop,mobile
web.artist-pay|web|artist-pay|apps/web/app/[username]/pay/page.tsx|desktop,mobile
web.profile-mode-render|web|profile-mode-render|apps/web/app/[username]/profile-mode-render/|desktop,mobile
web.release-landing|web|release-landing|apps/web/app/r/[slug]/page.tsx,apps/web/app/r/[slug]/ReleaseLandingPage.tsx|desktop,mobile
web.smartlink-release|web|release-landing|apps/web/app/[username]/[...slug]/page.tsx,apps/web/app/[username]/[slug]/page.tsx|desktop,mobile
web.smartlink-track|web|release-landing|apps/web/app/[username]/[slug]/[trackSlug]/page.tsx|desktop,mobile
web.out-link|web|wrapped-link-interstitial|apps/web/app/out/[id]/page.tsx|desktop,mobile
web.report|web|abuse-report-intake|apps/web/app/report/page.tsx|desktop,mobile
web.dashboard-releases|web|dashboard-releases|apps/web/app/app/(shell)/dashboard/releases/page.tsx|desktop,mobile
web.dashboard-presence|web|dashboard-presence|apps/web/app/app/(shell)/dashboard/presence/page.tsx|desktop,mobile
web.dashboard-contacts|web|dashboard-contacts|apps/web/app/app/(shell)/dashboard/contacts/|desktop,mobile
web.contacts|web|contacts|apps/web/app/app/(shell)/contacts/page.tsx,apps/web/app/api/dashboard/contacts/route.ts,apps/web/app/api/dashboard/contacts/_lib/screen-cert-fixture.ts,apps/web/lib/screen-cert/app-shell-fixture-gate.ts|desktop,mobile
web.tasks|web|tasks|apps/web/app/app/(shell)/tasks/page.tsx,apps/web/app/app/(shell)/tasks/TasksRoute.tsx,apps/web/app/app/(shell)/dashboard/tasks/task-actions.ts,apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts,apps/web/lib/screen-cert/app-shell-fixture-gate.ts|desktop,mobile
web.presence|web|presence|apps/web/app/app/(shell)/presence/page.tsx|desktop,mobile
web.profiles|web|profiles|apps/web/app/app/(shell)/profiles/page.tsx|desktop,mobile
web.library|web|library|apps/web/app/app/(shell)/library/page.tsx|desktop,mobile
web.links|web|links|apps/web/app/app/(shell)/links/page.tsx,apps/web/app/app/(shell)/dashboard/links/page.tsx|desktop,mobile
web.library-private-share|web|library-asset-share|apps/web/app/p/[token]/|desktop,mobile
web.settings-artist-profile|web|settings-artist-profile|apps/web/app/app/(shell)/settings/profile/page.tsx,apps/web/app/app/(shell)/settings/artist-profile/page.tsx,apps/web/app/app/(shell)/tipping/page.tsx|desktop,mobile
web.settings-admin-redirect|web|settings-admin-redirect|apps/web/app/app/(shell)/settings/admin/page.tsx|desktop,mobile
web.investor-updates|web|investor-updates|apps/web/app/app/(shell)/admin/investors/updates/page.tsx|desktop,mobile
web.investor-pipeline|web|investor-pipeline|apps/web/app/app/(shell)/admin/investors/page.tsx|desktop,mobile
web.ovie-certifications|web|ovie-certifications|apps/web/app/app/(shell)/admin/certifications/page.tsx|desktop,mobile
web.ov-hud-shell|web|ovie-ops-shell|apps/web/app/app/(shell)/admin/hud/page.tsx|desktop,mobile
web.ov-chat|web|ovie-ops-shell|apps/web/app/app/(shell)/admin/chat/page.tsx|desktop,mobile
web.admin-chat-playground|web|ovie-ops-shell|apps/web/app/app/(shell)/admin/chat-playground/page.tsx,apps/web/app/app/(shell)/admin/chat-playground/layout.tsx|desktop,mobile
web.ov-founder-cockpit|web|ovie-founder-cockpit|apps/web/app/app/(shell)/admin/activity/page.tsx,apps/web/app/app/(shell)/admin/growth/page.tsx,apps/web/app/app/(shell)/admin/needs-you/page.tsx,apps/web/app/app/(shell)/admin/operations/page.tsx,apps/web/app/app/(shell)/admin/product/page.tsx|desktop,mobile
web.ov-company-presence|web|ovie-ops-shell|apps/web/app/app/(shell)/admin/presence/page.tsx|desktop,mobile
web.admin-costs|web|admin-costs|apps/web/app/app/(shell)/admin/costs/page.tsx|desktop,mobile
web.admin-features|web|admin-features|apps/web/app/app/(shell)/admin/features/page.tsx|desktop,mobile
web.admin-feature-registry|web|admin-feature-registry|apps/web/app/app/(shell)/admin/feature-registry/page.tsx|desktop,mobile
web.admin-platform-connections|web|admin-platform-connections|apps/web/app/app/(shell)/admin/platform-connections/|desktop,mobile
web.admin-growth|web|admin-growth|apps/web/app/app/(shell)/admin/growth/page.tsx|desktop,mobile
web.admin-people|web|admin-people|apps/web/app/app/(shell)/admin/people/page.tsx|desktop,mobile
web.admin-agent-runs|web|admin-agent-runs|apps/web/app/app/(shell)/admin/agent-runs/|desktop,mobile
web.admin-ops-redirect|web|ovie-ops-shell|apps/web/app/app/(shell)/admin/ops/page.tsx|desktop,mobile
web.admin-screenshots|web|admin-screenshots|apps/web/app/app/(shell)/admin/screenshots/|desktop,mobile
web.admin-share-studio|web|admin-share-studio|apps/web/app/app/(shell)/admin/share-studio/page.tsx|desktop,mobile
web.admin-wiki|web|admin-wiki|apps/web/app/app/(shell)/admin/wiki/|desktop,mobile
web.admin-visibility-audit|web|admin-visibility-audit|apps/web/app/app/(shell)/admin/visibility-audit/page.tsx|desktop,mobile
web.hud-isolated|web|ovie-ops-isolated|apps/web/app/hud/page.tsx,apps/web/app/hud/layout.tsx|desktop,mobile
web.hud-tv|web|ovie-ops-isolated|apps/web/app/hud-tv/page.tsx|desktop,mobile
web.hud-wiki|web|admin-wiki|apps/web/app/hud/wiki/|desktop,mobile
web.youtube-channel-pilot|web|screen.youtube.channel-pilot|apps/web/app/app/(shell)/youtube/page.tsx|desktop,mobile
web.shipping-statistics|web|shipping-statistics|apps/web/app/app/(shell)/admin/shipping/page.tsx|desktop,mobile
web.start|web|organism.onboarding-chat|apps/web/app/(dynamic)/start/page.tsx,apps/web/app/(dynamic)/start/layout.tsx|desktop,mobile
web.app-root|web|screen.root|apps/web/app/app/(shell)/page.tsx|desktop,mobile
web.chat|web|screen.chat|apps/web/app/app/(shell)/chat/page.tsx|desktop,mobile
web.jovie-work|web|screen.jovie.work|apps/web/app/app/(shell)/jovie-work/page.tsx|desktop,mobile
web.settings-billing|web|screen.settings.billing|apps/web/app/app/(shell)/settings/billing/page.tsx|desktop,mobile
web.settings-connectors|web|settings-connectors|apps/web/app/app/(shell)/settings/connectors/|desktop,mobile
web.settings|web|screen.settings|apps/web/app/app/(shell)/settings/layout.tsx|desktop,mobile
web.onboarding-checkout|web|onboarding-checkout|apps/web/app/onboarding/checkout/page.tsx|desktop,mobile
web.billing-success|web|billing-success|apps/web/app/billing/success/page.tsx|desktop,mobile
web.billing-shell|web|billing-shell|apps/web/app/billing/layout.tsx|desktop,mobile
web.account-shell|web|account-shell|apps/web/app/account/layout.tsx|desktop,mobile
web.root-error-boundary|web|screen.errors.root|apps/web/app/error.tsx,apps/web/app/global-error.tsx|desktop,mobile
web.root-layout|web|screen.root|apps/web/app/layout.tsx|desktop,mobile
macos-electron.hud|macos-electron|desktop-hud|apps/desktop/src/main.ts,apps/desktop/src/navigation.ts|desktop
ios.dashboard|ios|ios-dashboard|apps/ios/Jovie/Features/Dashboard/DashboardView.swift,apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift|compact
ios.chat|ios|ios-chat|apps/ios/Jovie/Features/Chat/MobileChatView.swift|compact
ios.settings|ios|ios-settings|apps/ios/Jovie/Features/Settings/SettingsView.swift|compact
ios.library|ios|ios-library|apps/ios/Jovie/Features/Library/|compact
ios.teleprompter|ios|ios-teleprompter|apps/ios/Jovie/Features/Teleprompter/|compact
ios.inbox|ios|ios-inbox|apps/ios/Jovie/Features/Inbox/|compact
macos-electron.ovie-door|macos-electron|ovie|apps/desktop/src/ovie-door.ts|desktop|x|Product-surface implementation owned by Ovie
macos-electron.auth-security|macos-electron|auth-security|apps/desktop/src/desktop-auth-security.ts|desktop|x|Auth/security lane is out of scope
web.auth|web|auth-security|apps/web/app/(auth)/,apps/web/app/@auth/,apps/web/app/auth-return/,apps/web/app/desktop-auth/,apps/web/app/mobile-auth-return/|desktop,mobile|x|Auth/security lane is out of scope
macos.menu-monitor|macos-electron|macos-menu-monitor|apps/macos/MenuMonitor/|desktop|x|MenuMonitor is out of scope
ios.auth|ios|auth-security|apps/ios/Jovie/Features/Auth/|compact|x|Auth/security lane is out of scope
ios.shell|ios|ios-shell|apps/ios/Jovie/Features/AppShell/|compact|x|iOS shell lane is out of scope
`.trim()
  )
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Proof objects resolved by the producer-owned transport
 * (`resolveTrustedScreenProof`) are marked by identity, never by a field the
 * proof JSON itself can carry, so a caller-authored proof cannot forge the
 * marker by copying it into a handwritten file. Callers cannot populate this
 * set; only the resolver's success path does.
 * @type {WeakSet<object>}
 */
const TRUSTED_PROOF_ORIGINS = new WeakSet();

/**
 * @param {object} proof a proof object produced by the trusted resolver
 */
function markProofTrusted(proof) {
  TRUSTED_PROOF_ORIGINS.add(proof);
}

/**
 * @param {any} proof
 * @returns {boolean} true only for a resolver-produced proof object
 */
function isProofTrusted(proof) {
  return isObject(proof) && TRUSTED_PROOF_ORIGINS.has(proof);
}

function normalizeRepoPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/');
}

function matchesSource(file, source) {
  const path = normalizeRepoPath(file);
  const target = normalizeRepoPath(source);
  return (
    path === target ||
    path.startsWith(target.endsWith('/') ? target : `${target}/`)
  );
}

export function isScreenLikePath(path) {
  const normalized = normalizeRepoPath(path);
  if (normalized.startsWith('apps/macos/MenuMonitor/')) return true;
  if (
    normalized === 'apps/desktop/src/main.ts' ||
    normalized === 'apps/desktop/src/navigation.ts' ||
    normalized === 'apps/desktop/src/tray.ts' ||
    normalized === 'apps/desktop/src/ovie-door.ts' ||
    normalized === 'apps/desktop/src/desktop-auth-security.ts'
  ) {
    return true;
  }
  if (
    normalized.startsWith('apps/web/app/') &&
    (/(?:^|\/)(?:page|layout|loading|error|global-error|default|not-found|template)\.tsx$/.test(
      normalized
    ) ||
      normalized.endsWith('ReleaseLandingPage.tsx'))
  ) {
    return true;
  }
  if (
    normalized.startsWith('apps/desktop/src/renderer/') &&
    /(?:View|Screen|App)\.tsx$/.test(normalized)
  ) {
    return true;
  }
  if (!normalized.startsWith('apps/ios/Jovie/Features/')) return false;
  if (
    !normalized.endsWith('View.swift') &&
    !normalized.endsWith('Screen.swift') &&
    !normalized.endsWith('Sheet.swift')
  ) {
    return false;
  }
  return !/(?:Card|Placeholder|Options|ToolCard)View\.swift$/.test(normalized);
}

/** @param {string} path @param {readonly object[]} [registry] */
export function classifyScreenPath(path, registry = SCREEN_REGISTRY) {
  const normalized = normalizeRepoPath(path);
  for (const kind of /** @type {const} */ (['excluded', 'registered'])) {
    const excluded = kind === 'excluded';
    for (const entry of registry) {
      if (Boolean(entry.excluded) !== excluded) continue;
      if (entry.sources.some(source => matchesSource(normalized, source))) {
        return { kind, entry };
      }
    }
  }
  if (isScreenLikePath(normalized))
    return { kind: 'unregistered', entry: null };
  return { kind: 'out-of-scope', entry: null };
}

function normalizeChanged(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map(item => {
      if (typeof item === 'string')
        return { path: normalizeRepoPath(item), status: 'M' };
      if (!isObject(item) || typeof item.path !== 'string') return null;
      const status =
        typeof item.status === 'string' && item.status
          ? item.status.toUpperCase()
          : 'M';
      return { path: normalizeRepoPath(item.path), status };
    })
    .filter(Boolean);
}

/** Deliberate-red fixture only. Never used to certify a changed surface. */
function makeDeliberateRedProof(screen, headSha) {
  return {
    schema: SCREEN_BROWSER_PROOF_SCHEMA,
    producer: 'external-render-runner',
    screenId: screen.id,
    headSha,
    tier: 'rendered-evidence',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    capturedAt: '2026-09-02T00:00:00.000Z',
    viewports: screen.viewports.map(id => ({
      id,
      decision: 'pass',
      rendered: true,
      axe: { violations: 0 },
      overflow: { maxHorizontalPx: 0 },
      interaction: { passed: true },
      cls: { value: 0 },
    })),
    activeFlow: { disclosure: false },
    historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
    visibleActions: ['Certify', 'Block'],
  };
}

/**
 * Deterministic sha256 over rendered artifact bytes: a single file hashes its
 * bytes; a directory hashes its sorted relative paths plus file bytes so the
 * whole bundle is bound to the proof.
 *
 * @param {string} artifactPath absolute path to a file or directory
 * @returns {string | null} `sha256:<64 hex>`, or null when unreadable/empty
 */
export function hashArtifactBytes(artifactPath) {
  const stat = statSync(artifactPath, { throwIfNoEntry: false });
  if (!stat) return null;
  const hash = createHash('sha256');
  if (stat.isFile()) {
    hash.update(readFileSync(artifactPath));
    return `sha256:${hash.digest('hex')}`;
  }
  if (!stat.isDirectory()) return null;
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push(abs);
    }
  };
  walk(artifactPath);
  if (files.length === 0) return null;
  files.sort();
  for (const file of files) {
    hash.update(relative(artifactPath, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Legacy local-byte consistency helper. It proves only that a caller-selected
 * path matches a caller-selected digest; it is deliberately not used by the
 * certification gate and cannot establish browser-execution provenance.
 *
 * @param {any} proof
 * @param {{ artifactRoot?: string }} [options]
 * @returns {string | null} a finding, or null when the bytes verify
 */
export function verifyProofArtifact(proof, { artifactRoot = REPO_ROOT } = {}) {
  const artifactPath =
    typeof proof?.artifactPath === 'string' ? proof.artifactPath : '';
  if (!artifactPath) {
    return 'proof artifactPath is required; caller-authored proof cannot certify';
  }
  const root = resolve(artifactRoot);
  const resolved = resolve(root, artifactPath);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    return `proof artifactPath escapes the artifact root: ${artifactPath}`;
  }
  const digest = hashArtifactBytes(resolved);
  if (digest === null) {
    return `proof artifact bytes are unreadable: ${artifactPath}`;
  }
  const claimed =
    typeof proof?.artifactDigest === 'string'
      ? proof.artifactDigest.toLowerCase()
      : '';
  if (/^sha256:[0-9a-f]{64}$/.test(claimed) && digest !== claimed) {
    return 'proof artifactDigest does not match the rendered artifact bytes';
  }
  return null;
}

/**
 * @param {any} proof
 * @param {{ screen: object, headSha: string }} context
 */
export function evaluateScreenProof(proof, { screen, headSha }) {
  const findings = [];
  if (!isObject(proof) || proof.schema !== SCREEN_BROWSER_PROOF_SCHEMA) {
    return ['proof schema must be screen-browser-proof/v1'];
  }
  if (proof.producer !== 'external-render-runner') {
    findings.push('proof producer must be external-render-runner');
  }
  if (proof.status !== 'unverified-candidate') {
    findings.push(
      'proof status must be unverified-candidate before resolver verification'
    );
  }
  if (proof.certificationStatus !== 'not-certified') {
    findings.push('proof certificationStatus must be not-certified');
  }
  if (proof.screenId !== screen.id) {
    findings.push(
      `proof screenId ${proof.screenId ?? '<missing>'} does not match ${screen.id}`
    );
  }
  const proofHead =
    typeof proof.headSha === 'string' ? proof.headSha.toLowerCase() : '';
  if (!headSha || proofHead !== headSha.toLowerCase()) {
    findings.push(`stale or missing exact-head proof for ${screen.id}`);
  }
  if (proof.tier === 'scheduled-sweep') {
    findings.push('scheduled-sweep cannot satisfy changed-surface proof');
  } else if (proof.tier !== 'rendered-evidence') {
    findings.push('proof tier must be rendered-evidence');
  }
  if (
    typeof proof.runUrl !== 'string' ||
    !/^https:\/\/[^\s]+$/i.test(proof.runUrl)
  ) {
    findings.push('proof runUrl must be an https URL');
  }
  if (
    typeof proof.artifactDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/i.test(proof.artifactDigest)
  ) {
    findings.push('proof artifactDigest must be sha256:<64 hex>');
  }
  if (
    typeof proof.capturedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      proof.capturedAt
    ) ||
    !Number.isFinite(Date.parse(proof.capturedAt))
  ) {
    findings.push('proof capturedAt must be an ISO timestamp');
  }
  const viewports = Array.isArray(proof.viewports) ? proof.viewports : [];
  const seen = new Map();
  for (const viewport of viewports) {
    const id = isObject(viewport) ? viewport.id : null;
    if (typeof id !== 'string' || id.trim() === '') {
      findings.push('viewport is missing an id');
      continue;
    }
    if (seen.has(id))
      findings.push(`viewport ${id} has more than one decision`);
    seen.set(id, viewport);
    if (
      typeof viewport.decision !== 'string' ||
      viewport.decision.trim() === ''
    ) {
      findings.push(`viewport ${id} is missing a decision`);
    } else if (viewport.decision !== 'pass') {
      findings.push(`viewport ${id} decision must be pass`);
    }
    if (viewport.rendered !== true) {
      findings.push(`viewport ${id} was not rendered`);
    }
    if (viewport.axe?.violations !== 0) {
      findings.push(`viewport ${id} axe violations must be zero`);
    }
    const overflow = viewport.overflow?.maxHorizontalPx;
    if (typeof overflow !== 'number' || overflow < 0 || overflow > 1) {
      findings.push(`viewport ${id} horizontal overflow exceeds 1px`);
    }
    if (viewport.interaction?.passed !== true) {
      findings.push(`viewport ${id} interaction check did not pass`);
    }
    const cls = viewport.cls?.value;
    if (typeof cls !== 'number' || cls < 0 || cls > CLS_INTERACTION_BUDGET) {
      findings.push(`viewport ${id} CLS exceeds ${CLS_INTERACTION_BUDGET}`);
    }
  }
  for (const id of screen.viewports) {
    if (!seen.has(id)) findings.push(`viewport ${id} is missing a decision`);
  }
  if (proof.activeFlow?.disclosure) {
    findings.push('disclosure must not appear in the active flow');
  }
  if (isObject(proof.activeFlow) && 'historyProof' in proof.activeFlow) {
    findings.push('history/proof must be separate from the active flow');
  }
  if (!isObject(proof.historyProof) || proof.historyProof.separate !== true) {
    findings.push('history/proof must be a separate artifact');
  }
  const actions = proof.visibleActions;
  if (
    !Array.isArray(actions) ||
    actions.length === 0 ||
    actions.some(action => typeof action !== 'string' || action.trim() === '')
  ) {
    findings.push('visible actions are required');
  }
  // A local path and digest are caller-controlled, so caller-authored proof
  // never certifies. The only path past this line is a proof object returned
  // by the producer-owned resolver: it has already verified the trusted
  // workflow, the successful exact-head producer job, the immutable artifact
  // digest against GitHub's bytes, the production-build environment, the
  // exact source paths, and every required route/viewport measurement. If
  // that transport was not consulted for this proof object, fail closed.
  if (!isProofTrusted(proof)) {
    findings.push(
      'trusted external browser producer integration is unavailable; supplied proof cannot certify'
    );
  }
  return findings;
}

/**
 * Resolve one producer artifact into a trusted screen proof through the
 * producer-owned GitHub transport, then evaluate it against the admission
 * context. Every resolver rejection carries a specific finding; nothing here
 * can mint a pass from caller-authored bytes.
 *
 * @param {{ artifactId: number, screenId: string, headSha?: string, repoRoot?: string }} request
 * @returns {{ proof: object | null, screen: object | null, findings: string[] }}
 */
export function resolveTrustedProofForScreen(request) {
  const { artifactId, screenId } = request ?? {};
  const screen = SCREEN_REGISTRY.find(
    entry => !entry.excluded && entry.id === screenId
  );
  if (!screen || typeof screenId !== 'string') {
    return {
      proof: null,
      screen: null,
      findings: [
        `proof requested for unknown or excluded screen ${String(screenId)}`,
      ],
    };
  }
  const repoRoot = request.repoRoot ?? REPO_ROOT;
  const headSha = resolveHeadSha(request.headSha, repoRoot);
  const context = {
    headSha,
    screenId: screen.id,
    sourcePaths: [...screen.sources],
    viewports: [...screen.viewports],
    marketingRoute: SCREEN_MARKETING_ROUTES[screen.id],
    proofRoute: SCREEN_PROOF_ROUTES[screen.id],
  };
  const resolved = resolveTrustedScreenProof({ artifactId, context });
  if (!resolved.proof) {
    return {
      proof: null,
      screen,
      findings: [
        `${screen.id}: trusted producer artifact ${String(artifactId)} is not acceptable: ${(resolved.findings || []).join('; ')}`,
      ],
    };
  }
  markProofTrusted(resolved.proof);
  const findings = evaluateScreenProof(resolved.proof, { screen, headSha });
  return { proof: resolved.proof, screen, findings };
}

export const DELIBERATE_RED_FIXTURES = Object.freeze([
  {
    id: 'deliberate-red.missing-registration',
    kind: 'missing-registration',
    changedFiles: [
      { path: 'apps/web/app/(home)/unregistered/page.tsx', status: 'A' },
    ],
  },
  {
    id: 'deliberate-red.modified-protected-missing-registration',
    kind: 'missing-registration',
    removeScreenId: 'web.jovie-work',
    changedFiles: [
      {
        path: 'apps/web/app/app/(shell)/jovie-work/page.tsx',
        status: 'M',
      },
    ],
  },
  {
    id: 'deliberate-red.stale-head',
    kind: 'stale-head',
    screenId: 'web.homepage',
  },
  {
    id: 'deliberate-red.scheduled-sweep-as-changed-surface',
    kind: 'scheduled-sweep',
    screenId: 'web.homepage',
  },
  {
    id: 'deliberate-red.two-decisions-one-viewport',
    kind: 'decision-review',
    proof: {
      viewports: [
        { id: 'desktop', decision: 'pass' },
        { id: 'desktop', decision: 'block' },
        { id: 'mobile', decision: 'pass' },
      ],
    },
  },
  {
    id: 'deliberate-red.active-flow-disclosure',
    kind: 'decision-review',
    proof: { activeFlow: { disclosure: true } },
  },
  {
    id: 'deliberate-red.mixed-history',
    kind: 'decision-review',
    proof: {
      activeFlow: { disclosure: false, historyProof: { separate: false } },
    },
  },
  {
    id: 'deliberate-red.hidden-actions',
    kind: 'decision-review',
    proof: { visibleActions: [] },
  },
]);

/** @param {readonly object[]} [registry] */
export function validateScreenRegistry(
  registry = SCREEN_REGISTRY,
  { repoRoot = REPO_ROOT, verifySources = true } = {}
) {
  const issues = [];
  if (!Array.isArray(registry) || registry.length === 0)
    return ['screen registry is empty'];
  const ids = new Set();
  const platforms = new Set();
  for (const entry of registry) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id) {
      issues.push('screen entry is missing a stable id');
      continue;
    }
    if (ids.has(entry.id)) issues.push(`duplicate screen id ${entry.id}`);
    ids.add(entry.id);
    if (!SCREEN_PLATFORMS.includes(entry.platform)) {
      issues.push(`${entry.id}: platform must be web|macos-electron|ios`);
    }
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      issues.push(`${entry.id}: sources must be non-empty`);
    }
    if (!Array.isArray(entry.viewports) || entry.viewports.length === 0) {
      issues.push(`${entry.id}: viewports must be non-empty`);
    }
    if (!entry.excluded && entry.platform === 'web') {
      for (const viewport of ['desktop', 'mobile']) {
        if (!entry.viewports?.includes(viewport)) {
          issues.push(`${entry.id}: web screens must include ${viewport}`);
        }
      }
    }
    if (entry.excluded) {
      if (!EXCLUDED_OWNERS.includes(entry.owner)) {
        issues.push(
          `${entry.id}: excluded owner ${entry.owner} is not allowed`
        );
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        issues.push(`${entry.id}: excluded screens require a reason`);
      }
    } else {
      platforms.add(entry.platform);
      if (EXCLUDED_OWNERS.includes(entry.owner)) {
        issues.push(
          `${entry.id}: excluded owner ${entry.owner} cannot own a gated screen`
        );
      }
    }
    if (verifySources) {
      for (const source of entry.sources || []) {
        if (!existsSync(resolve(repoRoot, source))) {
          issues.push(`${entry.id}: source ${source} is missing`);
        }
      }
    }
  }
  for (const platform of SCREEN_PLATFORMS) {
    if (!platforms.has(platform))
      issues.push(`registry is missing a gated ${platform} screen`);
  }
  return issues;
}

/** @param {readonly object[]} [registry] */
export function validateProtectedRevenueScreenRegistry(
  registry = SCREEN_REGISTRY
) {
  const issues = [];
  for (const source of Object.keys(PROTECTED_REVENUE_SCREEN_SOURCES)) {
    const owners = registry.filter(
      entry =>
        !entry.excluded &&
        Array.isArray(entry.sources) &&
        entry.sources.some(candidate => normalizeRepoPath(candidate) === source)
    );
    if (owners.length !== 1) {
      issues.push(
        `protected revenue screen ${source} must have exactly one non-excluded registry owner; found ${owners.length}`
      );
      continue;
    }
    const viewports = new Set(owners[0].viewports || []);
    for (const viewport of ['desktop', 'mobile']) {
      if (!viewports.has(viewport)) {
        issues.push(
          `protected revenue screen ${source} must include ${viewport} viewport proof`
        );
      }
    }
  }
  return issues;
}

export function validateRetainedSweeps({
  repoRoot = REPO_ROOT,
  workflows = RETAINED_SWEEP_WORKFLOWS,
} = {}) {
  const issues = [];
  if (!Array.isArray(workflows) || workflows.length === 0) {
    return ['scheduled whole-system sweeps are missing'];
  }
  for (const workflow of workflows) {
    const abs = resolve(repoRoot, workflow.path);
    if (!existsSync(abs)) {
      issues.push(`scheduled sweep ${workflow.path} is missing`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    if (!/\n  schedule:\n/.test(`\n${text}`) || !/cron:/.test(text)) {
      issues.push(`scheduled sweep ${workflow.path} dropped its schedule`);
    }
    if (workflow.cron && !text.includes(workflow.cron)) {
      issues.push(
        `scheduled sweep ${workflow.path} dropped cron ${workflow.cron}`
      );
    }
  }
  return issues;
}

function resolveHeadSha(explicit, repoRoot = REPO_ROOT) {
  if (typeof explicit === 'string' && /^[0-9a-f]{40}$/i.test(explicit)) {
    return explicit.toLowerCase();
  }
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const sha = result.stdout?.trim() ?? '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `screen certification failed closed: exact HEAD SHA is unreadable (${result.stderr?.trim() || sha || 'empty'})`
    );
  }
  return sha.toLowerCase();
}

export function resolveDiffBase(explicit, repoRoot = REPO_ROOT) {
  if (explicit) return explicit;
  if (process.env.SCREEN_CERT_DIFF_BASE)
    return process.env.SCREEN_CERT_DIFF_BASE;
  if (process.env.COMPONENT_SHIP_DIFF_BASE)
    return process.env.COMPONENT_SHIP_DIFF_BASE;
  if (process.env.TURBO_SCM_BASE) return process.env.TURBO_SCM_BASE;
  const probe = spawnSync(
    'git',
    ['rev-parse', '--verify', 'origin/main^{commit}'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  if (probe.status !== 0) return null;
  // A checkout on the base tip (main push or workflow_dispatch, which carry
  // no PR base or event.before) would self-diff and fail closed. Audit the
  // landed head commit instead — the same HEAD^1 convention ci-fast's
  // changedFiles() uses for non-PR events.
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (
    head.status === 0 &&
    head.stdout?.trim() &&
    head.stdout.trim() === probe.stdout?.trim()
  ) {
    const parent = spawnSync(
      'git',
      ['rev-parse', '--verify', 'HEAD^1^{commit}'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    if (parent.status === 0) return 'HEAD^1';
  }
  return 'origin/main';
}

function resolveCommitSha(ref, repoRoot = REPO_ROOT) {
  if (!ref) return null;
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `${ref}^{commit}`],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  const sha = result.stdout?.trim() ?? '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `screen certification diff base is not an exact commit: ${ref}`
    );
  }
  return sha.toLowerCase();
}

function changedFilesFromGit(diffBase, repoRoot = REPO_ROOT) {
  if (!diffBase) return [];
  const result = spawnSync(
    'git',
    ['diff', '--diff-filter=ACDMR', '--name-status', `${diffBase}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `could not resolve changed files from ${diffBase}: ${result.stderr?.trim() || result.stdout}`
    );
  }
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const parts = line.split('\t');
      if (parts.length === 1)
        return { path: normalizeRepoPath(parts[0]), status: 'M' };
      const status = parts[0].trim().charAt(0).toUpperCase();
      if (status === 'R' && parts.length >= 3) {
        return [
          { status, path: normalizeRepoPath(parts[1]) },
          { status, path: normalizeRepoPath(parts[2]) },
        ];
      }
      return {
        status,
        path: normalizeRepoPath(parts[parts.length - 1]),
      };
    });
}

function evaluateDeliberateRed({ registry, headSha, fixtures }) {
  const receipts = [];
  const issues = [];
  for (const fixture of fixtures) {
    const findings = [];
    if (fixture.kind === 'missing-registration') {
      const fixtureRegistry = fixture.removeScreenId
        ? registry.filter(entry => entry.id !== fixture.removeScreenId)
        : registry;
      findings.push(
        ...evaluateChangedScreens({
          changedFiles: fixture.changedFiles,
          registry: fixtureRegistry,
          headSha,
          proofs: [],
          requireExternalEvidence: true,
        }).issues
      );
    } else if (
      fixture.kind === 'stale-head' ||
      fixture.kind === 'scheduled-sweep'
    ) {
      const screen = registry.find(entry => entry.id === fixture.screenId);
      const proof = makeDeliberateRedProof(
        screen,
        fixture.kind === 'stale-head' ? '0'.repeat(40) : headSha
      );
      if (fixture.kind === 'scheduled-sweep') proof.tier = 'scheduled-sweep';
      findings.push(...evaluateScreenProof(proof, { screen, headSha }));
    } else if (fixture.kind === 'decision-review') {
      const screen = registry.find(entry => !entry.excluded);
      const base = makeDeliberateRedProof(screen, headSha);
      const proof = {
        ...base,
        ...fixture.proof,
        activeFlow: {
          ...base.activeFlow,
          ...(fixture.proof?.activeFlow || {}),
        },
      };
      findings.push(...evaluateScreenProof(proof, { screen, headSha }));
    } else {
      findings.push(`${fixture.id}: unknown deliberate-red kind`);
    }
    if (findings.length === 0)
      issues.push(`${fixture.id}: deliberate-red fixture must block`);
    receipts.push({
      id: fixture.id,
      kind: fixture.kind,
      verdict: findings.length > 0 ? 'block' : 'pass',
      findings,
    });
  }
  return { receipts, issues };
}

export function evaluateChangedScreens({
  changedFiles,
  registry = SCREEN_REGISTRY,
  headSha,
  proofs = [],
  requireExternalEvidence = false,
  targetScreenIds = [],
}) {
  const issues = [];
  const changedScreens = [];
  const excludedChanges = [];
  const removedScreens = [];
  const supplied = new Map();
  for (const proof of proofs || []) {
    if (isObject(proof) && typeof proof.screenId === 'string') {
      if (supplied.has(proof.screenId)) {
        issues.push(`duplicate proof for ${proof.screenId}`);
      }
      supplied.set(proof.screenId, proof);
    }
  }
  const seen = new Set();
  const screens = [];
  for (const screenId of targetScreenIds) {
    const screen = registry.find(
      entry => !entry.excluded && entry.id === screenId
    );
    if (!screen) {
      issues.push(`targeted screen is not registered: ${screenId}`);
      continue;
    }
    if (!seen.has(screen.id)) {
      seen.add(screen.id);
      screens.push(screen);
    }
  }
  for (const file of normalizeChanged(changedFiles)) {
    const classified = classifyScreenPath(file.path, registry);
    if (classified.kind === 'excluded') {
      excludedChanges.push({
        path: file.path,
        screenId: classified.entry.id,
        owner: classified.entry.owner,
      });
      continue;
    }
    if (classified.kind === 'out-of-scope') continue;
    // A deleted screen renders nothing, so there is no surface to own or
    // certify; its registry entry is removed with it. Record the removal so
    // receipts still show it. Added and modified paths stay fail-closed.
    if (classified.kind === 'unregistered' && file.status === 'D') {
      removedScreens.push(file.path);
      continue;
    }
    if (classified.kind === 'unregistered') {
      issues.push(
        `missing registration for changed in-scope screen ${file.path}`
      );
      continue;
    }
    const screen = classified.entry;
    if (seen.has(screen.id)) continue;
    seen.add(screen.id);
    screens.push(screen);
  }
  for (const screen of screens) {
    const proof = supplied.get(screen.id) || null;
    if (!proof) {
      const detail = requireExternalEvidence
        ? `missing exact-head proof for ${screen.id}`
        : null;
      if (detail) issues.push(detail);
      changedScreens.push({
        id: screen.id,
        verdict: requireExternalEvidence ? 'block' : 'evidence-required',
        findings: detail ? [detail] : [],
      });
      continue;
    }
    const findings = evaluateScreenProof(proof, {
      screen,
      headSha,
    });
    if (findings.length > 0)
      issues.push(`${screen.id}: ${findings.join('; ')}`);
    changedScreens.push({
      id: screen.id,
      verdict: findings.length === 0 ? 'pass' : 'block',
      findings,
      // Renderer provenance + immutable artifact identity ride the receipt
      // for every certified screen.
      ...(findings.length === 0
        ? { artifactDigest: proof.artifactDigest, rendererRunUrl: proof.runUrl }
        : {}),
    });
  }
  for (const screenId of supplied.keys()) {
    if (!seen.has(screenId)) {
      issues.push(`proof supplied for unchanged or unknown screen ${screenId}`);
    }
  }
  return { issues, changedScreens, excludedChanges, removedScreens };
}

export function routeArtifactRequests({
  pendingScreens,
  requested,
  fallbackArtifactId,
}) {
  const routed = [...requested];
  const explicitlyRequested = new Set(routed.map(request => request.screenId));
  for (const screen of pendingScreens) {
    if (explicitlyRequested.has(screen.id)) continue;
    routed.push({ artifactId: fallbackArtifactId, screenId: screen.id });
  }
  return routed;
}

export function runScreenCertification(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const registry = options.registry ?? SCREEN_REGISTRY;
  const targetScreenIds = Array.isArray(options.targetScreenIds)
    ? [...new Set(options.targetScreenIds)]
    : [];
  const headSha = resolveHeadSha(options.headSha, repoRoot);
  const issues = [
    ...validateScreenRegistry(registry, {
      repoRoot,
      verifySources: options.verifySources !== false,
    }),
    ...validateProtectedRevenueScreenRegistry(registry),
    ...validateRetainedSweeps({
      repoRoot,
      workflows: options.workflows ?? RETAINED_SWEEP_WORKFLOWS,
    }),
  ];
  const fixtures = options.redFixtures ?? DELIBERATE_RED_FIXTURES;
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    issues.push('deliberate-red fixtures are missing; fail closed');
  }
  const red = evaluateDeliberateRed({
    registry,
    headSha,
    fixtures: fixtures ?? [],
  });
  issues.push(...red.issues);
  const diffBase =
    options.diffBase ?? resolveDiffBase(options.diffBase, repoRoot);
  const baseSha = options.changedFiles
    ? null
    : resolveCommitSha(diffBase, repoRoot);
  if (!options.changedFiles && (!baseSha || baseSha === headSha)) {
    issues.push('screen diff base must resolve and differ from exact HEAD');
  }
  const changedFiles =
    options.changedFiles ?? changedFilesFromGit(diffBase, repoRoot);
  // Producer-owned artifact requests resolve first; their trusted proofs join
  // caller-supplied proofs in the existing admission path below. Resolver
  // rejections surface as specific issues and never as silent passes.
  const proofs = [...(options.proofs ?? [])];
  let requested = Array.isArray(options.proofRequests)
    ? [...options.proofRequests]
    : [];
  const artifactRequest = {
    artifactId: Number(
      options.artifactId ?? process.env.SCREEN_CERT_ARTIFACT_ID ?? ''
    ),
    artifactName:
      options.marketingArtifactName ??
      process.env.SCREEN_CERT_MARKETING_ARTIFACT ??
      '',
  };
  const pendingScreens = [];
  const seenPending = new Set();
  for (const file of normalizeChanged(changedFiles)) {
    const classified = classifyScreenPath(file.path, registry);
    if (
      classified.kind === 'registered' &&
      !seenPending.has(classified.entry.id)
    ) {
      seenPending.add(classified.entry.id);
      pendingScreens.push(classified.entry);
    }
  }
  const wantsArtifact =
    Number.isSafeInteger(artifactRequest.artifactId) &&
    artifactRequest.artifactId > 0
      ? artifactRequest.artifactId
      : artifactRequest.artifactName
        ? resolveTrustedArtifactId({
            artifactName: artifactRequest.artifactName,
            headSha,
          })
        : null;
  if (
    pendingScreens.length > 0 &&
    (artifactRequest.artifactName ||
      (Number.isSafeInteger(artifactRequest.artifactId) &&
        artifactRequest.artifactId > 0))
  ) {
    if (!wantsArtifact) {
      issues.push('controlled GitHub artifact resolver is unavailable');
    } else {
      requested = routeArtifactRequests({
        pendingScreens,
        requested,
        fallbackArtifactId: wantsArtifact,
      });
    }
  }
  for (const request of requested) {
    const resolved = resolveTrustedProofForScreen({
      ...request,
      headSha,
      repoRoot,
    });
    if (resolved.proof) proofs.push(resolved.proof);
    else issues.push(...resolved.findings);
  }
  const changed = evaluateChangedScreens({
    changedFiles,
    registry,
    headSha,
    proofs,
    requireExternalEvidence: options.registrationOnly !== true,
    targetScreenIds,
  });
  issues.push(...changed.issues);
  const ok = issues.length === 0;
  // Only proofs returned by the trusted producer adapter can make external
  // certification real. Registration-only audits and no-change runs never
  // certify.
  const certified =
    ok &&
    options.registrationOnly !== true &&
    changed.changedScreens.length > 0;
  const status = !ok
    ? issues.some(issue =>
        issue.includes('external browser producer integration is unavailable')
      )
      ? 'external-certification-unavailable'
      : 'blocked'
    : certified
      ? 'certified'
      : changed.changedScreens.length > 0
        ? options.registrationOnly === true
          ? 'source-registered'
          : 'evidence-required'
        : 'not-applicable';
  return {
    ok,
    schema: SCREEN_CERT_SCHEMA,
    receipt: {
      schema: SCREEN_CERT_SCHEMA,
      gate:
        options.registrationOnly === true
          ? SCREEN_REGISTRATION_GATE
          : SCREEN_CERT_GATE,
      invariant: SCREEN_CERT_INVARIANT_ID,
      headSha,
      baseSha,
      ok,
      certified,
      registrationOnly: options.registrationOnly === true,
      certificationScope:
        targetScreenIds.length > 0
          ? 'targeted-screen-plus-change-set'
          : 'changed-screen-set',
      targetedScreenIds: targetScreenIds,
      status,
      issues,
      changedScreens: changed.changedScreens,
      // Shadow qualification cannot change the existing runtime-proof verdict.
      decisionRouting: projectScreenDecisionRouting({
        headSha,
        changedPaths: normalizeChanged(changedFiles).map(file => file.path),
        declarations: options.decisionDeclarations,
        inputError: options.decisionInputError,
      }),
      excludedChanges: changed.excludedChanges,
      removedScreens: changed.removedScreens,
      fixtures: red.receipts,
      sweeps: (options.workflows ?? RETAINED_SWEEP_WORKFLOWS).map(item => ({
        path: item.path,
        retained: true,
      })),
    },
  };
}

/**
 * Certify one explicitly targeted registered screen from an immutable exact-head
 * producer artifact. This entrypoint proves the current rendering and its
 * registry source binding; it does not claim that the screen source changed in
 * the commit being certified.
 * The controlled resolver binds the candidate to the trusted workflow, the
 * completed producer job, the exact main head, the registered source paths,
 * and GitHub's artifact digest before the normal admission checks run.
 * @param {{ artifactId?: number; screenId?: string; repoRoot?: string; diffBase?: string; decisionDeclarations?: object; decisionInputError?: boolean }} options
 */
export function runScreenCertificationFromArtifact({
  artifactId,
  screenId,
  repoRoot = REPO_ROOT,
  diffBase,
  decisionDeclarations,
  decisionInputError,
} = {}) {
  const headSha = resolveHeadSha(undefined, repoRoot);
  return runScreenCertification({
    repoRoot,
    headSha,
    diffBase,
    targetScreenIds: typeof screenId === 'string' && screenId ? [screenId] : [],
    proofRequests: [{ artifactId: Number(artifactId), screenId }],
    decisionDeclarations,
    decisionInputError,
  });
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const diffBase = process.argv
    .find(arg => arg.startsWith('--diff-base='))
    ?.slice(12);
  const decisionFile = process.argv
    .find(arg => arg.startsWith('--decision-file='))
    ?.slice('--decision-file='.length);
  let decisionDeclarations;
  let decisionInputError = false;
  if (decisionFile) {
    try {
      decisionDeclarations = JSON.parse(
        readFileSync(resolve(decisionFile), 'utf8')
      );
    } catch {
      // Classification is shadow-only; record the failure without altering
      // the current screen gate or mistaking missing data for ordinary work.
      decisionInputError = true;
    }
  }
  const proofFile = process.argv
    .find(arg => arg.startsWith('--proof-file='))
    ?.slice('--proof-file='.length);
  const artifactRoot = process.argv
    .find(arg => arg.startsWith('--artifact-root='))
    ?.slice('--artifact-root='.length);
  const artifactId = process.argv
    .find(arg => arg.startsWith('--artifact-id='))
    ?.slice('--artifact-id='.length);
  const screenId = process.argv
    .find(arg => arg.startsWith('--screen-id='))
    ?.slice('--screen-id='.length);
  const marketingArtifactName = process.argv
    .find(arg => arg.startsWith('--marketing-artifact='))
    ?.slice('--marketing-artifact='.length);
  const receiptOut = process.argv
    .find(arg => arg.startsWith('--receipt-out='))
    ?.slice('--receipt-out='.length);
  const registrationOnly = process.argv.includes('--registration-only');
  const activeGate =
    registrationOnly && !screenId ? SCREEN_REGISTRATION_GATE : SCREEN_CERT_GATE;
  if (
    screenId &&
    (proofFile || artifactRoot || marketingArtifactName || registrationOnly)
  ) {
    throw new Error(
      '--screen-id targeted artifact certification is incompatible with --proof-file, --artifact-root, --marketing-artifact, and --registration-only'
    );
  }
  let proofs = [];
  if (proofFile) {
    const parsed = JSON.parse(readFileSync(resolve(proofFile), 'utf8'));
    proofs = Array.isArray(parsed) ? parsed : parsed.proofs;
    if (!Array.isArray(proofs)) {
      throw new Error('screen proof file must contain an array or { proofs }');
    }
  }
  const result = screenId
    ? runScreenCertificationFromArtifact({
        artifactId: artifactId ? Number(artifactId) : undefined,
        screenId,
        diffBase,
        decisionDeclarations,
        decisionInputError,
      })
    : runScreenCertification({
        diffBase,
        decisionDeclarations,
        decisionInputError,
        proofs,
        registrationOnly,
        artifactRoot,
        ...(artifactId ? { artifactId: Number(artifactId) } : {}),
        ...(marketingArtifactName ? { marketingArtifactName } : {}),
      });
  if (receiptOut) {
    // The receipt is the immutable machine record: exact head/base, per-screen
    // verdicts with artifact digest + renderer provenance, and the certified bit.
    writeFileSync(
      resolve(receiptOut),
      `${JSON.stringify(result.receipt, null, 2)}\n`
    );
  }
  process.stdout.write(
    `[${activeGate}] decision-routing=${result.receipt.decisionRouting.status} mode=qualification-only founder-candidates=${result.receipt.decisionRouting.founderReviewCandidates.length} delivery=not-verified\n`
  );
  if (result.ok) {
    process.stdout.write(
      `[${activeGate}] PASS head=${result.receipt.headSha} changed=${result.receipt.changedScreens.length} status=${result.receipt.status} certified=${result.receipt.certified}\n`
    );
  } else {
    for (const issue of result.receipt.issues) {
      process.stderr.write(`[${activeGate}] ${issue}\n`);
    }
    process.stderr.write(
      `[${activeGate}] FAIL — ${SCREEN_CERT_INVARIANT_ID} ${SCREEN_CERT_SCHEMA}\n`
    );
  }
  process.exit(result.ok ? 0 : 1);
}
