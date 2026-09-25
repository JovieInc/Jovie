import { readFileSync } from 'node:fs';
import {
  ovieSummerEveDeploymentOriginSchema,
  ovieSummerEveExpectedDeploymentIdSchema,
} from './summer-eve-pin-schema';
import {
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
  type SummerRuntimeIdentity,
} from './summer-production-identity';

const MISSING_TOKEN_NOTICE =
  '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent; skipping the Summer Eve pin check.';

export type SummerEvePinCheckInput = {
  origin?: string;
  deploymentId?: string;
  token?: string;
  strict?: boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  error?: (line: string) => void;
};

type Failure = { message: string };

function defaultLog(line: string): void {
  console.log(line);
}

function defaultWarn(line: string): void {
  console.log(line);
}

function defaultError(line: string): void {
  console.error(line);
}

async function readJson(
  response: Response
): Promise<{ status: number; body: unknown }> {
  const status = response.status;
  try {
    const text = await response.text();
    if (text.length > 64_000) return { status, body: null };
    return { status, body: JSON.parse(text) as unknown };
  } catch {
    return { status, body: null };
  }
}

function requiredPinValue(
  label: string,
  value: string | undefined,
  schema:
    | typeof ovieSummerEveDeploymentOriginSchema
    | typeof ovieSummerEveExpectedDeploymentIdSchema
): { ok: true; value: string } | Failure {
  if (!value || value.trim() === '') {
    return { message: `${label} is required` };
  }
  const parsed = schema.safeParse(value.trim());
  if (!parsed.success || !parsed.data) {
    return { message: `${label} failed the Summer pin schema` };
  }
  return { ok: true, value: parsed.data };
}

function deploymentRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function productionIdentityFailure(
  identity: SummerRuntimeIdentity | null,
  status: number
): string | null {
  if (status === 404) {
    return `${SUMMER_PRODUCTION.productionOrigin} identity returned 404`;
  }
  if (!identity) {
    return `${SUMMER_PRODUCTION.productionOrigin} identity was unreadable (${status})`;
  }
  if (
    identity.id !== SUMMER_PRODUCTION.serviceId ||
    identity.projectId !== SUMMER_PRODUCTION.projectId ||
    identity.environment !== 'production' ||
    identity.blobAuth !== 'oidc'
  ) {
    return `${SUMMER_PRODUCTION.productionOrigin} is not production Summer`;
  }
  return null;
}

/**
 * Validates the Jovie production pin against Vercel and Summer identity.
 * Steps 1–3 fail the process. Drift warns unless `strict` is set.
 * A missing token skips with a notice and exit 0.
 */
