import { z } from 'zod';

/**
 * P0 journey SLO registry (JOV-6052).
 *
 * One typed object per user-facing critical journey: the user-visible success
 * condition, the technical health signals that proxy it, the SLI/SLO bound to
 * that outcome (not infrastructure-only green), the alert threshold with an
 * owner and a linked runbook, and the correlation-id hops required to localize
 * a failure end to end.
 *
 * This is the single registry the assurance matrix (JOV-6064) and certification
 * evidence (JOV-5916/JOV-5930) consume — do not fork a second SLO silo.
 */

export const P0_JOURNEY_OWNERS = [
  'engineering',
  'operations',
  'security',
  'data',
  'summer',
  'symphony',
] as const;

export type P0JourneyOwner = (typeof P0_JOURNEY_OWNERS)[number];

export const SLI_SOURCES = [
  'sentry',
  'vercel',
  'postgres',
  'stripe',
  'langfuse',
  'synthetic-check',
] as const;

export const TRACE_HOPS = [
  'client',
  'api',
  'db',
  'cache',
  'queue',
  'provider',
  'model',
] as const;

export type TraceHop = (typeof TRACE_HOPS)[number];

export const ALERT_SEVERITIES = ['page', 'ticket'] as const;

const JOURNEY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const P0JourneyAsyncWorkSchema = z
  .object({
    /**
     * Durable state the async work writes so a vanished job is queryable
     * (e.g. a status row, an outbox record, a Sentry check-in id).
     */
    durableState: z.string().trim().min(1),
    /**
     * How a stuck/orphaned unit of work is detected (heartbeat timeout,
     * orphan reaper query, missing check-in).
     */
    orphanDetection: z.string().trim().min(1),
  })
  .strict();

