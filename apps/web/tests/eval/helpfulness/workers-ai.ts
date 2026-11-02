/**
 * Cloudflare Workers AI client for the helpfulness eval, through the shared
 * API client layer (.claude/rules/external-apis.md).
 *
 * Workers AI runs on Cloudflare startup credits, not AI Gateway cash, so eval
 * turns and judges never draw the Gateway balance (cost guard 2026-10-28).
 * It hosts the production chat model (zai glm-5.3), so the subject is the
 * same model artists talk to.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI scope). On
 * a host with `wrangler login`, the runner fills the token from
 * `wrangler auth token`.
 */

import { createApiClient } from '../../../../../packages/api-client/client.ts';
import { hashCredential } from '../../../../../packages/api-client/store.ts';

export const WORKERS_AI_SUBJECT_MODEL = '@cf/zai-org/glm-5.3';
/**
 * Cheap judge. Not glm-5.3-flash: that model carries Summer's production
 * traffic on this account and its per-minute limit is shared.
 */
export const WORKERS_AI_CHEAP_JUDGE = '@cf/openai/gpt-oss-120b';
/** Calibrated 2026-10-28: MAE 9.7 vs reference grades (kimi-k2.6 timed out, gpt-oss-120b MAE 18.4). */
export const WORKERS_AI_STRONG_JUDGE = '@cf/deepseek-ai/deepseek-v4-pro-0813';

export interface WaiMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_calls?: readonly WaiToolCall[];
  readonly tool_call_id?: string;
}

export interface WaiToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface WaiTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface WaiResult {
  readonly message: WaiMessage;
  readonly usage: { readonly input: number; readonly output: number };
}

export interface WorkersAiConfig {
  readonly accountId: string;
  /** Current bearer. Called per request so short-lived OAuth tokens refresh. */
  readonly token: () => string;
}

/**
 * Minimum gap between calls to one model. Workers AI rate limits per model
 * per account, and Summer's production route shares this account
 * (glm-5.3-flash), so the eval paces itself well under the limit.
 */
export const WORKERS_AI_MIN_INTERVAL_MS = 5_000;

export function workersAiChat(config: WorkersAiConfig) {
  const nextSlot = new Map<string, number>();
  const pace = async (model: string) => {
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(model) ?? 0);
    nextSlot.set(model, slot + WORKERS_AI_MIN_INTERVAL_MS);
    if (slot > now) await new Promise(r => setTimeout(r, slot - now));
  };
  // One ledger bucket per model: Workers AI rate limits per model, so a 429
  // on one model must not open the breaker for the others.
  const clients = new Map<string, ReturnType<typeof createApiClient>>();
  const clientFor = (model: string) => {
    let client = clients.get(model);
    if (!client) {
      client = createApiClient({
        provider: 'cloudflare',
        credential: `${hashCredential('cloudflare', config.accountId)}:${model}`,
        authorize: headers => {
          headers.set('authorization', `Bearer ${config.token()}`);
        },
      });
      clients.set(model, client);
    }
    return client;
  };
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1/chat/completions`;

  return async function chat(input: {
    readonly model: string;
    readonly messages: readonly WaiMessage[];
    readonly tools?: readonly WaiTool[];
    readonly maxTokens?: number;
  }): Promise<WaiResult> {
    await pace(input.model);
    const response = await clientFor(input.model).request({
      url,
      method: 'POST',
      priority: 'default',
      headers: { 'content-type': 'application/json' },
      body: {
        model: input.model,
        messages: input.messages,
        ...(input.tools && input.tools.length > 0
          ? { tools: input.tools, tool_choice: 'auto' }
          : {}),
        max_tokens: input.maxTokens ?? 4096,
      },
      maxAttempts: 3,
      // Reasoning models take tens of seconds per turn.
      timeoutMs: 180_000,
    });
    if (response.status >= 400) {
      throw new Error(
        `Workers AI ${input.model} HTTP ${response.status}: ${response.text.slice(0, 300)}`
      );
    }
    const json = response.json<{
      choices?: { message?: WaiMessage }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>();
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error(`Workers AI ${input.model}: no message`);
    return {
      message,
      usage: {
        input: json.usage?.prompt_tokens ?? 0,
        output: json.usage?.completion_tokens ?? 0,
      },
    };
  };
}
