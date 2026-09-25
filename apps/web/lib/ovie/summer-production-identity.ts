/**
 * Production Summer identity. The Vercel display name `jovie-eve-shadow` is
 * legacy; callers must use `projectId`.
 */
export const SUMMER_PRODUCTION = {
  teamId: 'team_bpNDbti6srVLYPKdmQLu4UgT',
  projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
  productionOrigin: 'https://summer.jov.ie',
  serviceId: 'company.summer',
} as const;

export type SummerRuntimeIdentity = {
  id: string;
  projectId: string;
  environment: string;
  deploymentId: string;
  blobAuth: string;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : null;
}

/** Public `GET /runtime/v1/identity` body. Extra fields are ignored. */
export function readSummerRuntimeIdentity(
  body: unknown
): SummerRuntimeIdentity | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const id = readString(record.id);
  const projectId = readString(record.projectId);
  const environment = readString(record.environment);
  const deploymentId = readString(record.deploymentId);
  const blobAuth = readString(record.blobAuth);
  if (!id || !projectId || !environment || !deploymentId || !blobAuth) {
    return null;
  }
  return { id, projectId, environment, deploymentId, blobAuth };
}
