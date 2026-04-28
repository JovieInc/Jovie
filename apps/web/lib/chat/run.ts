import { gateway } from '@ai-sdk/gateway';
import {
  convertToModelMessages,
  type ModelMessage,
  streamText,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import type {
  ArtistContext,
  ChatTelemetry,
  ReleaseContext,
} from '@/lib/chat/types';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import type { getEntitlements as GetEntitlements } from '@/lib/entitlements/registry';

type EntitlementsForPlan = ReturnType<typeof GetEntitlements>;

/**
 * Regex patterns for messages that can be handled by the lightweight model.
 * These are simple, tool-invocation-oriented requests that don't need
 * frontier-model reasoning.
 *
 * Kept here (not imported from route.ts) so `executeChatTurn` is self-contained.
 */
const SIMPLE_INTENT_PATTERNS = [
  /^(?:change|update|set|edit|make)\s+(?:my\s+)?(?:display\s*name|name|bio)\s+(?:to|:)/i,
  /^(?:add|connect|link)\s+(?:my\s+)?(?:instagram|twitter|x|tiktok|youtube|spotify|soundcloud|bandcamp|facebook|link|url|website)/i,
  /^(?:upload|change|update|set)\s+(?:my\s+)?(?:photo|avatar|picture|profile\s*pic|pfp)/i,
  /^(?:format|clean\s*up|fix)\s+(?:my\s+)?lyrics/i,
  /^check\s+(?:my\s+)?canvas/i,
  /^mark\s+\S+(?:\s+\S+)*\s+as\s+(?:uploaded|done|set)/i,
] as const;

/**
 * Determines whether a request can be handled by the lightweight (Haiku) model.
 *
 * Returns true for free-tier users (limited tools, simple Q&A) and short
 * conversations with clearly simple intents (profile edits, link adds).
 */
export function canUseLightModel(
  messages: UIMessage[],
  aiCanUseTools: boolean
): boolean {
  // Free-plan users don't have advanced tools — always use the light model
  if (!aiCanUseTools) return true;

  // Only consider light model for short conversations
  if (messages.length > 6) return false;

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return false;

  const text = lastUserMsg.parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('')
    .trim();

  // Short, clearly tool-oriented requests
  return text.length < 200 && SIMPLE_INTENT_PATTERNS.some(p => p.test(text));
}

export function isClientDisconnect(
  error: unknown,
  signal: AbortSignal | undefined
): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return (code === 'EPIPE' || code === 'ECONNRESET') && !!signal?.aborted;
}

/**
 * Selects the music-industry knowledge context relevant to the recent
 * conversation. Uses the last 3 user turns so follow-up questions retain
 * context from earlier turns.
 */
export function selectKnowledgeContextForTurn(uiMessages: UIMessage[]): string {
  const recentUserText = [...uiMessages]
    .reverse()
    .filter(m => m.role === 'user')
    .slice(0, 3)
    .flatMap(m =>
      (m.parts ?? [])
        .filter(
          (p): p is { type: 'text'; text: string } =>
            p.type === 'text' && typeof p.text === 'string'
        )
        .map(p => p.text)
    )
    .join(' ');
  return selectKnowledgeContext(recentUserText);
}

export interface ExecuteChatTurnInput {
  uiMessages: UIMessage[];
  artistContext: ArtistContext;
  releases: ReleaseContext[];
  resolvedProfileId: string | null;
  resolvedConversationId: string | null;
  userId: string;
  userPlan: string;
  planLimits: EntitlementsForPlan;
  insightsEnabled: boolean;
  forceLightModel: boolean;
  /**
   * Pre-built tools for the turn. The caller composes free + paid tool sets
   * based on plan and feature flags before invoking.
   */
  tools: ToolSet;
  signal: AbortSignal;
  requestId: string;
  /** Telemetry hooks (Sentry in prod, no-op in eval/tests). */
  telemetry?: ChatTelemetry;
}

