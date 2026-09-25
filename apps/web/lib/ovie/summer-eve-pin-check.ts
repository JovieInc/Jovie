import { readFileSync } from 'node:fs';
import {
  ovieSummerEveDeploymentOriginSchema,
  ovieSummerEveExpectedDeploymentIdSchema,
} from './summer-eve-pin-schema';
import {
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
} from './summer-production-identity';

const MISSING_TOKEN_NOTICE =
  '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent; skipping the Summer Eve pin check.';
const PIN_ENV_KEYS = [
  'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
  'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID',
] as const;
const ACCEPT = {
  headers: { accept: 'application/json' },
  redirect: 'error' as const,
};

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
type JsonResult = { status: number; body: unknown };

async function readJson(response: Response): Promise<JsonResult> {
  const status = response.status;
  try {
    const text = await response.text();
    if (text.length > 64_000) return { status, body: null };
    return { status, body: JSON.parse(text) as unknown };
  } catch {
    return { status, body: null };
  }
}

function requiredPin(
  label: string,
  value: string | undefined,
  schema:
    | typeof ovieSummerEveDeploymentOriginSchema
    | typeof ovieSummerEveExpectedDeploymentIdSchema
): { ok: true; value: string } | Failure {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { message: `${label} is required` };
  const parsed = schema.safeParse(trimmed);
  if (!parsed.success || !parsed.data) {
    return { message: `${label} failed the Summer pin schema` };
  }
  return { ok: true, value: parsed.data };
}

function recordOf(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

async function load(
  fetchImpl: typeof fetch,
  url: URL,
  init?: RequestInit
): Promise<JsonResult | Failure> {
  try {
    return await readJson(await fetchImpl(url, init));
  } catch {
    return { message: 'unreachable' };
  }
}

function matchesProductionSummer(
  identity: ReturnType<typeof readSummerRuntimeIdentity>,
  status: number
): string | null {
  const origin = SUMMER_PRODUCTION.productionOrigin;
  if (status === 404) return `${origin} identity returned 404`;
  const ok =
    status === 200 &&
    identity?.id === SUMMER_PRODUCTION.serviceId &&
    identity.projectId === SUMMER_PRODUCTION.projectId &&
    identity.environment === 'production' &&
    identity.blobAuth === 'oidc';
  if (ok) return null;
  return identity
    ? `${origin} is not production Summer`
    : `${origin} identity was unreadable (${status})`;
}

export async function checkSummerEvePin(
  input: SummerEvePinCheckInput
): Promise<number> {
  const log = input.log ?? ((line: string) => console.log(line));
  const warn = input.warn ?? log;
  const error = input.error ?? ((line: string) => console.error(line));
  const token = input.token?.trim();
  if (!token) {
    log(MISSING_TOKEN_NOTICE);
    return 0;
  }

  const origin = requiredPin(
    'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
    input.origin,
    ovieSummerEveDeploymentOriginSchema
  );
  const deploymentId = requiredPin(
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
  const fail = (message: string): 1 => {
    error(message);
    return 1;
  };
  const deploymentUrl = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId.value)}`
  );
  deploymentUrl.searchParams.set('teamId', SUMMER_PRODUCTION.teamId);
  const deployment = await load(fetchImpl, deploymentUrl, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  if ('message' in deployment) return fail('Vercel deployment lookup failed');
  const record = recordOf(deployment.body);
  const host = typeof record?.url === 'string' ? record.url : '';
  if (
    deployment.status !== 200 ||
    record?.projectId !== SUMMER_PRODUCTION.projectId ||
    record?.target !== 'production' ||
    record?.readyState !== 'READY' ||
    `https://${host}` !== origin.value
  ) {
    return fail(
      `Pinned deployment ${deploymentId.value} is not a READY production deployment of ${SUMMER_PRODUCTION.projectId} at ${origin.value} (status ${deployment.status})`
    );
  }

  const pinned = await load(
    fetchImpl,
    new URL('/runtime/v1/identity', origin.value),
    ACCEPT
  );
  if ('message' in pinned)
    return fail('Pinned runtime identity was unreachable');
  if (pinned.status === 404) {
    return fail(
      `Pinned runtime identity returned 404 for ${deploymentId.value}; the deployment predates /runtime/v1/identity`
    );
  }
  const identity = readSummerRuntimeIdentity(pinned.body);
  if (
    pinned.status !== 200 ||
    !identity ||
    identity.id !== SUMMER_PRODUCTION.serviceId ||
    identity.projectId !== SUMMER_PRODUCTION.projectId ||
    identity.environment !== 'production' ||
    identity.deploymentId !== deploymentId.value ||
    identity.blobAuth !== 'oidc'
  ) {
    return fail(
      `Pinned runtime identity does not match ${SUMMER_PRODUCTION.serviceId} on ${deploymentId.value} with oidc blob auth (status ${pinned.status})`
    );
  }

  const liveResult = await load(
    fetchImpl,
    new URL('/runtime/v1/identity', SUMMER_PRODUCTION.productionOrigin),
    ACCEPT
  );
  if ('message' in liveResult) {
    return fail(
      `${SUMMER_PRODUCTION.productionOrigin} runtime identity was unreachable`
    );
  }
  const live = readSummerRuntimeIdentity(liveResult.body);
  const liveFailure = matchesProductionSummer(live, liveResult.status);
  if (liveFailure) return fail(liveFailure);
  if (live && live.deploymentId !== deploymentId.value) {
    const message = `::warning::Summer pin drift: pinned ${deploymentId.value} but ${SUMMER_PRODUCTION.productionOrigin} serves ${live.deploymentId}`;
    warn(message);
    if (input.strict) return fail(message);
  }
  return 0;
}

export function readSummerPinEnvFile(path: string): {
  origin?: string;
  deploymentId?: string;
} {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!PIN_ENV_KEYS.includes(key as (typeof PIN_ENV_KEYS)[number])) continue;
    let raw = line.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"'))
      raw = JSON.parse(raw) as string;
    if (typeof raw === 'string') values.set(key, raw);
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
  const parsed: {
    origin?: string;
    deploymentId?: string;
    strict: boolean;
    envFile?: string;
  } = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1];
    if (arg === '--strict') parsed.strict = true;
    else if (arg === '--origin' && next) parsed.origin = next;
    else if (arg === '--id' && next) parsed.deploymentId = next;
    else if (arg === '--env-file' && next) parsed.envFile = next;
    else throw new Error(`Unknown argument: ${arg}`);
    if (arg !== '--strict') index += 1;
  }
  return parsed;
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
