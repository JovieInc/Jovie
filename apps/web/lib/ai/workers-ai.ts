import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_ROUTING } from '@/lib/ai/routing';
import { env } from '@/lib/env-server';

/**
 * Cloudflare Workers AI as a second model provider (paid from Cloudflare
 * startup credits, not the Vercel AI Gateway balance).
 *
 * Stock path: the AI SDK OpenAI-compatible provider against Jovie's Workers
 * AI relay (OpenAI-compatible `/v1/chat/completions`). The routed models are the SAME open-weight models the
 * Gateway serves (`zai/glm-5.3` and `zai/glm-5.3-flash`), so a failover or a
 * Workers-first route changes the bill, not the model.
 *
 * Off by default: with no `WORKERS_AI_TOKEN` every helper reports "not
 * configured" and callers keep their Gateway-only behavior.
 */

/**
 * Jovie's relay Worker (infra/workers-ai-relay): an OpenAI-compatible front for
 * the Workers AI binding, so no Cloudflare API token lives in Vercel, CI or
 * Doppler. The URL lives in routing.json (also read by scripts/buyer-eval);
 * `WORKERS_AI_BASE_URL` overrides it (tests, a staging relay).
 */
export const WORKERS_AI_RELAY_BASE_URL: string =
  AI_ROUTING.providers['workers-ai'].relayBaseUrl;

/**
 * Gateway model id -> Workers AI model id. Only models that exist on both
 * providers appear here; `typesafe-ai/jev` has no Workers AI twin and stays
 * Gateway-only. OpenAI and Anthropic ids are never mapped (JOV-7119).
 */
export const WORKERS_AI_MODEL_MAP: Readonly<Record<string, string>> = {
  'zai/glm-5.3': '@cf/zai-org/glm-5.3',
  'zai/glm-5.3-flash': '@cf/zai-org/glm-5.3-flash',
};

export function workersAiModelFor(gatewayModelId: string): string | undefined {
  return WORKERS_AI_MODEL_MAP[gatewayModelId];
}

export function isWorkersAiConfigured(): boolean {
  return Boolean(env.WORKERS_AI_TOKEN?.trim());
}

function workersAiBaseUrl(): string {
  return (env.WORKERS_AI_BASE_URL?.trim() || WORKERS_AI_RELAY_BASE_URL).replace(
    /\/+$/u,
    ''
  );
}

type WorkersAiProvider = ReturnType<typeof createOpenAICompatible>;
let cachedProvider: WorkersAiProvider | null = null;

function getProvider(): WorkersAiProvider {
  cachedProvider ??= createOpenAICompatible({
    name: 'workers-ai',
    baseURL: workersAiBaseUrl(),
    apiKey: env.WORKERS_AI_TOKEN?.trim(),
    // Without this the SDK sends a bare json_object mode and the model ignores
    // the schema's keys (measured: enum field came back under a different key).
    supportsStructuredOutputs: true,
  });
  return cachedProvider;
}

/** Workers AI twin of a Gateway model id, or undefined when none or off. */
export function workersAiLanguageModel(gatewayModelId: string) {
  const mapped = workersAiModelFor(gatewayModelId);
  if (!mapped || !isWorkersAiConfigured()) return undefined;
  return getProvider().languageModel(mapped);
}
