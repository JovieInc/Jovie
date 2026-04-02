'use client';

import { useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useEnrichmentStatus } from '@/features/dashboard/organisms/release-provider-matrix/hooks/useEnrichmentStatus';
import { useDspEnrichmentStatusQuery } from '@/lib/queries/useDspEnrichmentStatusQuery';
import { useTasksQuery } from '@/lib/queries/useTasksQuery';

export type HeaderActivityTone = 'idle' | 'working' | 'attention';

export interface HeaderActivityStatus {
  readonly tone: HeaderActivityTone;
  readonly label: string;
  readonly detail?: string;
  readonly count?: number;
}

const ACTIVE_AGENT_STATUSES = new Set([
  'queued',
  'drafting',
  'awaiting_review',
]);

export function useAppActivityStatus(): HeaderActivityStatus | null {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';
  const activityEnabled = profileId.length > 0;

  const { data: discoveryStatus } = useDspEnrichmentStatusQuery({
    profileId,
    enabled: activityEnabled,
  });

  const { aggregateStatus } = useEnrichmentStatus({
    enabled: activityEnabled,
  });

  const { data: tasksData } = useTasksQuery(profileId, {
    limit: 25,
  });

  return useMemo(() => {
    if (!activityEnabled) return null;

    const activeAgentCount =
      tasksData?.tasks.filter(task =>
        ACTIVE_AGENT_STATUSES.has(task.agentStatus)
      ).length ?? 0;

    if (activeAgentCount > 0) {
      return {
        tone: 'working',
        label: activeAgentCount === 1 ? 'Agent Running' : 'Agents Running',
        detail:
          activeAgentCount === 1
            ? 'A task agent is actively drafting or waiting for review.'
            : `${activeAgentCount} task agents are actively drafting or waiting for review.`,
        count: activeAgentCount,
      } satisfies HeaderActivityStatus;
    }

    if (aggregateStatus === 'enriching') {
      return {
        tone: 'working',
        label: 'Syncing Music',
        detail: 'Release import or cross-platform enrichment is still running.',
      } satisfies HeaderActivityStatus;
    }

    if (
      discoveryStatus &&
      ['discovering', 'matching', 'enriching'].includes(
        discoveryStatus.overallPhase
      )
    ) {
      return {
        tone: 'working',
        label: 'Discovering Profiles',
        detail: 'Jovie is still matching this profile across platforms.',
      } satisfies HeaderActivityStatus;
    }

    if (
      aggregateStatus === 'failed' ||
      discoveryStatus?.overallPhase === 'failed'
    ) {
      return {
        tone: 'attention',
        label: 'Sync Needs Attention',
        detail:
          'A background import or profile-matching job failed and may need a retry.',
      } satisfies HeaderActivityStatus;
    }

    return null;
  }, [activityEnabled, aggregateStatus, discoveryStatus, tasksData?.tasks]);
}
