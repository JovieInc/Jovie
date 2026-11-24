import { readFile } from 'node:fs/promises';
import {
  displayValue,
  JovieInputError,
  JovieRequestError,
  normalizeBaseUrl,
  parseRetryAfterSeconds,
  type ResourceOptions,
  readResponseBody,
} from './client.js';

export interface PublishViewInput {
  readonly file?: string;
  readonly spec?: string;
  readonly id?: string;
  readonly channel: 'cli' | 'mcp';
}

const MAX_SPEC_BYTES = 512 * 1024;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

async function readSpec(input: PublishViewInput): Promise<unknown> {
  if (Boolean(input.file) === Boolean(input.spec))
    throw new JovieInputError('Pass exactly one of --file or --spec.');
  let raw = input.spec ?? '';
  if (input.file) {
    // A local file read is a CLI-only convenience; an MCP caller passes the spec.
    if (input.channel !== 'cli')
      throw new JovieInputError('--file is only supported by the CLI.');
    try {
      raw = await readFile(input.file, 'utf8');
    } catch {
      throw new JovieInputError('Could not read the --file path.');
    }
  }
  if (Buffer.byteLength(raw) > MAX_SPEC_BYTES)
    throw new JovieInputError('View spec exceeds 512 KB.');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw 0;
    return parsed;
  } catch {
    throw new JovieInputError('The view spec must be a JSON object.');
  }
}

/** Publishes a jovie.view.v1 spec through the Ovie MCP endpoint; token from env only. */
export async function publishView(
  input: PublishViewInput,
  options: ResourceOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ id: string; version: number; url: string }> {
  const token = env.JOVIE_OVIE_TOKEN?.trim();
  if (!token)
    throw new JovieInputError(
      'JOVIE_OVIE_TOKEN is required to publish a view.'
    );
  const spec = await readSpec(input);
  const origin = normalizeBaseUrl(options.baseUrl);
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !LOOPBACK_HOSTS.includes(url.hostname))
    throw new JovieInputError(
      'Publishing a view requires HTTPS (HTTP only on loopback).'
    );
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const endpoint = `${origin}/api/ovie/mcp`;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? globalThis.fetch)(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'publish_view',
          arguments: {
            spec,
            ...(input.id ? { view_id: input.id } : {}),
            created_by: `jovie-cli-${input.channel}`,
          },
        },
      }),
      signal,
    });
  } catch {
    throw new JovieRequestError(
      'View publish transport unavailable.',
      endpoint
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await readResponseBody(response, signal));
  } catch {
    throw new JovieRequestError(
      'Invalid view publish response.',
      endpoint,
      response.status
    );
  }
  const body = (payload ?? {}) as {
    error?: { message?: unknown };
    result?: { structuredContent?: Record<string, unknown> };
  };
  const out = body.result?.structuredContent;
  if (
    response.ok &&
    out &&
    typeof out.id === 'string' &&
    typeof out.url === 'string' &&
    typeof out.version === 'number'
  )
    return { id: out.id, version: out.version, url: out.url };
  const reason =
    typeof body.error?.message === 'string'
      ? `: ${displayValue(body.error.message)}`
      : '';
  throw new JovieRequestError(
    `View publish failed (HTTP ${response.status})${reason}.`,
    endpoint,
    response.status,
    undefined,
    parseRetryAfterSeconds(response.headers.get('retry-after'))
  );
}
