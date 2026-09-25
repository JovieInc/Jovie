import {
  ovieSummerEveDeploymentOriginSchema,
  ovieSummerEveExpectedDeploymentIdSchema,
} from './summer-eve-pin-schema';
import {
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
} from './summer-production-identity';

const PIN_CACHE_TTL_MS = 10 * 60 * 1000;

export type SummerPinExpectation = {
  projectId: string;
  environment: 'production';
  deploymentId: string | null;
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

type CacheEntry = { key: string; expiresAt: number };

let cache: CacheEntry | null = null;

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
  cache = null;
  aliasCache = null;
}

function expectation(deploymentId: string | null): SummerPinExpectation {
  return {
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId,
  };
}

/**
 * Next production builds strip `console.*`. Stderr keeps the same record in
 * Vercel runtime logs.
 */
export function logSummerBridgeEvent(
  entry: Readonly<Record<string, unknown>>
): void {
  console.error(entry);
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

function rejectPin(
  expected: SummerPinExpectation,
  observed: Readonly<Record<string, unknown>>
): never {
  logSummerBridgeEvent({
    event: 'summer_pin_invalid',
    expected,
    observed,
  });
  throw new SummerPinInvalidError(expected, observed);
}

async function readIdentityResponse(
  response: Response
): Promise<{ status: number; body: unknown }> {
  const status = response.status;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 8192) {
    return { status, body: null };
  }
  try {
    const text = await response.text();
    if (text.length > 8192) return { status, body: null };
    return { status, body: JSON.parse(text) as unknown };
  } catch {
    return { status, body: null };
  }
}

/**
 * Confirms the pinned origin is this process's production Summer deployment.
 * Successful results are reused for 10 minutes. Failures are not cached.
 * `blobAuth` is enforced by `check:summer-eve-pin`; a 404 or a
 * project/environment/deployment mismatch fails closed here.
 */
export async function assertSummerProductionPin(input: {
  origin: string;
  deploymentId: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<void> {
  const origin = ovieSummerEveDeploymentOriginSchema.safeParse(input.origin);
  const deploymentId = ovieSummerEveExpectedDeploymentIdSchema.safeParse(
    input.deploymentId
  );
  const expected = expectation(
    deploymentId.success && deploymentId.data ? deploymentId.data : null
  );
  if (!origin.success || !origin.data || !expected.deploymentId) {
    rejectPin(expected, { reason: 'pin_failed_schema' });
  }
  const pinnedOrigin = origin.data;
  const pinnedId = expected.deploymentId;
  const key = `${pinnedOrigin}\n${pinnedId}`;
  const now = input.now?.() ?? Date.now();
  if (cache?.key === key && cache.expiresAt > now) return;

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(new URL('/runtime/v1/identity', pinnedOrigin), {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
  } catch {
    rejectPin(expected, { error: 'identity_unreachable' });
  }

  if (response.status === 404) {
    rejectPin(expected, { status: 404 });
  }

  const payload = await readIdentityResponse(response);
  const identity = readSummerRuntimeIdentity(payload.body);
  const matches =
    response.ok &&
    identity?.projectId === expected.projectId &&
    identity.environment === expected.environment &&
    identity.deploymentId === pinnedId;
  if (!matches || !identity) {
    rejectPin(expected, {
      status: response.status,
      ...(identity
        ? {
            projectId: identity.projectId,
            environment: identity.environment,
            deploymentId: identity.deploymentId,
          }
        : {}),
    });
  }

  cache = { key, expiresAt: now + PIN_CACHE_TTL_MS };
}

function readConfiguredPin(
  origin: string | undefined,
  deploymentId: string | undefined
): {
  present: boolean;
  origin: string | null;
  deploymentId: string | null;
} {
  const originText = origin?.trim() ?? '';
  const idText = deploymentId?.trim() ?? '';
  const parsedOrigin = ovieSummerEveDeploymentOriginSchema.safeParse(
    originText.length > 0 ? originText : undefined
  );
  const parsedId = ovieSummerEveExpectedDeploymentIdSchema.safeParse(
    idText.length > 0 ? idText : undefined
  );
  return {
    present: originText.length > 0 || idText.length > 0,
    origin:
      parsedOrigin.success && parsedOrigin.data ? parsedOrigin.data : null,
    deploymentId: parsedId.success && parsedId.data ? parsedId.data : null,
  };
}

function productionAliasIdentity(
  identity: ReturnType<typeof readSummerRuntimeIdentity>
): identity is NonNullable<ReturnType<typeof readSummerRuntimeIdentity>> {
  return (
    identity?.id === SUMMER_PRODUCTION.serviceId &&
    identity.projectId === SUMMER_PRODUCTION.projectId &&
    identity.environment === 'production'
  );
}

/**
 * Caller target for production Summer. The stable alias is the default.
 * A configured exact pin is checked against that alias: a match is silent,
 * and a stale or malformed pin logs `summer_pin_invalid` and still returns
 * the alias. The alias itself must be production Summer; that failure is
 * not cached and still throws.
 */
export async function resolveSummerEveCallerOrigin(
  input: {
    pinnedOrigin?: string;
    pinnedDeploymentId?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {}
): Promise<SummerEveCallerTarget> {
  const pin = readConfiguredPin(input.pinnedOrigin, input.pinnedDeploymentId);
  const now = input.now?.() ?? Date.now();
  const key = `${SUMMER_PRODUCTION.productionOrigin}\n${pin.origin ?? ''}\n${pin.deploymentId ?? ''}`;
  if (aliasCache?.key === key && aliasCache.expiresAt > now) {
    return aliasCache.target;
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const expected = expectation(pin.deploymentId);
  let response: Response;
  try {
    response = await fetchImpl(
      new URL('/runtime/v1/identity', SUMMER_PRODUCTION.productionOrigin),
      {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
      }
    );
  } catch {
    rejectPin(expected, { error: 'identity_unreachable' });
  }
  if (response.status === 404) {
    rejectPin(expected, { status: 404 });
  }

  const payload = await readIdentityResponse(response);
  const identity = readSummerRuntimeIdentity(payload.body);
  if (!response.ok || !productionAliasIdentity(identity)) {
    rejectPin(expected, {
      status: response.status,
      ...(identity
        ? {
            projectId: identity.projectId,
            environment: identity.environment,
            deploymentId: identity.deploymentId,
          }
        : {}),
    });
  }

  const configuredOrigin = input.pinnedOrigin?.trim() ?? '';
  const pinMatches =
    pin.present &&
    pin.deploymentId === identity.deploymentId &&
    (configuredOrigin.length === 0 || pin.origin !== null);
  if (pin.present && !pinMatches) {
    logSummerBridgeEvent({
      event: 'summer_pin_invalid',
      expected: {
        projectId: SUMMER_PRODUCTION.projectId,
        environment: 'production',
        deploymentId: pin.deploymentId,
        origin: pin.origin,
      },
      observed: {
        origin: SUMMER_PRODUCTION.productionOrigin,
        projectId: identity.projectId,
        environment: identity.environment,
        deploymentId: identity.deploymentId,
        fallback: 'production_alias',
      },
    });
  }

  const target: SummerEveCallerTarget = {
    origin: SUMMER_PRODUCTION.productionOrigin,
    deploymentId: identity.deploymentId,
  };
  aliasCache = { key, expiresAt: now + PIN_CACHE_TTL_MS, target };
  return target;
}
