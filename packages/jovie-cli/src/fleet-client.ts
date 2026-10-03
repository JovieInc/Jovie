import {
  JovieInputError,
  JovieRequestError,
  normalizeBaseUrl,
  parseRetryAfterSeconds,
  type ResourceOptions,
  readResponseBody,
} from './client.js';

/** Internal worker credentials are supplied ephemerally, never saved or flags. */
export async function invokeFleetAction(
  id: string,
  input: {
    profile: string;
    key: string;
    value: string;
    channel: 'cli' | 'mcp';
    version: string;
  },
  options: ResourceOptions
): Promise<unknown> {
  const token = options.workerToken;
  if (
    !token ||
    !/^jwf\.[a-f0-9-]{36}\.[a-z][a-z0-9-]{2,63}\.[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new JovieInputError(
      'A scoped JOVIE_WORKER_TOKEN is required for fleet commands.'
    );
  if (
    !/^[a-f0-9-]{36}$/.test(input.profile) ||
    token.split('.')[1] !== input.profile
  )
    throw new JovieInputError('Worker profile does not match the credential.');
  if (input.key.length < 8 || input.key.length > 128)
    throw new JovieInputError(
      'Supply a stable --idempotency-key (8–128 characters). Reuse it only when retrying this invocation.'
    );
  let value: unknown;
  try {
    value = JSON.parse(input.value);
  } catch {
    throw new JovieInputError('--input must be a JSON object.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new JovieInputError('--input must be a JSON object.');
  const origin = normalizeBaseUrl(options.baseUrl),
    url = new URL(origin);
  if (
    url.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  )
    throw new JovieInputError(
      'Worker credentials require HTTPS (HTTP only on loopback).'
    );
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? globalThis.fetch)(
      `${origin}/api/v1/actions/${id}/invoke`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          idempotencyKey: input.key,
          context: {
            profileId: input.profile,
            channel: input.channel,
            clientVersion: input.version,
          },
          input: value,
        }),
        signal,
      }
    );
  } catch {
    throw new JovieRequestError(
      'Fleet transport unavailable. Retry with the same idempotency key.',
      origin,
      undefined,
      undefined,
      undefined,
      'TEMPORARILY_UNAVAILABLE'
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await readResponseBody(response, signal));
  } catch {
    throw new JovieRequestError(
      'Invalid fleet response.',
      origin,
      response.status
    );
  }
  // Canonical results, including authorization denials, survive all adapters.
  if (
    payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    'receipt' in payload
  )
    return payload;
  // These are emitted before a canonical invocation exists. Never forward
  // arbitrary server codes, messages or bodies into agent diagnostics.
  const error =
    payload && typeof payload === 'object' && 'error' in payload
      ? payload.error
      : undefined;
  const knownError =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'FEATURE_DISABLED',
      'VALIDATION_FAILED',
      'RATE_LIMITED',
      'TEMPORARILY_UNAVAILABLE',
    ].includes(error.code)
      ? {
          code: error.code,
          retryable:
            'retryable' in error && typeof error.retryable === 'boolean'
              ? error.retryable
              : undefined,
        }
      : undefined;
  throw new JovieRequestError(
    `Fleet request returned HTTP ${response.status}.`,
    origin,
    response.status,
    undefined,
    parseRetryAfterSeconds(response.headers.get('retry-after')),
    knownError?.code ?? 'TEMPORARILY_UNAVAILABLE',
    knownError?.retryable
  );
}
