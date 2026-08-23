import { APP_ROUTES } from '@/constants/routes';
import type { AdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';
import type { AdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import type {
  HudDeployments,
  HudMetricSourceKey,
  HudMetricSourceState,
  HudMetricSourceTrust,
  HudOperationsStatus,
} from '@/types/hud';

/** Client-side staleness threshold aligned with HUD poll cadence and Sentry cache TTL. */
export const HUD_SOURCE_STALE_AFTER_MS = 5 * 60 * 1000;

export type HudSourceFreshnessState = 'fresh' | 'stale' | 'unknown';

export function getSourceFreshnessState(
  fetchedAtIso: string,
  now = Date.now()
): HudSourceFreshnessState {
  const observedAt = Date.parse(fetchedAtIso);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(observedAt) ||
    observedAt > now
  ) {
    return 'unknown';
  }
  return now - observedAt > HUD_SOURCE_STALE_AFTER_MS ? 'stale' : 'fresh';
}

export function formatSourceFreshness(
  fetchedAtIso: string,
  now = Date.now()
): string {
  const diff = now - new Date(fetchedAtIso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'time unknown';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hrs ago`;
}

export function isSourceStale(fetchedAtIso: string, now = Date.now()): boolean {
  return getSourceFreshnessState(fetchedAtIso, now) === 'stale';
}

function resolveExternalState(
  isConfigured: boolean,
  isAvailable: boolean,
  errorMessage?: string
): HudMetricSourceState {
  if (!isConfigured) return 'not_configured';
  if (!isAvailable) {
    return /\b(?:401|403|unauthori[sz]ed|forbidden)\b/i.test(errorMessage ?? '')
      ? 'unauthorized'
      : 'unavailable';
  }
  return 'ok';
}

function buildStripeSourceTrust(
  stripe: AdminStripeOverviewMetrics,
  fetchedAtIso: string
): HudMetricSourceTrust {
  const state = resolveExternalState(
    stripe.isConfigured,
    stripe.isAvailable,
    stripe.errorMessage
  );

  return {
    key: 'stripe',
    label: 'Stripe',
    state,
    fetchedAtIso: stripe.observedAtIso ?? fetchedAtIso,
    errorMessage: stripe.errorMessage ?? null,
    dashboardUrl: 'https://dashboard.stripe.com/',
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add STRIPE_SECRET_KEY to load MRR from Stripe.'
        : state === 'unavailable' || state === 'unauthorized'
          ? 'Check Stripe API credentials and retry.'
          : null,
  };
}

function buildMercurySourceTrust(
  mercury: AdminMercuryMetrics,
  fetchedAtIso: string
): HudMetricSourceTrust {
  const externalState = resolveExternalState(
    mercury.isConfigured,
    mercury.isAvailable,
    mercury.errorMessage
  );
  const state =
    externalState === 'ok' && mercury.burnRateAvailable === false
      ? 'degraded'
      : externalState;

  return {
    key: 'mercury',
    label: 'Mercury',
    state,
    fetchedAtIso: mercury.observedAtIso ?? fetchedAtIso,
    errorMessage: mercury.errorMessage ?? null,
    dashboardUrl: 'https://app.mercury.com/',
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add MERCURY_API_TOKEN and MERCURY_CHECKING_ACCOUNT_ID to load runway.'
        : state === 'unavailable' || state === 'unauthorized'
          ? 'Check Mercury API credentials and retry.'
          : state === 'degraded'
            ? 'Retry Mercury transactions before using burn or runway.'
            : null,
  };
}

function buildDatabaseSourceTrust(
  operations: HudOperationsStatus
): HudMetricSourceTrust {
  const state: HudMetricSourceState =
    operations.status === 'ok' ? 'ok' : 'unavailable';

  return {
    key: 'database',
    label: 'PostgreSQL',
    state,
    fetchedAtIso: operations.checkedAtIso,
    errorMessage:
      state === 'unavailable'
        ? 'Database health check reported degraded status.'
        : null,
    dashboardUrl: APP_ROUTES.HUD,
    configureUrl: null,
    nextStep:
      state === 'unavailable'
        ? 'Inspect database latency and connection pool health.'
        : null,
  };
}

function buildSentrySourceTrust(
  sentry: AdminSentryMetrics,
  fetchedAtIso: string,
  orgSlug: string | undefined
): HudMetricSourceTrust {
  const state = resolveExternalState(
    sentry.isConfigured,
    sentry.isAvailable,
    sentry.errorMessage
  );
  const dashboardUrl =
    orgSlug && state !== 'not_configured'
      ? `https://${orgSlug}.sentry.io/issues/?query=is%3Aunresolved`
      : null;

  return {
    key: 'sentry',
    label: 'Sentry',
    state,
    fetchedAtIso,
    errorMessage: sentry.errorMessage ?? null,
    dashboardUrl,
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG to load incident metrics.'
        : state === 'unavailable' || state === 'unauthorized'
          ? 'Check Sentry API credentials and retry.'
          : null,
  };
}

function buildGithubSourceTrust(
  deployments: HudDeployments,
  fetchedAtIso: string,
  owner: string | undefined,
  repo: string | undefined
): HudMetricSourceTrust {
  let state: HudMetricSourceState;
  if (deployments.availability === 'not_configured') {
    state = 'not_configured';
  } else if (deployments.availability === 'error') {
    state = 'unavailable';
  } else if (deployments.recent.length === 0) {
    state = 'no_data';
  } else {
    state = 'ok';
  }

  const dashboardUrl =
    owner && repo
      ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions`
      : null;

  return {
    key: 'github',
    label: 'GitHub',
    state,
    fetchedAtIso,
    errorMessage: deployments.errorMessage ?? null,
    dashboardUrl,
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add HUD_GITHUB_TOKEN, HUD_GITHUB_OWNER, and HUD_GITHUB_REPO to load deploys.'
        : state === 'unavailable'
          ? 'Check GitHub API credentials and retry.'
          : state === 'no_data'
            ? 'No workflow runs yet — open GitHub Actions to inspect the pipeline.'
            : null,
  };
}

export interface BuildHudMetricSourcesInput {
  readonly stripe: AdminStripeOverviewMetrics;
  readonly mercury: AdminMercuryMetrics;
  readonly sentry: AdminSentryMetrics;
  readonly operations: HudOperationsStatus;
  readonly deployments: HudDeployments;
  readonly fetchedAtIso: string;
  readonly sentryOrgSlug?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
}

export function buildHudMetricSources(
  input: BuildHudMetricSourcesInput
): Record<HudMetricSourceKey, HudMetricSourceTrust> {
  return {
    stripe: buildStripeSourceTrust(input.stripe, input.fetchedAtIso),
    mercury: buildMercurySourceTrust(input.mercury, input.fetchedAtIso),
    database: buildDatabaseSourceTrust(input.operations),
    sentry: buildSentrySourceTrust(
      input.sentry,
      input.fetchedAtIso,
      input.sentryOrgSlug
    ),
    github: buildGithubSourceTrust(
      input.deployments,
      input.fetchedAtIso,
      input.githubOwner,
      input.githubRepo
    ),
  };
}

export function isHudMetricValueAvailable(
  source: HudMetricSourceTrust
): boolean {
  return source.state === 'ok' || source.state === 'no_data';
}
