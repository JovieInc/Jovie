/**
 * Loop 1: email deliverability (fleet/closed-loop-gaps.md gap 7).
 *
 * Signal: Resend bounce / complaint / sign-in delivery latency from the
 * webhook_events table (apps/web route below) plus live SPF/DKIM/DMARC/BIMI DNS
 * for the sending domains. Threshold rules below; the runner files or resolves
 * the fingerprinted Linear issue and the registry row loop-health-email-deliverability
 * carries the dwell SLO and dead-man liveness.
 *
 * Thresholds are the receiver-side limits, not aspirations: Gmail and Yahoo bulk
 * sender rules require spam complaints under 0.3% and recommend under 0.1%;
 * Resend suspends at sustained bounce above 4%, so 2% leaves headroom. The
 * absolute complaint cap catches the first complaints while volume is too low
 * for a rate to mean anything.
 */
import dns from 'node:dns/promises';
import { checkSendingDomains } from '../lib/email-dns.mjs';

const METRICS_PATH = '/api/cron/loop-health/email-deliverability';

export default {
  key: 'email-deliverability',
  title: 'Email deliverability breach',
  severity: 'High',
  priority: 2,
  owner: 'jovie-web',
  sourceIssue: 'none',
  source:
    'loop-health-email-deliverability.yml / scripts/loops/email-deliverability.mjs',
  summary:
    'Sign-in and notification mail is the front door. One or more deliverability limits are breached: a bounce or complaint rate above the receiver limit, slow sign-in mail delivery, or a broken SPF, DKIM or DMARC record on a sending domain.',
  whyItMatters:
    'A reputation or authentication failure drops OTP and sign-in mail silently: signups fail with no error anywhere in the app (see the prod sign-in RCA).',
  remeasure:
    'node scripts/loop-health.mjs --loop email-deliverability --no-file',
  dwellSloMinutes: 360,
  rules: [
    {
      id: 'dns-authentication',
      metric: 'dnsFailures',
      op: 'max',
      threshold: 0,
      description:
        'SPF, DKIM, DMARC or BIMI record is missing, duplicated or invalid on a sending domain',
    },
    {
      id: 'bounce-rate-7d',
      metric: 'bounceRatePct',
      op: 'max',
      threshold: 2,
      unit: '%',
      sample: { metric: 'attempts7d', min: 100 },
      description: 'hard and soft bounces over attempts in the last 7 days',
    },
    {
      id: 'complaint-rate-7d',
      metric: 'complaintRatePct',
      op: 'max',
      threshold: 0.1,
      unit: '%',
      sample: { metric: 'attempts7d', min: 1000 },
      description: 'spam complaints over attempts in the last 7 days',
    },
    {
      id: 'complaints-absolute-7d',
      metric: 'complaints7d',
      op: 'max',
      threshold: 2,
      description: 'spam complaints in the last 7 days regardless of volume',
    },
    {
      id: 'signin-delivery-p95',
      metric: 'deliveryLatencyP95Sec',
      op: 'max',
      threshold: 60,
      unit: 's',
      sample: { metric: 'latencySamples7d', min: 5 },
      description:
        'p95 seconds from send to delivered for sign-in and verification mail',
    },
  ],
  async collect({ env, fetchImpl, resolver = dns }) {
    const base = env.LOOP_HEALTH_BASE_URL || 'https://jov.ie';
    const secret = env.CRON_SECRET;
    if (!secret)
      throw new Error('CRON_SECRET is not set; cannot read email metrics');
    const response = await fetchImpl(`${base}${METRICS_PATH}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok)
      throw new Error(`email metrics route returned HTTP ${response.status}`);
    const app = await response.json();
    const dnsResult = await checkSendingDomains(resolver);
    return {
      metrics: {
        attempts7d: app.attempts7d,
        bounced7d: app.bounced7d,
        complaints7d: app.complaints7d,
        bounceRatePct: app.bounceRatePct,
        complaintRatePct: app.complaintRatePct,
        deliveryLatencyP95Sec: app.deliveryLatencyP95Sec,
        latencySamples7d: app.latencySamples7d,
        dnsFailures: dnsResult.findings.length,
      },
      detail: { findings: dnsResult.findings, dnsFacts: dnsResult.facts },
    };
  },
};
