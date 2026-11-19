import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_ROUTING } from '@/lib/ai/routing';
import { WORKERS_AI_MODEL_MAP } from '@/lib/ai/workers-ai';

/**
 * Deprecated Workers AI model guard (JOV-13141).
 *
 * Cloudflare refreshes the Workers AI catalog and retires models with no
 * runtime warning: requests to a retired model fail 410 Gone (error 5028)
 * from the retirement date on. This test pins the checked-in retirement
 * ledger and fails the moment any model we default to, route to, or
 * allowlist on Workers AI is on it, so the next catalog refresh is caught
 * in CI instead of in production.
 *
 * Ledger source (announced 2026-11-05, effective 2026-11-20):
 * https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/
 * When Cloudflare announces the next retirement wave, append the new ids
 * here with their retirement dates — do not remove old rows (history keeps
 * the guard honest for anything resurrected from an old branch).
 */
const DEPRECATED_WORKERS_AI_MODELS: ReadonlyArray<{
  readonly id: string;
  readonly retiredOn: string;
}> = [
  // LLMs, retired 2026-11-20:
  {
    id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    retiredOn: '2026-11-20',
  },
  { id: '@cf/nvidia/nemotron-3-120b-a12b', retiredOn: '2026-11-20' },
  { id: '@cf/deepseek-ai/deepseek-v4-pro-0813', retiredOn: '2026-11-20' },
  { id: '@cf/deepseek-ai/deepseek-v4-flash-0731', retiredOn: '2026-11-20' },
  { id: '@cf/qwen/qwq-32b', retiredOn: '2026-11-20' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', retiredOn: '2026-11-20' },
  { id: '@cf/moonshotai/kimi-k2.6', retiredOn: '2026-11-20' },
  { id: '@cf/moonshotai/kimi-k2.7-code', retiredOn: '2026-11-20' },
  { id: '@cf/zai-org/glm-5.2', retiredOn: '2026-11-20' },
  { id: '@cf/zai-org/glm-5.3-flash', retiredOn: '2026-11-20' },
  { id: '@cf/meta-llama/llama-2-7b-chat-hf-lora', retiredOn: '2026-11-20' },
  { id: '@cf/google/gemma-2b-it-lora', retiredOn: '2026-11-20' },
  { id: '@cf/google/gemma-7b-it-lora', retiredOn: '2026-11-20' },
  { id: '@cf/meta/llama-3.1-8b-instruct-fp8', retiredOn: '2026-11-20' },
  { id: '@cf/meta/llama-3.2-1b-instruct', retiredOn: '2026-11-20' },
  { id: '@cf/meta/llama-3.2-3b-instruct', retiredOn: '2026-11-20' },
  // Other models (tts/image/whisper/vision/embeddings), retired 2026-11-20:
  { id: '@cf/myshell-ai/melotts', retiredOn: '2026-11-20' },
  {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    retiredOn: '2026-11-20',
  },
  {
    id: '@cf/runwayml/stable-diffusion-v1-5-inpainting',
    retiredOn: '2026-11-20',
  },
  {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    retiredOn: '2026-11-20',
  },
  { id: '@cf/lykon/dreamshaper-8-lcm', retiredOn: '2026-11-20' },
  { id: '@cf/openai/whisper-tiny-en', retiredOn: '2026-11-20' },
  { id: '@cf/llava-hf/llava-1.5-7b-hf', retiredOn: '2026-11-20' },
  { id: '@cf/google/embeddinggemma-300m', retiredOn: '2026-11-20' },
];

const DEPRECATED_IDS = new Map(
  DEPRECATED_WORKERS_AI_MODELS.map(entry => [entry.id, entry.retiredOn])
);

function expectNotRetired(modelId: string, surface: string): void {
  const retiredOn = DEPRECATED_IDS.get(modelId);
  expect(
    retiredOn,
    `${surface} uses Workers AI model "${modelId}", which Cloudflare retired on ${retiredOn ?? ''} (410 Gone from that date). Swap it to a live catalog model and update the retirement ledger if this is a new wave.`
  ).toBeUndefined();
}

describe('Workers AI deprecated-model guard (JOV-13141)', () => {
  it('never maps a Gateway model to a retired Workers AI twin', () => {
    for (const [gatewayId, workersId] of Object.entries(WORKERS_AI_MODEL_MAP)) {
      expectNotRetired(
        workersId,
        `WORKERS_AI_MODEL_MAP["${gatewayId}"] (apps/web/lib/ai/workers-ai.ts)`
      );
    }
  });

  it('routes no caller to a retired Workers AI model', () => {
    for (const caller of AI_ROUTING.callers) {
      for (const model of caller.models) {
        if (!model.startsWith('@cf/')) continue;
        expectNotRetired(model, `routing.json caller "${caller.id}"`);
      }
    }
  });

  it('allowlists no retired model on the Workers AI relay', () => {
    // The relay (infra/workers-ai-relay) is its own package with no @/ alias,
    // so read its source and check every @cf/ id literal it declares — this
    // covers ALLOWED_MODELS and EMBEDDING_MODELS together and catches future
    // additions to either.
    const relaySource = readFileSync(
      new URL(
        '../../../../../infra/workers-ai-relay/src/index.ts',
        import.meta.url
      ),
      'utf8'
    );
    const relayIds = [
      ...new Set(relaySource.match(/'@cf\/[a-z0-9./-]+'/gu) ?? []),
    ].map(literal => literal.slice(1, -1));
    expect(relayIds.length).toBeGreaterThan(0);
    for (const modelId of relayIds) {
      expectNotRetired(modelId, 'the workers-ai-relay allowlist');
    }
  });
});
