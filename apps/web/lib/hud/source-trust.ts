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

export function formatSourceFreshness(
  fetchedAtIso: string,
  now = Date.now()
): string {
  const diff = now - new Date(fetchedAtIso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'just now';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hrs ago`;
}

export function isSourceStale(fetchedAtIso: string, now = Date.now()): boolean {
  const diff = now - new Date(fetchedAtIso).getTime();
  return Number.isFinite(diff) && diff > HUD_SOURCE_STALE_AFTER_MS;
}

function resolveExternalState(
  isConfigured: boolean,
  isAvailable: boolean
): HudMetricSourceState {
  if (!isConfigured) return 'not_configured';
  if (!isAvailable) return 'unavailable';
  return 'ok';
}

function buildStripeSourceTrust(
  stripe: AdminStripeOverviewMetrics,
  fetchedAtIso: string
): HudMetricSourceTrust {
  const state = resolveExternalState(stripe.isConfigured, stripe.isAvailable);

  return {
    key: 'stripe',
    label: 'Stripe',
    state,
    fetchedAtIso,
    errorMessage: stripe.errorMessage ?? null,
    dashboardUrl: 'https://dashboard.stripe.com/',
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add STRIPE_SECRET_KEY to load MRR from Stripe.'
        : state === 'unavailable'
          ? 'Check Stripe API credentials and retry.'
          : null,
  };
}

function buildMercurySourceTrust(
  mercury: AdminMercuryMetrics,
  fetchedAtIso: string
): HudMetricSourceTrust {
  const state = resolveExternalState(mercury.isConfigured, mercury.isAvailable);

  return {
    key: 'mercury',
    label: 'Mercury',
    state,
    fetchedAtIso,
    errorMessage: mercury.errorMessage ?? null,
    dashboardUrl: 'https://app.mercury.com/',
    configureUrl: null,
    nextStep:
      state === 'not_configured'
        ? 'Add MERCURY_API_TOKEN and MERCURY_CHECKING_ACCOUNT_ID to load runway.'
        : state === 'unavailable'
          ? 'Check Mercury API credentials and retry.'
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
    dashboardUrl: APP_ROUTES.ADMIN_OPS,
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
  const state = resolveExternalState(sentry.isConfigured, sentry.isAvailable);
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
        : state === 'unavailable'
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
