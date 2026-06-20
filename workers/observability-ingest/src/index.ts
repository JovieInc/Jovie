import { fingerprintObservabilityReport } from './fingerprint.ts';
import { parseObservabilityReport, type ObservabilityReport } from './report.ts';

export interface Env {
  readonly GH_DISPATCH_TOKEN: string;
  readonly INGEST_HMAC_SECRET: string;
  readonly GITHUB_REPO_OWNER: string;
  readonly GITHUB_REPO_NAME: string;
  readonly DISPATCH_COOLDOWN_MS?: string;
  readonly OBSERVABILITY_KV: KVNamespace;
}

interface DispatchState {
  readonly lastDispatchedAt: number;
  readonly pendingOccurrences: number;
}

const DEFAULT_COOLDOWN_MS = 60_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/ingest') {
      return json({ error: 'Not found' }, 404);
    }

    const bodyText = await request.text();
    const signature = request.headers.get('x-observability-signature');

    if (!signature || !(await verifySignature(bodyText, signature, env.INGEST_HMAC_SECRET))) {
      return json({ error: 'Invalid signature' }, 401);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const report = parseObservabilityReport(parsedBody);
    if (!report) {
      return json({ error: 'Invalid report payload' }, 400);
    }

    if (!shouldAcceptClientSample(parsedBody)) {
      return json({ accepted: true, sampled: false });
    }

    const fingerprint = await fingerprintObservabilityReport(report);
    const cooldownMs = Number.parseInt(env.DISPATCH_COOLDOWN_MS ?? '', 10) || DEFAULT_COOLDOWN_MS;
    const dispatchDecision = await recordOccurrence(env.OBSERVABILITY_KV, fingerprint, cooldownMs);

    if (!dispatchDecision.shouldDispatch) {
      return json({
        accepted: true,
        fingerprint,
        dispatched: false,
        pendingOccurrences: dispatchDecision.pendingOccurrences,
      });
    }

    const dispatched = await dispatchObservabilityReport(env, report, fingerprint, dispatchDecision.occurrenceDelta);
    if (!dispatched) {
      return json({ error: 'Dispatch failed' }, 502);
    }

    return json({
      accepted: true,
      fingerprint,
      dispatched: true,
      occurrenceDelta: dispatchDecision.occurrenceDelta,
    });
  },
};

export async function verifySignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix) || !secret) {
    return false;
  }

  const provided = signatureHeader.slice(expectedPrefix.length);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${body}`)
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(provided, expected);
}

export function shouldAcceptClientSample(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return true;
  }

  const sampled = (payload as Record<string, unknown>).sampled;
  return sampled !== false;
}

export async function recordOccurrence(
  kv: KVNamespace,
  fingerprint: string,
  cooldownMs: number,
  now = Date.now()
): Promise<{
  shouldDispatch: boolean;
  occurrenceDelta: number;
  pendingOccurrences: number;
}> {
  const key = `obs:${fingerprint}`;
  const existing = await kv.get<DispatchState>(key, 'json');
  const pendingOccurrences = (existing?.pendingOccurrences ?? 0) + 1;

  if (!existing || now - existing.lastDispatchedAt >= cooldownMs) {
    await kv.put(
      key,
      JSON.stringify({
        lastDispatchedAt: now,
        pendingOccurrences: 0,
      } satisfies DispatchState)
    );

    return {
      shouldDispatch: true,
      occurrenceDelta: pendingOccurrences,
      pendingOccurrences: 0,
    };
  }

  await kv.put(
    key,
    JSON.stringify({
      lastDispatchedAt: existing.lastDispatchedAt,
      pendingOccurrences,
    } satisfies DispatchState)
  );

  return {
    shouldDispatch: false,
    occurrenceDelta: 0,
    pendingOccurrences,
  };
}

async function dispatchObservabilityReport(
  env: Env,
  report: ObservabilityReport,
  fingerprint: string,
  occurrenceDelta: number
): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${env.GH_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'jovie-observability-ingest',
      },
      body: JSON.stringify({
        event_type: 'observability-report',
        client_payload: {
          ...report,
          fingerprint,
          occurrence_delta: occurrenceDelta,
        },
      }),
    }
  );

  return response.ok;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}