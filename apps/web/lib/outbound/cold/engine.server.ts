import 'server-only';

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { contactDedupeKey } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { contactEvidenceReviews } from '@/lib/db/schema/contacts';
import {
  leadFunnelEvents,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { denyAudienceEffect } from '@/lib/outbound/audience-effect-policy';
import { outboundCopyEvidenceKey } from '../approval';
import { isPlausibleMailingAddress } from './compliance';
import {
  CONTROLLER_BLOCKER_LABELS,
  type ControllerPlan,
  planColdSends,
} from './controller';
import { readDogfoodGates } from './dogfood-gate.server';
import { COLD_TEMPLATE_VERSION } from './draft';
import {
  type AutoApproveVerdict,
  evaluateAutoApprove,
  mineStyleGuide,
  type SegmentLearning,
  type StyleGuide,
  summarizeAll,
} from './edit-learning';
import {
  coldSegmentKey,
  type FunnelRecord,
  type SegmentFunnel,
  summarizeFunnels,
} from './funnel';
import { readOutboundEditPairs } from './learning.server';

/**
 * One read of the outreach engine for Ovie and Summer: learning metrics and
 * the auto-approve verdict per segment, the send controller's plan, and the
 * funnel with stage dwell per segment. Contains no recipient data.
 */
export interface OutreachEngineStatus {
  readonly schema: 'outreach-engine/v1';
  readonly generatedAt: string;
  readonly learning: readonly SegmentLearning[];
  readonly autoApprove: readonly AutoApproveVerdict[];
  readonly styleGuide: StyleGuide;
  readonly controller: ControllerPlan & {
    readonly blockerLabels: readonly string[];
  };
  readonly funnel: readonly SegmentFunnel[];
}

/** Gates read from configuration. Sending stays closed until all are open. */
function readGates(
  env: Record<string, string | undefined>,
  enabled: boolean,
  onboardingDogfoodPassed: boolean
) {
  // EMAIL_STREAM_COLD_DOMAIN is owned by the stream registry
  // (lib/email/streams.ts, #23585). The core-domain rule below matches it.
  const coldDomain = env.EMAIL_STREAM_COLD_DOMAIN?.trim().toLowerCase() || null;
  const onCore =
    coldDomain !== null &&
    (coldDomain === 'jov.ie' || coldDomain.endsWith('.jov.ie'));
  return {
    coldDomainConfigured: coldDomain !== null,
    coldDomainOnCore: onCore,
    mailingAddressSet: isPlausibleMailingAddress(
      env.OUTREACH_MAILING_ADDRESS ?? null
    ),
    // No cold provider adapter exists yet; Instantly enrollment is refused.
    providerConfigured: false,
    dispatchAllowed: denyAudienceEffect('audience.email.send').dispatchAllowed,
    globalPause: !enabled,
    onboardingDogfoodPassed,
  };
}

const REPLY_EVENTS = ['replied', 'email_replied', 'dm_replied'];
const OPEN_EVENTS = ['email_opened', 'opened'];

async function readFunnelRecords(now: Date): Promise<FunnelRecord[]> {
  const rows = await db
    .select({
      id: leads.id,
      linktreeHandle: leads.linktreeHandle,
      contactEmail: leads.contactEmail,
      latestReleaseDate: leads.latestReleaseDate,
      createdAt: leads.createdAt,
      ingestedAt: leads.ingestedAt,
      firstContactedAt: leads.firstContactedAt,
      signupAt: leads.signupAt,
      paidAt: leads.paidAt,
    })
    .from(leads)
    .where(notInArray(leads.status, ['discovered', 'disqualified']))
    .limit(2000);
  if (rows.length === 0) return [];
  const ids = rows.map(row => row.id);
  const keyByLead = new Map(
    rows.map(row => [
      row.id,
      contactDedupeKey({ email: row.contactEmail, handle: row.linktreeHandle }),
    ])
  );
  const keys = [...keyByLead.values()].filter((k): k is string => k !== null);
  const [certs, approvals, events] = await Promise.all([
    keys.length
      ? db
          .select({
            dedupeKey: contactEvidenceReviews.dedupeKey,
            at: contactEvidenceReviews.createdAt,
          })
          .from(contactEvidenceReviews)
          .where(
            and(
              inArray(contactEvidenceReviews.dedupeKey, keys),
              eq(contactEvidenceReviews.evidenceKey, 'profile:certification')
            )
          )
      : Promise.resolve([]),
    db
      .select({
        key: contactEvidenceReviews.evidenceKey,
        at: contactEvidenceReviews.createdAt,
      })
      .from(contactEvidenceReviews)
      .where(
        and(
          inArray(
            contactEvidenceReviews.evidenceKey,
            ids.map(outboundCopyEvidenceKey)
          ),
          eq(contactEvidenceReviews.decision, 'yes')
        )
      ),
    db
      .select({
        leadId: leadFunnelEvents.leadId,
        type: leadFunnelEvents.eventType,
        at: leadFunnelEvents.occurredAt,
      })
      .from(leadFunnelEvents)
      .where(
        and(
          inArray(leadFunnelEvents.leadId, ids),
          inArray(leadFunnelEvents.eventType, [
            ...REPLY_EVENTS,
            ...OPEN_EVENTS,
            'activated',
          ])
        )
      ),
  ]);
  const earliest = (map: Map<string, Date>, key: string, at: Date) => {
    const seen = map.get(key);
    if (!seen || at < seen) map.set(key, at);
  };
  const certifiedAt = new Map<string, Date>();
  for (const row of certs) earliest(certifiedAt, row.dedupeKey, row.at);
  const approvedAt = new Map<string, Date>();
  for (const row of approvals)
    earliest(approvedAt, row.key.split(':').at(-1) ?? '', row.at);
  const repliedAt = new Map<string, Date>();
  const openedAt = new Map<string, Date>();
  const activatedAt = new Map<string, Date>();
  for (const row of events) {
    if (REPLY_EVENTS.includes(row.type))
      earliest(repliedAt, row.leadId, row.at);
    else if (OPEN_EVENTS.includes(row.type))
      earliest(openedAt, row.leadId, row.at);
    else earliest(activatedAt, row.leadId, row.at);
  }
  return rows.map(row => {
    const key = keyByLead.get(row.id);
    const certified = key ? certifiedAt.get(key) : undefined;
    const recent =
      row.latestReleaseDate !== null &&
      now.getTime() - row.latestReleaseDate.getTime() < 90 * 86_400_000;
    return {
      leadId: row.id,
      segment: coldSegmentKey({
        channel: row.contactEmail ? 'email' : 'dm',
        recentRelease: recent,
      }),
      stages: {
        prospected: row.createdAt,
        built: row.ingestedAt ?? undefined,
        certified,
        // The machine draft is composed when the artifact is certified.
        drafted: certified,
        approved: approvedAt.get(row.id),
        sent: row.firstContactedAt ?? undefined,
        opened: openedAt.get(row.id),
        replied: repliedAt.get(row.id),
        claimed: row.signupAt ?? undefined,
        activated: activatedAt.get(row.id),
        paid: row.paidAt ?? undefined,
      },
    };
  });
}

export async function loadOutreachEngineStatus(
  now = new Date(),
  env: Record<string, string | undefined> = process.env
): Promise<OutreachEngineStatus> {
  const [pairs, settingsRows, funnelRecords, dogfood] = await Promise.all([
    readOutboundEditPairs(),
    db
      .select({
        enabled: leadPipelineSettings.enabled,
        dailySendCap: leadPipelineSettings.dailySendCap,
      })
      .from(leadPipelineSettings)
      .limit(1),
    readFunnelRecords(now),
    readDogfoodGates([], now),
  ]);
  const settings = settingsRows[0] ?? { enabled: false, dailySendCap: 10 };
  const learning = summarizeAll(pairs);
  // No cold stream has sent yet, so deliverability is unknown and every
  // segment stays in review. The cold-stream outcome reader replaces this.
  const health = { sent: 0, bounceRate: null, complaintRate: null };
  const autoApprove = learning.map(segment =>
    evaluateAutoApprove({
      learning: segment,
      health,
      killSwitch: !settings.enabled,
      currentTemplateVersion: COLD_TEMPLATE_VERSION,
    })
  );
  const plan = planColdSends({
    gates: readGates(env, settings.enabled, dogfood.onboarding.passed),
    inboxes: [],
    dialTarget: settings.dailySendCap,
    now,
  });
  return {
    schema: 'outreach-engine/v1',
    generatedAt: now.toISOString(),
    learning,
    autoApprove,
    styleGuide: mineStyleGuide(pairs),
    controller: {
      ...plan,
      blockerLabels: plan.blockers.map(
        blocker => CONTROLLER_BLOCKER_LABELS[blocker]
      ),
    },
    funnel: summarizeFunnels(funnelRecords),
  };
}
