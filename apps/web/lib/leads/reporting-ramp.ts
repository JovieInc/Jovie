import 'server-only';

import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import {
  leadFunnelEvents,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { captureError, captureWarning } from '@/lib/error-tracking';
import type { RampRecommendation } from './reporting-types';

const CONTACT_EVENT_TYPES = new Set(['email_queued', 'dm_sent']);

function getDefaultThresholds() {
  return {
    minimumSampleSize: 30,
    increaseClaimClickRate: 0.06,
    holdClaimClickRateFloor: 0.03,
    pauseClaimClickRateFloor: 0.03,
    maxBounceComplaintRate: 0.03,
    maxUnsubscribeRate: 0.05,
    maxProviderFailureRate: 0.1,
  };
}

function isMissingLeadReportingSchemaError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (!message.includes('does not exist')) {
    return false;
  }

  return [
    'lead_funnel_events',
    'column "daily_send_cap"',
    'column "guardrail_thresholds"',
    'column "outreach_status"',
  ].some(pattern => message.includes(pattern));
}

function isTelemetryIncomplete(input: {
  contacted: number;
  providerFailureRate: number | null;
  guardrailsEnabled: boolean;
}): boolean {
  if (!input.guardrailsEnabled) {
    return false;
  }

  return input.contacted > 0 && input.providerFailureRate === null;
}

function evaluateRampAction(opts: {
  contacted: number;
  claimClickRate: number | null;
  providerFailureRate: number | null;
  currentDailyCap: number;
  thresholds: ReturnType<typeof getDefaultThresholds>;
  guardrailsEnabled: boolean;
  rampMode: string;
}): RampRecommendation {
  const {
    contacted,
    claimClickRate,
    providerFailureRate,
    currentDailyCap,
    thresholds,
    guardrailsEnabled,
    rampMode,
  } = opts;

  if (contacted < thresholds.minimumSampleSize) {
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons: [
        `Sample below threshold (${contacted}/${thresholds.minimumSampleSize}).`,
      ],
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    providerFailureRate !== null &&
    providerFailureRate >= thresholds.maxProviderFailureRate
  ) {
    return {
      recommendedAction: 'pause',
      recommendedNextDailyCap: 0,
      reasons: [
        `Provider failure rate ${Math.round(providerFailureRate * 100)}% exceeds threshold.`,
      ],
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    claimClickRate !== null &&
    claimClickRate < thresholds.pauseClaimClickRateFloor
  ) {
    return {
      recommendedAction: 'pause',
      recommendedNextDailyCap: 0,
      reasons: [
        `Claim click rate ${Math.round(claimClickRate * 1000) / 10}% is below pause threshold.`,
      ],
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    isTelemetryIncomplete({ contacted, providerFailureRate, guardrailsEnabled })
  ) {
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons: [
        'Provider telemetry is incomplete, so the system will not auto-ramp.',
      ],
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    claimClickRate !== null &&
    claimClickRate < thresholds.holdClaimClickRateFloor
  ) {
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons: [
        `Claim click rate ${Math.round(claimClickRate * 1000) / 10}% is inside the hold band.`,
      ],
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  if (
    claimClickRate !== null &&
    claimClickRate >= thresholds.increaseClaimClickRate
  ) {
    const reasons = ['Claim click rate supports a controlled increase.'];
    if (rampMode === 'manual') {
      reasons.push(
        'Ramp mode is manual, so this remains an operator recommendation.'
      );
    }
    return {
      recommendedAction: 'increase',
      recommendedNextDailyCap: Math.ceil(currentDailyCap * 1.5),
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
  }

  return {
    recommendedAction: 'hold',
    recommendedNextDailyCap: currentDailyCap,
    reasons: ['Performance is inside the hold band.'],
    sampleSize: contacted,
    claimClickRate,
    providerFailureRate,
  };
}

export async function getRampRecommendation(): Promise<RampRecommendation> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    const thresholds = settings?.guardrailThresholds ?? getDefaultThresholds();
    const currentDailyCap = settings?.dailySendCap ?? 10;
    const guardrailsEnabled = settings?.guardrailsEnabled ?? true;

    const recentEvents = await db
      .select({
        leadId: leadFunnelEvents.leadId,
        eventType: leadFunnelEvents.eventType,
      })
      .from(leadFunnelEvents)
      .where(gte(leadFunnelEvents.occurredAt, since));

    const eventMap = new Map<string, Set<string>>();
    for (const event of recentEvents) {
      const existing = eventMap.get(event.leadId) ?? new Set<string>();
      existing.add(event.eventType);
      eventMap.set(event.leadId, existing);
    }

    let contacted = 0;
    let claimClicks = 0;
    for (const events of eventMap.values()) {
      if ([...CONTACT_EVENT_TYPES].some(eventType => events.has(eventType))) {
        contacted++;
      }
      if (events.has('claim_page_viewed')) {
        claimClicks++;
      }
    }

    const [failedRow] = await db
      .select({ total: count() })
      .from(leads)
      .where(
        and(eq(leads.outreachStatus, 'failed'), gte(leads.updatedAt, since))
      );

    const providerFailureRate =
      contacted > 0 ? Number(failedRow?.total ?? 0) / contacted : null;
    const claimClickRate = contacted > 0 ? claimClicks / contacted : null;

    return evaluateRampAction({
      contacted,
      claimClickRate,
      providerFailureRate,
      currentDailyCap,
      thresholds,
      guardrailsEnabled,
      rampMode: settings?.rampMode ?? 'manual',
    });
  } catch (error) {
    if (isMissingLeadReportingSchemaError(error)) {
      await captureWarning(
        '[leads/reporting] GTM reporting schema missing; returning hold recommendation',
        error
      );
      return {
        recommendedAction: 'hold',
        recommendedNextDailyCap: 10,
        reasons: [
          'GTM reporting schema is not fully available in this environment yet.',
        ],
        sampleSize: 0,
        claimClickRate: null,
        providerFailureRate: null,
      };
    }

    captureError('Error building lead ramp recommendation', error);
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: 10,
      reasons: ['GTM reporting is temporarily unavailable.'],
      sampleSize: 0,
      claimClickRate: null,
      providerFailureRate: null,
    };
  }
}