export interface ExecuteChatTurnResult {
  /** The streamText result. Caller wraps with `.toUIMessageStreamResponse()`. */
  streamResult: ReturnType<typeof streamText>;
  /** Resolved model id (`anthropic/...`). Useful for parity assertions and traces. */
  selectedModel: string;
  /** Composed system prompt. Useful for parity tests and eval reproduction. */
  systemPrompt: string;
  /** Names of tools registered for this turn (deterministic order). */
  toolNames: readonly string[];
  /** Pre-converted model messages (the AI SDK input). */
  modelMessages: ModelMessage[];
}

/**
 * Pure execution of a single chat turn.
 *
 * Caller (route handler or eval script) is responsible for:
 *  - auth, billing, kill switches, rate limiting (route only)
 *  - intent-route short-circuit (route only — never enters here)
 *  - resolving artist context + releases
 *  - building the tool set (closure-captured profileId etc.)
 *  - shaping the response (`.toUIMessageStreamResponse()` in prod)
 *  - error handling around any synchronous throw
 *
 * `executeChatTurn` owns: knowledge context selection, system prompt
 * assembly, model messages conversion, model selection, telemetry tagging,
 * and the `streamText()` invocation.
 */
export async function executeChatTurn(
  input: ExecuteChatTurnInput
): Promise<ExecuteChatTurnResult> {
  const {
    uiMessages,
    artistContext,
    releases,
    resolvedConversationId,
    userId,
    userPlan,
    planLimits,
    insightsEnabled,
    forceLightModel,
    tools,
    signal,
    requestId,
    resolvedProfileId,
    telemetry,
  } = input;

  const knowledgeContext = selectKnowledgeContextForTurn(uiMessages);

  const systemPrompt = buildSystemPrompt(artistContext, releases, {
    aiCanUseTools: planLimits.booleans.aiCanUseTools,
    aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
    insightsEnabled,
    knowledgeContext: knowledgeContext || undefined,
  });

  const modelMessages = await convertToModelMessages(uiMessages);

  // `forceLightModel` is the runtime lever (Statsig `ai_chat_force_light`)
  // that degrades the entire chat surface to the light model during a
  // provider incident, overriding the per-request heuristic. Intermediate
  // variable keeps the precedence explicit (|| binds tighter than ?:).
  const shouldUseLightModel =
    forceLightModel ||
    canUseLightModel(uiMessages, planLimits.booleans.aiCanUseTools);
  const selectedModel = shouldUseLightModel ? CHAT_MODEL_LIGHT : CHAT_MODEL;

  // Tag the request scope with chat-specific dimensions so all telemetry
  // events for this turn (errors, perf, breadcrumbs) are filterable
  // together. `chat_conversation_id` goes in `extra` (high cardinality);
  // `chat_has_tools` reflects the real plan capability boundary rather
  // than a count of always-on freeTools.
  telemetry?.setTags?.({
    chat_model: selectedModel,
    chat_force_light: String(forceLightModel),
    chat_has_tools: String(planLimits.booleans.aiCanUseTools),
  });
  if (resolvedConversationId) {
    telemetry?.setExtra?.(
      'chat_conversation_id',
      resolvedConversationId.slice(0, 120)
    );
  }

  const toolNames = Object.keys(tools).sort();

  const streamResult = streamText({
    model: gateway(selectedModel),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    abortSignal: signal,
    experimental_telemetry: {
      isEnabled: true,
      // PII: do not capture prompts/outputs in AI SDK spans. Tokens, model,
      // latency, and tool-call structure are still captured.
      recordInputs: false,
      recordOutputs: false,
      functionId: 'jovie-chat',
      metadata: { model: selectedModel, plan: userPlan },
    },
    onError: ({ error }) => {
      if (isClientDisconnect(error, signal)) return;

      telemetry?.captureException?.(error, {
        tags: { feature: 'ai-chat', errorType: 'streaming' },
        extra: {
          userId,
          messageCount: uiMessages.length,
          requestId,
          profileId: resolvedProfileId,
          conversationId: resolvedConversationId,
        },
      });
    },
  });

  return {
    streamResult,
    selectedModel,
    systemPrompt,
    toolNames,
    modelMessages,
  };
}
