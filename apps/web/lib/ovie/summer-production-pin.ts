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

export function resetSummerProductionPinCache(): void {
  cache = null;
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
