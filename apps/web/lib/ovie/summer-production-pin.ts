import {
  ovieSummerEveDeploymentOriginSchema,
  ovieSummerEveExpectedDeploymentIdSchema,
} from './summer-eve-pin-schema';
import {
  readSummerRuntimeIdentity,
  SUMMER_PRODUCTION,
} from './summer-production-identity';

const PIN_CACHE_TTL_MS = 10 * 60 * 1000;
const IDENTITY_FETCH_TIMEOUT_MS = 5_000;

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

function readConfiguredPin(
  origin: string | undefined,
  deploymentId: string | undefined
) {
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

function isProductionAlias(
  identity: ReturnType<typeof readSummerRuntimeIdentity>
): identity is NonNullable<ReturnType<typeof readSummerRuntimeIdentity>> {
  return (
    identity?.id === SUMMER_PRODUCTION.serviceId &&
    identity.projectId === SUMMER_PRODUCTION.projectId &&
    identity.environment === 'production'
  );
}

/** Alias target after production Summer identity. Stale pins are logged. */
export async function resolveSummerEveCallerOrigin(
  input: {
    pinnedOrigin?: string;
    pinnedDeploymentId?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
    /** Skip the TTL cache and re-read the alias identity once. */
    refresh?: boolean;
  } = {}
): Promise<SummerEveCallerTarget> {
  const pin = readConfiguredPin(input.pinnedOrigin, input.pinnedDeploymentId);
  const now = input.now?.() ?? Date.now();
  const key = `${SUMMER_PRODUCTION.productionOrigin}\n${pin.origin ?? ''}\n${pin.deploymentId ?? ''}`;
  if (!input.refresh && aliasCache?.key === key && aliasCache.expiresAt > now)
    return aliasCache.target;

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const expected = {
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production' as const,
    deploymentId: pin.deploymentId,
  };
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
  if (!response.ok || !isProductionAlias(identity)) {
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
