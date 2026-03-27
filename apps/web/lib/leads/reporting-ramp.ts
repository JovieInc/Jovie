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
    const reasons: string[] = [];

    if (contacted < thresholds.minimumSampleSize) {
      reasons.push(
        `Sample below threshold (${contacted}/${thresholds.minimumSampleSize}).`
      );
      return {
        recommendedAction: 'hold',
        recommendedNextDailyCap: currentDailyCap,
        reasons,
        sampleSize: contacted,
        claimClickRate,
        providerFailureRate,
      };
    }

    if (
      providerFailureRate !== null &&
      providerFailureRate >= thresholds.maxProviderFailureRate
    ) {
      reasons.push(
        `Provider failure rate ${Math.round(providerFailureRate * 100)}% exceeds threshold.`
      );
      return {
        recommendedAction: 'pause',
        recommendedNextDailyCap: 0,
        reasons,
        sampleSize: contacted,
        claimClickRate,
        providerFailureRate,
      };
    }

    if (
      claimClickRate !== null &&
      claimClickRate < thresholds.pauseClaimClickRateFloor
    ) {
      reasons.push(
        `Claim click rate ${Math.round(claimClickRate * 1000) / 10}% is below pause threshold.`
      );
      return {
        recommendedAction: 'pause',
        recommendedNextDailyCap: 0,
        reasons,
        sampleSize: contacted,
        claimClickRate,
        providerFailureRate,
      };
    }

    if (
      isTelemetryIncomplete({
        contacted,
        providerFailureRate,
        guardrailsEnabled,
      })
    ) {
      reasons.push(
        'Provider telemetry is incomplete, so the system will not auto-ramp.'
      );
      return {
        recommendedAction: 'hold',
        recommendedNextDailyCap: currentDailyCap,
        reasons,
        sampleSize: contacted,
        claimClickRate,
        providerFailureRate,
      };
    }

    if (
      claimClickRate !== null &&
      claimClickRate < thresholds.holdClaimClickRateFloor
    ) {
      reasons.push(
        `Claim click rate ${Math.round(claimClickRate * 1000) / 10}% is inside the hold band.`
      );
      return {
        recommendedAction: 'hold',
        recommendedNextDailyCap: currentDailyCap,
        reasons,
        sampleSize: contacted,
        claimClickRate,
        providerFailureRate,
      };
    }

    if (
      claimClickRate !== null &&
      claimClickRate >= thresholds.increaseClaimClickRate
    ) {
      reasons.push('Claim click rate supports a controlled increase.');
      if ((settings?.rampMode ?? 'manual') === 'manual') {
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

    reasons.push('Performance is inside the hold band.');
    return {
      recommendedAction: 'hold',
      recommendedNextDailyCap: currentDailyCap,
      reasons,
      sampleSize: contacted,
      claimClickRate,
      providerFailureRate,
    };
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
