interface DiscoveryJobLike {
  readonly status: string;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

export const ACTIVE_DISCOVERY_JOB_TTL_MS = 10 * 60 * 1000;

export function isActiveDiscoveryJob(
  job: DiscoveryJobLike | undefined,
  latestMatchUpdatedAt: Date | null,
  hasOnlyTerminalStates: boolean
): boolean {
  if (!job) {
    return false;
  }

  const isPendingStatus =
    job.status === 'pending' || job.status === 'processing';
  if (!isPendingStatus) {
    return false;
  }

  const lastHeartbeat = job.updatedAt ?? job.createdAt;
  if (
    lastHeartbeat &&
    Date.now() - lastHeartbeat.getTime() > ACTIVE_DISCOVERY_JOB_TTL_MS
  ) {
    return false;
  }

  if (
    hasOnlyTerminalStates &&
    latestMatchUpdatedAt &&
    lastHeartbeat &&
    latestMatchUpdatedAt.getTime() >= lastHeartbeat.getTime()
  ) {
    return false;
  }

  return true;
}
