import {
  isSourceBoundProductionSummer,
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
} from './summer-production-identity';

const DEPRECATED_PIN_NOTICE =
  '::notice::OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN and OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID are deprecated and ignored. Summer is https://summer.jov.ie with a source-bound identity check.';
const MISSING_TOKEN_NOTICE =
  '::notice::SUMMER_PIN_CHECK_VERCEL_TOKEN is absent; skipped Vercel deployment readback after the source-bound identity check passed.';
const PIN_ENV_KEYS = [
  'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
  'OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID',
] as const;
const ACCEPT = {
  headers: { accept: 'application/json' },
  redirect: 'error' as const,
};

export type SummerEvePinCheckInput = {
  token?: string;
  /** Present only so a deprecation notice can be logged. Never requested. */
  deprecatedOrigin?: string;
  /** Present only so a deprecation notice can be logged. Never compared. */
  deprecatedDeploymentId?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
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

export async function checkSummerEvePin(
  input: SummerEvePinCheckInput
): Promise<number> {
  const log = input.log ?? ((line: string) => console.log(line));
  const error = input.error ?? ((line: string) => console.error(line));
  if (
    (input.deprecatedOrigin?.trim() ?? '') !== '' ||
    (input.deprecatedDeploymentId?.trim() ?? '') !== ''
  ) {
    log(DEPRECATED_PIN_NOTICE);
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const fail = (message: string): 1 => {
    error(message);
    return 1;
  };
  const identityUrl = new URL(
    '/runtime/v1/identity',
    SUMMER_PRODUCTION.productionOrigin
  );
  const liveResult = await load(fetchImpl, identityUrl, ACCEPT);
  if ('message' in liveResult) {
    return fail(
      `${SUMMER_PRODUCTION.productionOrigin} runtime identity was unreachable`
    );
  }
  const live = readSummerRuntimeIdentity(liveResult.body);
  if (liveResult.status !== 200 || !isSourceBoundProductionSummer(live)) {
    return fail(
      live
        ? `${SUMMER_PRODUCTION.productionOrigin} is not source-bound production Summer (status ${liveResult.status}, identity ${live.status || 'missing'}, environment ${live.environment}, project ${live.projectId})`
        : `${SUMMER_PRODUCTION.productionOrigin} identity was unreadable (${liveResult.status})`
    );
  }

  const token = input.token?.trim();
  if (!token) {
    log(MISSING_TOKEN_NOTICE);
    return 0;
  }

  const deploymentUrl = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(live.deploymentId)}`
  );
  deploymentUrl.searchParams.set('teamId', SUMMER_PRODUCTION.teamId);
  const deployment = await load(fetchImpl, deploymentUrl, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  if ('message' in deployment) return fail('Vercel deployment lookup failed');
  const record = recordOf(deployment.body);
  if (
    deployment.status !== 200 ||
    record?.projectId !== SUMMER_PRODUCTION.projectId ||
    record?.target !== 'production' ||
    record?.readyState !== 'READY'
  ) {
    return fail(
      `Summer deployment ${live.deploymentId} is not a READY production deployment of ${SUMMER_PRODUCTION.projectId} (status ${deployment.status})`
    );
  }
  return 0;
}

export function readSummerPinEnvFile(contents: string): {
  origin?: string;
  deploymentId?: string;
} {
  const values = new Map<string, string>();
  for (const line of contents.split(/\r?\n/u)) {
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
  envFile?: string;
} {
  const parsed: { envFile?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1];
    if (arg === '--env-file' && next) parsed.envFile = next;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  return parsed;
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = globalThis.fetch,
  readFile?: (path: string) => string
): Promise<number> {
  const args = parseSummerPinCheckArgs(argv);
  if (args.envFile && !readFile) {
    throw new Error('--env-file requires a file reader');
  }
  const fromFile =
    args.envFile && readFile
      ? readSummerPinEnvFile(readFile(args.envFile))
      : {};
  return checkSummerEvePin({
    deprecatedOrigin: env.OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN ?? fromFile.origin,
    deprecatedDeploymentId:
      env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID ?? fromFile.deploymentId,
    token: env.SUMMER_PIN_CHECK_VERCEL_TOKEN,
    fetchImpl,
  });
}