export async function checkSummerEvePin(
  input: SummerEvePinCheckInput
): Promise<number> {
  const log = input.log ?? defaultLog;
  const warn = input.warn ?? defaultWarn;
  const error = input.error ?? defaultError;
  const token = input.token?.trim();
  if (!token) {
    log(MISSING_TOKEN_NOTICE);
    return 0;
  }

  const origin = requiredPinValue(
    'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
    input.origin,
    ovieSummerEveDeploymentOriginSchema
  );
  const deploymentId = requiredPinValue(
    'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID',
    input.deploymentId,
    ovieSummerEveExpectedDeploymentIdSchema
  );
  if (!('ok' in origin) || !('ok' in deploymentId)) {
    if (!('ok' in origin)) error(origin.message);
    if (!('ok' in deploymentId)) error(deploymentId.message);
    return 1;
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const deploymentUrl = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId.value)}`
  );
  deploymentUrl.searchParams.set('teamId', SUMMER_PRODUCTION.teamId);

  let deploymentResponse: Response;
  try {
    deploymentResponse = await fetchImpl(deploymentUrl, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
  } catch {
    error('Vercel deployment lookup failed');
    return 1;
  }
  const deploymentPayload = await readJson(deploymentResponse);
  const deployment = deploymentRecord(deploymentPayload.body);
  const deploymentHost =
    typeof deployment?.url === 'string' ? deployment.url : '';
  if (
    deploymentPayload.status !== 200 ||
    deployment?.projectId !== SUMMER_PRODUCTION.projectId ||
    deployment?.target !== 'production' ||
    deployment?.readyState !== 'READY' ||
    `https://${deploymentHost}` !== origin.value
  ) {
    error(
      `Pinned deployment ${deploymentId.value} is not a READY production deployment of ${SUMMER_PRODUCTION.projectId} at ${origin.value} (status ${deploymentPayload.status})`
    );
    return 1;
  }

  let identityResponse: Response;
  try {
    identityResponse = await fetchImpl(
      new URL('/runtime/v1/identity', origin.value),
      { headers: { accept: 'application/json' }, redirect: 'error' }
    );
  } catch {
    error('Pinned runtime identity was unreachable');
    return 1;
  }
  if (identityResponse.status === 404) {
    error(
      `Pinned runtime identity returned 404 for ${deploymentId.value}; the deployment predates /runtime/v1/identity`
    );
    return 1;
  }
  const identityPayload = await readJson(identityResponse);
  const identity = readSummerRuntimeIdentity(identityPayload.body);
  if (
    identityPayload.status !== 200 ||
    !identity ||
    identity.id !== SUMMER_PRODUCTION.serviceId ||
    identity.projectId !== SUMMER_PRODUCTION.projectId ||
    identity.environment !== 'production' ||
    identity.deploymentId !== deploymentId.value ||
    identity.blobAuth !== 'oidc'
  ) {
    error(
      `Pinned runtime identity does not match ${SUMMER_PRODUCTION.serviceId} on ${deploymentId.value} with oidc blob auth (status ${identityPayload.status})`
    );
    return 1;
  }

  let liveResponse: Response;
  try {
    liveResponse = await fetchImpl(
      new URL('/runtime/v1/identity', SUMMER_PRODUCTION.productionOrigin),
      { headers: { accept: 'application/json' }, redirect: 'error' }
    );
  } catch {
    error(
      `${SUMMER_PRODUCTION.productionOrigin} runtime identity was unreachable`
    );
    return 1;
  }
  const livePayload = await readJson(liveResponse);
  const live = readSummerRuntimeIdentity(livePayload.body);
  const liveFailure = productionIdentityFailure(live, livePayload.status);
  if (liveFailure) {
    error(liveFailure);
    return 1;
  }
  if (live && live.deploymentId !== deploymentId.value) {
    const message = `::warning::Summer pin drift: pinned ${deploymentId.value} but ${SUMMER_PRODUCTION.productionOrigin} serves ${live.deploymentId}`;
    warn(message);
    if (input.strict) {
      error(message);
      return 1;
    }
  }
  return 0;
}

const PIN_ENV_KEYS = [
  'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
  'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID',
] as const;

export function readSummerPinEnvFile(path: string): {
  origin?: string;
  deploymentId?: string;
} {
  const values = new Map<string, string>();
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!PIN_ENV_KEYS.includes(key as (typeof PIN_ENV_KEYS)[number])) continue;
    let raw = line.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = JSON.parse(raw) as string;
    }
    if (typeof raw !== 'string') continue;
    values.set(key, raw);
  }
  return {
    origin: values.get('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN'),
    deploymentId: values.get('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID'),
  };
}

export function parseSummerPinCheckArgs(argv: readonly string[]): {
  origin?: string;
  deploymentId?: string;
  strict: boolean;
  envFile?: string;
} {
  let origin: string | undefined;
  let deploymentId: string | undefined;
  let envFile: string | undefined;
  let strict = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    const next = argv[index + 1];
    if (arg === '--origin' && next) {
      origin = next;
      index += 1;
      continue;
    }
    if (arg === '--id' && next) {
      deploymentId = next;
      index += 1;
      continue;
    }
    if (arg === '--env-file' && next) {
      envFile = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ''}`);
  }
  return { origin, deploymentId, strict, envFile };
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<number> {
  const args = parseSummerPinCheckArgs(argv);
  const fromFile = args.envFile ? readSummerPinEnvFile(args.envFile) : {};
  return checkSummerEvePin({
    origin:
      args.origin ?? env.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN ?? fromFile.origin,
    deploymentId:
      args.deploymentId ??
      env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID ??
      fromFile.deploymentId,
    token: env.SUMMER_PIN_CHECK_VERCEL_TOKEN,
    strict: args.strict,
    fetchImpl,
  });
}
