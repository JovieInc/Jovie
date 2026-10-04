import 'server-only';

import { readFile } from 'node:fs/promises';
import { and, count, sql as drizzleSql, eq, isNotNull } from 'drizzle-orm';
import { getAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { resolveAppPath, resolveMonorepoPath } from '@/lib/filesystem-paths';
import { isInstantlyOutboundEnabled } from '@/lib/leads/outbound-gates';
import { linearGraphql } from '@/lib/ovie/linear-coordination-live';
import { readConfiguredLiveBuild } from '@/lib/ovie/shipping-state/configured.server';
import { getOutboundQueue } from './queue.server';
import {
  buildOutboundReadiness,
  type LinearIssueState,
  type OutboundReadiness,
  parseFunnelTrend,
  READINESS_BLOCKING_ISSUES,
} from './readiness';

const TREND_FILE = ['scripts', 'funnel-judge', 'trend.jsonl'] as const;

/** Deployed builds read the staged copy; local dev reads the repo file. */
async function readFunnelTrend() {
  for (const candidate of [
    resolveAppPath('runtime-data', ...TREND_FILE),
    resolveMonorepoPath(...TREND_FILE),
  ]) {
    try {
      return parseFunnelTrend(
        await readFile(/* turbopackIgnore: true */ candidate, 'utf8')
      );
    } catch {
      // Try the next location.
    }
  }
  return null;
}

async function readLinear(): Promise<{
  issues: Map<string, LinearIssueState>;
  openChildren: number;
}> {
  const aliases = READINESS_BLOCKING_ISSUES.map(
    (spec, index) =>
      `i${index}: issue(id: "${spec.id}") { identifier title url state { name type } }`
  ).join('\n');
  const data = await linearGraphql<
    Record<
      string,
      {
        identifier: string;
        title: string;
        url: string;
        state: { name: string; type: string };
      }
    > & {
      loop: { children: { nodes: { identifier: string }[] } };
    }
  >(
    `query OutboundReadiness {
      ${aliases}
      loop: issue(id: "JOV-7415") {
        children(first: 250, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
          nodes { identifier }
        }
      }
    }`,
    {}
  );
  const issues = new Map<string, LinearIssueState>();
  READINESS_BLOCKING_ISSUES.forEach((spec, index) => {
    const issue = data[`i${index}`] as
      | {
          identifier: string;
          title: string;
          url: string;
          state: { name: string; type: string };
        }
      | undefined;
    if (issue)
      issues.set(spec.id, {
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        stateName: issue.state.name,
        stateType: issue.state.type,
      });
  });
  return { issues, openChildren: data.loop.children.nodes.length };
}

async function readProduction() {
  const read = await readConfiguredLiveBuild();
  const production = read.status === 'ok' ? read.delivery?.production : null;
  if (!production) return null;
  return {
    sha: production.sha,
    deployedAt: production.deployedAt,
    behindMain: production.behindMain.value,
  };
}

async function readEvidence() {
  const [row] = await db
    .select({
      built: count(),
      covered: drizzleSql<number>`count(*) filter (where exists (select 1 from dsp_artist_matches d where d.creator_profile_id = ${leads.creatorProfileId}) or exists (select 1 from profile_surfaces s where s.creator_profile_id = ${leads.creatorProfileId} and s.retired_at is null and s.kind <> 'jovie') or exists (select 1 from discog_releases r where r.creator_profile_id = ${leads.creatorProfileId}))`,
    })
    .from(leads)
    .where(isNotNull(leads.creatorProfileId));
  return { built: Number(row?.built ?? 0), covered: Number(row?.covered ?? 0) };
}

async function readSendPath() {
  const [[settings], [pending]] = await Promise.all([
    db
      .select({
        enabled: leadPipelineSettings.enabled,
        dailySendCap: leadPipelineSettings.dailySendCap,
      })
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1),
    db
      .select({ total: count() })
      .from(leads)
      .where(
        and(eq(leads.outreachStatus, 'pending'), isNotNull(leads.claimToken))
      ),
  ]);
  return {
    pipelineEnabled: settings?.enabled === true,
    instantlyEnabled: isInstantlyOutboundEnabled(),
    instantlyConfigured: Boolean(
      process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_CAMPAIGN_ID
    ),
    pendingRouted: Number(pending?.total ?? 0),
    dailySendCap: settings?.dailySendCap ?? 10,
  };
}

/** Each source fails independently into `unknown`, never into green. */
export async function getOutboundReadiness(
  now = new Date()
): Promise<OutboundReadiness> {
  const settle = <T>(promise: Promise<T>) =>
    promise.then(
      value => value,
      () => null
    );
  const [cone, queue, evidence, sendPath, linear, funnel, production] =
    await Promise.all([
      settle(getAcquisitionEligibility()),
      settle(getOutboundQueue(now)),
      settle(readEvidence()),
      settle(readSendPath()),
      settle(readLinear()),
      readFunnelTrend(),
      settle(readProduction()),
    ]);
  return buildOutboundReadiness({
    now,
    cone,
    funnel,
    queue: queue
      ? {
          ready: queue.counts.ready,
          certified: queue.counts.certified,
          approved: queue.counts.approved,
          needsProfile: queue.rows.filter(
            row => row.nextAction === 'build_profile'
          ).length,
        }
      : null,
    evidence,
    sendPath,
    production,
    issues: linear?.issues ?? null,
    openGrowthLoopChildren: linear?.openChildren ?? null,
  });
}
