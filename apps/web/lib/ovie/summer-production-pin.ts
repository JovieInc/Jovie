import {
  isSourceBoundProductionSummer,
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
} from './summer-production-identity';

const PIN_CACHE_TTL_MS = 10 * 60 * 1000;
const IDENTITY_FETCH_TIMEOUT_MS = 5_000;

export type SummerPinExpectation = {
  origin: typeof SUMMER_PRODUCTION.productionOrigin;
  projectId: typeof SUMMER_PRODUCTION.projectId;
  environment: 'production';
  status: 'source-bound';
};

export class SummerPinInvalidError extends Error {
  readonly code = 'summer_pin_invalid' as const;

  constructor(
    readonly expected: SummerPinExpectation,
    readonly observed: Readonly<Record<string, unknown>>
  ) {
    super('summer_pin_invalid');
    this.name = 'SummerPinInvalidError';
  }
}

export type SummerEveCallerTarget = {
  origin: typeof SUMMER_PRODUCTION.productionOrigin;
  deploymentId: string;
};

type AliasCacheEntry = {
  key: string;
  expiresAt: number;
  target: SummerEveCallerTarget;
};

let aliasCache: AliasCacheEntry | null = null;

export function resetSummerProductionPinCache(): void {
  aliasCache = null;
}

/** Next production builds strip `console.*`. Stderr keeps the Vercel log. */
export function logSummerBridgeEvent(
  entry: Readonly<Record<string, unknown>>
): void {
  console.error(entry);
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

function expectation(): SummerPinExpectation {
  return {
    origin: SUMMER_PRODUCTION.productionOrigin,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    status: 'source-bound',
  };
}

function rejectPin(
  expected: SummerPinExpectation,
  observed: Readonly<Record<string, unknown>>
): never {
  logSummerBridgeEvent({ event: 'summer_pin_invalid', expected, observed });
  throw new SummerPinInvalidError(expected, observed);
}

async function readIdentityResponse(
  response: Response
): Promise<{ status: number; body: unknown }> {
  const status = response.status;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 8192)
    return { status, body: null };
  try {
    const text = await response.text();
    if (text.length > 8192) return { status, body: null };
    return { status, body: JSON.parse(text) as unknown };
  } catch {
    return { status, body: null };
  }
}

/**
 * Production Summer after a source-bound identity check. The only origin is
 * `https://summer.jov.ie`. A mismatch or transport error fails closed.
 * Configured deployment pins are not read and are not a fallback.
 */
export async function resolveSummerEveCallerOrigin(
  input: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    /** Skip the TTL cache and re-read the alias identity once. */
    refresh?: boolean;
  } = {}
): Promise<SummerEveCallerTarget> {
  const now = input.now?.() ?? Date.now();
  const key = SUMMER_PRODUCTION.productionOrigin;
  if (!input.refresh && aliasCache?.key === key && aliasCache.expiresAt > now)
    return aliasCache.target;

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const expected = expectation();
  let response: Response;
  try {
    response = await fetchImpl(
      new URL('/runtime/v1/identity', SUMMER_PRODUCTION.productionOrigin),
      {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(IDENTITY_FETCH_TIMEOUT_MS),
      }
    );
  } catch {
    rejectPin(expected, { error: 'identity_unreachable' });
  }
  if (response.status === 404) rejectPin(expected, { status: 404 });

  const payload = await readIdentityResponse(response);
  const identity = readSummerRuntimeIdentity(payload.body);
  if (!response.ok || !isSourceBoundProductionSummer(identity)) {
    rejectPin(expected, {
      status: response.status,
      ...(identity
        ? {
            schema: identity.schema,
            projectId: identity.projectId,
            teamId: identity.teamId,
            environment: identity.environment,
            target: identity.target,
            status: identity.status,
            sourceRevision: identity.sourceRevision,
            productionOrigin: identity.productionOrigin,
            deploymentId: identity.deploymentId,
            blobAuth: identity.blobAuth,
          }
        : {}),
    });
  }

  const target: SummerEveCallerTarget = {
    origin: SUMMER_PRODUCTION.productionOrigin,
    deploymentId: identity.deploymentId,
  };
  aliasCache = { key, expiresAt: now + PIN_CACHE_TTL_MS, target };
  return target;
}
