import { randomUUID } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import {
  convertToModelMessages,
  type ModelMessage,
  streamText,
  type ToolSet,
  type UIMessage,
} from 'ai';
import {
  type RetrievedCanon,
  retrieveCanonContext,
} from '@/lib/chat/knowledge/retrieve';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import type {
  ArtistContext,
  ChatTelemetry,
  ReleaseContext,
} from '@/lib/chat/types';
import {
  computeRetrievalVersion,
  fingerprintToolSchemas,
  getGitSha,
} from '@/lib/chat/versions';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import type { getEntitlements as GetEntitlements } from '@/lib/entitlements/registry';

type EntitlementsForPlan = ReturnType<typeof GetEntitlements>;

/**
 * Regex patterns for messages that can be handled by the lightweight model.
 * Kept here so `executeChatTurn` is self-contained.
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
  if (!aiCanUseTools) return true;
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
 * Joins the last 3 user messages for retrieval input. Same recency window
 * as the legacy keyword router so retrieval-vs-keyword behavior stays
 * comparable during the rollout.
 */
function joinRecentUserText(uiMessages: UIMessage[]): string {
  return [...uiMessages]
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
}

/**
 * Selects the music-industry knowledge context relevant to the recent
 * conversation via the legacy keyword router.
 */
export function selectKnowledgeContextForTurn(uiMessages: UIMessage[]): string {
  return selectKnowledgeContext(joinRecentUserText(uiMessages));
}

export interface TurnTraceMetadata {
  /** Server-generated UUID. Returned to the UI in stream metadata for feedback wiring. */
  traceId: string;
  conversationId: string | null;
  userId: string;
  /** Canon doc paths retrieved for this turn (relative to canon/). */
  retrievedCanonPaths: readonly string[];
  /** Cosine scores aligned with retrievedCanonPaths. */
  retrievedScores: readonly number[];
  /** Composite version hash. See lib/chat/versions.ts. */
  retrievalVersion: string;
  /** VERCEL_GIT_COMMIT_SHA at request time. */
  gitSha: string | null;
  modelId: string;
  embeddingModel: string | null;
  retrievalLatencyMs: number;
  startedAt: number;
  /** True when canon retrieval was attempted. */
  retrievalAttempted: boolean;
  /** True when retrieval ran but returned 0 docs (NIM down or no match). */
  retrievalEmpty: boolean;
}

export interface TurnFinishInfo {
  traceMetadata: TurnTraceMetadata;
  /** Names of tools the model actually called this turn. */
  artistToolsCalled: readonly string[];
  /** Wall-clock latency from `executeChatTurn` start to streamText finish. */
  totalLatencyMs: number;
  finishReason: string | undefined;
  totalTokens: number | undefined;
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
  /** Pre-built tools for the turn (caller composes free + paid + lookup). */
  tools: ToolSet;
  signal: AbortSignal;
  requestId: string;
  /** Telemetry hooks (Sentry in prod, no-op in eval/tests). */
  telemetry?: ChatTelemetry;
  /**
   * When true, run canon retrieval (NIM embeddings + Redis-cached cosine
   * search) and inject the result into the system prompt. When false, fall
   * back to the legacy keyword router. Gated by `chat_rag_retrieval_enabled`
   * Statsig flag in the route.
   */
  retrieveCanon?: boolean;
  /** Override min-score threshold (admin/dev escape hatch). */
  retrievalThreshold?: number;
  /**
   * Called when streamText emits `onFinish`. Caller persists the trace row,
   * with all values assembled. Wrapped by the caller in try/catch so trace
   * write failures never propagate to the user.
   */
  onTurnFinish?: (info: TurnFinishInfo) => Promise<void> | void;
}