export const P0JourneySloSchema = z
  .object({
    /** Stable id; used in alert routing, dashboards, and evidence joins. */
    id: z.string().regex(JOURNEY_ID_PATTERN),
    /** Human name of the journey. */
    title: z.string().trim().min(1),
    /**
     * The outcome the user actually observes — the thing that must be true
     * for the journey to count as successful. Never an infra-only proxy.
     */
    userVisibleSuccess: z.string().trim().min(1),
    /** Technical health signals that proxy the outcome. */
    healthSignals: z.array(z.string().trim().min(1)).min(1),
    sli: z
      .object({
        /** Where the SLI is measured. */
        source: z.enum(SLI_SOURCES),
        /** What counts as a good event (user-visible success observed). */
        goodEvent: z.string().trim().min(1),
        /** What counts as a total/attempted event. */
        totalEvent: z.string().trim().min(1),
      })
      .strict(),
    slo: z
      .object({
        /** Fraction of good over total events; e.g. 0.995. */
        target: z.number().gt(0.9).lt(1),
        /** Rolling compliance window in days. */
        windowDays: z.number().int().min(1).max(90),
      })
      .strict(),
    alert: z
      .object({
        /** Human-readable burn/error threshold that pages or tickets. */
        threshold: z.string().trim().min(1),
        severity: z.enum(ALERT_SEVERITIES),
        /** Alert destination channel or router. */
        channel: z.string().trim().min(1),
      })
      .strict(),
    owner: z.enum(P0_JOURNEY_OWNERS),
    /** Repo-relative path to the runbook doc; must exist. */
    runbook: z
      .string()
      .trim()
      .min(1)
      .regex(/^docs\//),
    correlation: z
      .object({
        /**
         * Trace hops the correlation id must survive for this journey.
         * First hop is where the id is minted.
         */
        hops: z.array(z.enum(TRACE_HOPS)).min(2),
      })
      .strict(),
    /**
     * Present when the journey includes async/background work that could
     * disappear silently (webhooks, queues, agent turns, publish jobs).
     */
    asyncWork: P0JourneyAsyncWorkSchema.optional(),
    /**
     * Synthetic or production probe that detects a representative silent
     * failure for this journey before users report it.
     */
    silentFailureCheck: z.string().trim().min(1),
  })
  .strict();

export type P0JourneySlo = z.infer<typeof P0JourneySloSchema>;

const ON_CALL = 'docs/ON_CALL_PROCESS.md';

export const P0_JOURNEY_SLOS: readonly P0JourneySlo[] = [
  {
    id: 'marketing-home-render',
    title: 'Marketing homepage renders',
    userVisibleSuccess:
      'Logged-out visitor loads the homepage and sees the locked "Find me" hero CTA.',
    healthSignals: ['GET / status 200', 'LCP < 2.5s', 'zero client errors'],
    sli: {
      source: 'synthetic-check',
      goodEvent: 'homepage probe returns 200 with hero CTA present',
      totalEvent: 'homepage probe executed',
    },
    slo: { target: 0.999, windowDays: 30 },
    alert: {
      threshold: '2 consecutive probe failures or p75 LCP > 4s over 15m',
      severity: 'page',
      channel: '#alerts-critical',
    },
    owner: 'engineering',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api'] },
    silentFailureCheck:
      'Synthetic probe asserts hero CTA copy "Find me" renders; a blank or error shell fails even when status is 200.',
  },
  {
    id: 'signup-onboarding',
    title: 'Creator signs up and claims a handle',
    userVisibleSuccess:
      'New creator completes sign-up, picks an available handle, and lands in onboarding.',
    healthSignals: [
      'Clerk sign-up completion rate',
      'handle-availability check latency',
      'profile row created',
    ],
    sli: {
      source: 'postgres',
      goodEvent: 'creator profile row created within session',
      totalEvent: 'sign-up completed via Clerk webhook',
    },
    slo: { target: 0.99, windowDays: 30 },
    alert: {
      threshold:
        'sign-up→profile success < 95% over 1h or zero completions for 2h during traffic',
      severity: 'page',
      channel: '#alerts-critical',
    },
    owner: 'engineering',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'provider'] },
    asyncWork: {
      durableState: 'profiles row + Clerk webhook event id persisted',
      orphanDetection:
        'hourly query for Clerk users older than 1h with no profile row',
    },
    silentFailureCheck:
      'Daily synthetic sign-up against staging asserts a profile row appears within 60s of the Clerk webhook.',
  },
  {
    id: 'artist-profile-public',
    title: 'Public artist profile renders for fans',
    userVisibleSuccess:
      'Fan opens an artist profile URL and sees name, links, and playable releases.',
    healthSignals: [
      'profile route 200 rate',
      'profile surface query latency',
      'zero hydration errors',
    ],
    sli: {
      source: 'sentry',
      goodEvent: 'profile page view without fatal render error',
      totalEvent: 'profile page request',
    },
    slo: { target: 0.995, windowDays: 30 },
    alert: {
      threshold: 'profile 5xx or render-error rate > 1% over 15m',
      severity: 'page',
      channel: '#alerts-critical',
    },
    owner: 'engineering',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'cache'] },
    silentFailureCheck:
      'Synthetic fan-side render of a seeded profile asserts links and releases are present, catching soft-404 shells.',
  },
  {
    id: 'checkout-billing',
    title: 'Creator completes Stripe checkout and gets entitlement',
    userVisibleSuccess:
      'Creator pays at Stripe checkout and the paid entitlement is active on return.',
    healthSignals: [
      'checkout session completion rate',
      'webhook processing latency',
      'entitlement row written',
    ],
    sli: {
      source: 'stripe',
      goodEvent: 'checkout.session.completed leads to active entitlement',
      totalEvent: 'checkout session created',
    },
    slo: { target: 0.99, windowDays: 30 },
    alert: {
      threshold:
        'any paid checkout without entitlement after 15m, or webhook failure rate > 2% over 30m',
      severity: 'page',
      channel: '#alerts-critical',
    },
    owner: 'operations',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'provider'] },
    asyncWork: {
      durableState:
        'checkout correlation record persisted before redirect (checkout-correlation)',
      orphanDetection:
        'hourly query for completed sessions with no entitlement write',
    },
    silentFailureCheck:
      'Nightly reconciliation diffs Stripe completed sessions against entitlement rows; any gap > 15m files an incident.',
  },
  {
    id: 'chat-agent-turn',
    title: 'Creator chat turn completes',
    userVisibleSuccess:
      'Creator sends a message and receives a complete agent response without a silent hang.',
    healthSignals: [
      'turn completion rate',
      'time-to-first-token',
      'provider error rate',
    ],
    sli: {
      source: 'langfuse',
      goodEvent: 'agent turn finishes with non-empty response',
      totalEvent: 'agent turn started',
    },
    slo: { target: 0.98, windowDays: 7 },
    alert: {
      threshold:
        'turn failure or abandoned-turn rate > 5% over 30m, or provider error rate > 10%',
      severity: 'ticket',
      channel: '#alerts-eng',
    },
    owner: 'engineering',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'queue', 'model'] },
    asyncWork: {
      durableState: 'turn row transitions pending → completed/failed',
      orphanDetection:
        'turns stuck in pending beyond 10m are flagged by the orphan sweep',
    },
    silentFailureCheck:
      'Synthetic turn on a seeded workspace asserts the pending row resolves; a turn that stays pending is an alertable silent failure.',
  },
  {
    id: 'release-publish',
    title: 'Release publishes to the artist profile',
    userVisibleSuccess:
      'Creator publishes a release and it is visible on the public profile.',
    healthSignals: [
      'publish job completion rate',
      'profile surface cache invalidation',
      'public render of the new release',
    ],
    sli: {
      source: 'postgres',
      goodEvent: 'release row reaches published and renders publicly',
      totalEvent: 'publish requested',
    },
    slo: { target: 0.99, windowDays: 30 },
    alert: {
      threshold:
        'publish jobs stuck > 30m or published-but-not-visible rate > 1%',
      severity: 'ticket',
      channel: '#alerts-eng',
    },
    owner: 'engineering',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'cache', 'queue'] },
    asyncWork: {
      durableState: 'release publish state machine row with heartbeat',
      orphanDetection:
        'sweep for publish rows in-flight with heartbeat older than 30m',
    },
    silentFailureCheck:
      'Synthetic publish of a fixture release asserts it renders on the public profile within the publish SLA.',
  },
  {
    id: 'smartlink-fan-click',
    title: 'Fan click through a smart link resolves',
    userVisibleSuccess:
      'Fan taps an artist smart link and lands on the correct destination; the click is recorded.',
    healthSignals: [
      'redirect success rate',
      'click ingestion latency',
      'destination resolution errors',
    ],
    sli: {
      source: 'sentry',
      goodEvent: 'link resolves to destination with click recorded',
      totalEvent: 'link request',
    },
    slo: { target: 0.995, windowDays: 30 },
    alert: {
      threshold: 'redirect failure rate > 1% over 15m or click-write lag > 10m',
      severity: 'page',
      channel: '#alerts-critical',
    },
    owner: 'data',
    runbook: ON_CALL,
    correlation: { hops: ['client', 'api', 'db', 'queue'] },
    asyncWork: {
      durableState: 'click event written to the ingestion queue durably',
      orphanDetection:
        'queue-depth vs write-rate drift alarm catches dropped click events',
    },
    silentFailureCheck:
      'Synthetic click through a fixture link asserts both the redirect and the recorded click event.',
  },
] as const;

export function getP0JourneySlo(id: string): P0JourneySlo | undefined {
  return P0_JOURNEY_SLOS.find(journey => journey.id === id);
}
