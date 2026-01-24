'use client';

/**
 * Version monitor hook - re-exported from TanStack Query implementation.
 *
 * This file provides backwards compatibility for existing imports.
 * The actual implementation now uses TanStack Query for polling.
 *
 * @see {@link @/lib/queries/useBuildInfoQuery} for the implementation.
 */

export {
  type BuildInfo,
  fetchBuildInfo,
  type UseVersionMonitorOptions,
  type UseVersionMonitorResult,
  useBuildInfoQuery,
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/queries/useBuildInfoQuery';
