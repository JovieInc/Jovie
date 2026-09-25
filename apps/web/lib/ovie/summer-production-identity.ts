/**
 * Production Summer identity. The Vercel display name `jovie-eve-shadow` is
 * legacy; callers must use `projectId`. The caller origin is the stable
 * production domain. A deployment id is observed identity, never a pin.
 */
export const SUMMER_PRODUCTION = {
  teamId: 'team_bpNDbti6srVLYPKdmQLu4UgT',
  projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
  productionOrigin: 'https://summer.jov.ie',
  serviceId: 'company.summer',
  identitySchema: 'jovie.service-identity/v1',
  sourceBoundStatus: 'source-bound',
} as const;

const SOURCE_REVISION = /^[0-9a-f]{40}$/u;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/u;

export type SummerRuntimeIdentity = {
  schema: string;
  id: string;
  projectId: string;
  teamId: string;
  environment: string;
  deploymentId: string;
  blobAuth: string;
  status: string;
  sourceRevision: string;
  productionOrigin: string;
  /** Vercel deployment target when the identity document includes one. */
  target: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : null;
}

function readOptionalString(value: unknown): string {
  return readString(value) ?? '';
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
  if (!id || !projectId || !environment || !deploymentId) return null;
  return {
    schema: readOptionalString(record.schema),
    id,
    projectId,
    teamId: readOptionalString(record.teamId),
    environment,
    deploymentId,
    blobAuth: readOptionalString(record.blobAuth),
    status: readOptionalString(record.status),
    sourceRevision: readOptionalString(record.sourceRevision),
    productionOrigin: readOptionalString(record.productionOrigin),
    target: readString(record.target),
  };
}

/**
 * Genuine production Summer. `environment` is the runtime target. An explicit
 * `target` must also be production. Deployment id format is checked; its value
 * is not compared to a configured pin.
 */
export function isSourceBoundProductionSummer(
  identity: SummerRuntimeIdentity | null
): identity is SummerRuntimeIdentity {
  if (!identity) return false;
  if (identity.target !== null && identity.target !== 'production')
    return false;
  return (
    identity.schema === SUMMER_PRODUCTION.identitySchema &&
    identity.id === SUMMER_PRODUCTION.serviceId &&
    identity.projectId === SUMMER_PRODUCTION.projectId &&
    identity.teamId === SUMMER_PRODUCTION.teamId &&
    identity.environment === 'production' &&
    identity.status === SUMMER_PRODUCTION.sourceBoundStatus &&
    identity.productionOrigin === SUMMER_PRODUCTION.productionOrigin &&
    identity.blobAuth === 'oidc' &&
    SOURCE_REVISION.test(identity.sourceRevision) &&
    DEPLOYMENT_ID.test(identity.deploymentId)
  );
}
