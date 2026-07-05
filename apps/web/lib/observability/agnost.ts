import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';

/**
 * Agnost AI analytics — OpenTelemetry trace export for Vercel AI SDK spans.
 *
 * @see https://docs.agnost.ai/otel-vercel-ai
 */

const AGNOST_OTEL_ENDPOINT = 'https://otel.agnost.ai/v1/traces';
/** Bounded OTLP export — observability sink must not hang cold starts. */
const AGNOST_OTEL_TIMEOUT_MS = 10_000;

export const DEFAULT_AGNOST_ORG_ID = '3e2d4388-5d86-41f5-8f67-4a3bac08d72f';

let agnostStarted = false;

const runtimeImport = new Function('specifier', 'return import(specifier)') as <
  T,
>(
  specifier: string
) => Promise<T>;

export function shouldEnableAgnost(): boolean {
  if (env.CI === 'true') return false;
  if (env.NODE_ENV === 'test' || publicEnv.NEXT_PUBLIC_E2E_MODE === '1') {
    return false;
  }

  const orgId = env.AGNOST_ORG_ID ?? DEFAULT_AGNOST_ORG_ID;
  if (!orgId) return false;

  if (env.NODE_ENV === 'development') {
    return env.JOVIE_ENABLE_AGNOST === '1';
  }

  return true;
}

export function getAgnostOrgId(): string | null {
  if (!shouldEnableAgnost()) return null;
  return env.AGNOST_ORG_ID ?? DEFAULT_AGNOST_ORG_ID;
}

/**
 * Boot OpenTelemetry export to Agnost. Idempotent; safe to call from
 * Next.js instrumentation on every cold start.
 */
export async function initAgnostTelemetry(): Promise<void> {
  if (agnostStarted) return;

  const orgId = getAgnostOrgId();
  if (!orgId) return;

  try {
    const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
      runtimeImport<typeof import('@opentelemetry/sdk-node')>(
        '@opentelemetry/sdk-node'
      ),
      runtimeImport<typeof import('@opentelemetry/exporter-trace-otlp-proto')>(
        '@opentelemetry/exporter-trace-otlp-proto'
      ),
    ]);

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: AGNOST_OTEL_ENDPOINT,
        headers: { 'X-Agnost-Org-ID': orgId },
        timeoutMillis: AGNOST_OTEL_TIMEOUT_MS,
      }),
    });

    sdk.start();
    agnostStarted = true;
    console.log('[STARTUP] Agnost OpenTelemetry export enabled');
  } catch (error) {
    console.warn('[STARTUP] Agnost telemetry init failed:', error);
  }
}
