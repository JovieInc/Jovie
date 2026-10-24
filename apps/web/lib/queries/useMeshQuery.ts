'use client';

import { useQuery } from '@tanstack/react-query';
import type { MeshReadPayload } from '@/lib/ovie/mesh/types';
import { FREQUENT_CACHE } from './cache-strategies';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export const MESH_ENDPOINT = '/api/admin/mesh';
export const MESH_PING_ENDPOINT = '/api/admin/mesh/ping';

/** Read-only mesh roster for the Ovie Mesh page (JOV-8937). */
export function useMeshReadQuery() {
  return useQuery({
    queryKey: queryKeys.admin.mesh.read(),
    queryFn: ({ signal }) =>
      fetchWithTimeout<MeshReadPayload>(MESH_ENDPOINT, { signal }),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

/** Owner-only mesh ping (server enforces the hourly cap). */
export async function sendMeshPingRequest(agentId: string): Promise<void> {
  await fetchWithTimeout(MESH_PING_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
}

export function getMeshPingErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    if (error.status === 429) {
      return 'Ping cap reached for this agent. Try again later.';
    }
    if (error.status === 503) {
      return 'Mesh endpoint is not configured.';
    }
    if (error.status === 502) {
      return 'Mesh ping could not be delivered.';
    }
    if (error.status === 403 || error.status === 401) {
      return 'Admin access required.';
    }
  }
  return 'Mesh ping failed. Try again.';
}