export interface ExecuteChatTurnResult {
  streamResult: ReturnType<typeof streamText>;
  selectedModel: string;
  systemPrompt: string;
  toolNames: readonly string[];
  modelMessages: ModelMessage[];
  /** Stream-time identity + retrieval/version stamps. UI uses traceId for feedback. */
  traceMetadata: TurnTraceMetadata;
  /** Retrieved canon docs (empty when retrieval wasn't run or returned nothing). */
  retrieved: readonly RetrievedCanon[];
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
 * `executeChatTurn` owns: canon retrieval (gated), system prompt assembly,
 * model messages conversion, model selection, telemetry tagging, version
 * stamping, the `streamText()` invocation, and assembling trace metadata.
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
    retrieveCanon = false,
    retrievalThreshold,
    onTurnFinish,
  } = input;

  const startedAt = Date.now();
  const traceId = randomUUID();

  let knowledgeContext = '';
  let retrievedCanonPaths: string[] = [];
  let retrievedScores: number[] = [];
  let retrieved: readonly RetrievedCanon[] = [];
  let embeddingModel: string | null = null;
  let retrievalLatencyMs = 0;
  let retrievalAttempted = false;
  let retrievalEmpty = false;

  if (retrieveCanon) {
    retrievalAttempted = true;
    const recentText = joinRecentUserText(uiMessages);
    const result = await retrieveCanonContext(recentText, {
      minScore: retrievalThreshold,
    });
    knowledgeContext = result.contextText;
    retrievedCanonPaths = result.retrieved.map(r => r.path);
    retrievedScores = result.retrieved.map(r => r.score);
    retrieved = result.retrieved;
    embeddingModel = result.embeddingModel;
    retrievalLatencyMs = result.latencyMs;
    retrievalEmpty = result.empty;
  } else {
    // Legacy keyword router — replaced by canon retrieval once the Statsig
    // flag is at 100%. Until then, fallback path keeps prod parity.
    knowledgeContext = selectKnowledgeContext(joinRecentUserText(uiMessages));
  }

  const systemPrompt = buildSystemPrompt(artistContext, releases, {
    aiCanUseTools: planLimits.booleans.aiCanUseTools,
    aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
    insightsEnabled,
    knowledgeContext: knowledgeContext || undefined,
  });

  const modelMessages = await convertToModelMessages(uiMessages);

  const shouldUseLightModel =
    forceLightModel ||
    canUseLightModel(uiMessages, planLimits.booleans.aiCanUseTools);
  const selectedModel = shouldUseLightModel ? CHAT_MODEL_LIGHT : CHAT_MODEL;

  const toolNames = Object.keys(tools).sort();

  const retrievalVersion = computeRetrievalVersion({
    systemPromptShape: 'jovie-chat-v1',
    retrievalConfig: {
      retrieveCanon,
      retrievalThreshold: retrievalThreshold ?? null,
    },
    toolSchemasFingerprint: fingerprintToolSchemas(toolNames),
  });
  const gitSha = getGitSha();

  const traceMetadata: TurnTraceMetadata = {
    traceId,
    conversationId: resolvedConversationId,
    userId,
    retrievedCanonPaths,
    retrievedScores,
    retrievalVersion,
    gitSha,
    modelId: selectedModel,
    embeddingModel,
    retrievalLatencyMs,
    startedAt,
    retrievalAttempted,
    retrievalEmpty,
  };

  // Telemetry tags fire from the same call sites as before.
  telemetry?.setTags?.({
    chat_model: selectedModel,
    chat_force_light: String(forceLightModel),
    chat_has_tools: String(planLimits.booleans.aiCanUseTools),
    chat_rag_retrieval: String(retrieveCanon),
    chat_rag_retrieval_empty: String(retrievalEmpty),
  });
  telemetry?.setExtra?.('chat_trace_id', traceId);
  telemetry?.setExtra?.('chat_retrieval_version', retrievalVersion);
  if (resolvedConversationId) {
    telemetry?.setExtra?.(
      'chat_conversation_id',
      resolvedConversationId.slice(0, 120)
    );
  }

  const streamResult = streamText({
    model: gateway(selectedModel),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    abortSignal: signal,
    experimental_telemetry: {
      isEnabled: true,
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
          traceId,
        },
      });
    },
    onFinish: onTurnFinish
      ? async ({ toolCalls, finishReason, usage }) => {
          const calledNames = Array.from(
            new Set(
              (toolCalls ?? [])
                .map(c => (c as { toolName?: string }).toolName)
                .filter((n): n is string => typeof n === 'string')
            )
          ).sort();
          const totalLatencyMs = Date.now() - startedAt;
          try {
            await onTurnFinish({
              traceMetadata,
              artistToolsCalled: calledNames,
              totalLatencyMs,
              finishReason,
              totalTokens:
                typeof usage?.totalTokens === 'number'
                  ? usage.totalTokens
                  : undefined,
            });
          } catch (err) {
            // Trace persistence MUST NOT throw — observability, not correctness.
            telemetry?.captureException?.(err, {
              tags: { feature: 'ai-chat', errorType: 'trace-persist' },
              extra: { traceId, requestId },
            });
          }
        }
      : undefined,
  });

  return {
    streamResult,
    selectedModel,
    systemPrompt,
    toolNames,
    modelMessages,
    traceMetadata,
    retrieved,
  };
}
