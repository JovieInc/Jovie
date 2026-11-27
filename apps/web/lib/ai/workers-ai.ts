import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_ROUTING } from '@/lib/ai/routing';
import { env } from '@/lib/env-server';

/**
 * Cloudflare Workers AI as a second model provider (paid from Cloudflare
 * startup credits, not the Vercel AI Gateway balance).
 *
 * Stock path: the AI SDK OpenAI-compatible provider against Jovie's Workers
 * AI relay (OpenAI-compatible `/v1/chat/completions`). `zai/glm-5.3` maps to
 * its same-weights Workers AI twin. `zai/glm-5.3-flash` no longer does:
 * Cloudflare retired `@cf/zai-org/glm-5.3-flash` on 2026-11-20 (410 Gone,
 * error 5028 — changelog "Planned model deprecations on Workers AI",
 * 2026-11-05), so its Workers AI twin is now
 * `@cf/deepseek-ai/deepseek-v4.1-flash-1017` (JOV-13141): 1M context,
 * function calling, reasoning, vision; $0.30 per M input tokens, $1.20 per M
 * output, $0.006 per M cached input (catalog 2026-11-19). A failover or a
 * Workers-first route changes the bill and, for the flash tier, the model.
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
  'zai/glm-5.3-flash': '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
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
