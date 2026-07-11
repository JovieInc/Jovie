import {
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { gateway, streamText } from '@/lib/ai/sdk';
import { buildAiTelemetry } from '@/lib/ai/telemetry';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import { buildReferencedEntitiesBlock } from '@/lib/chat/entity-hydration';
import { resolveImportBioRestrictedTools } from '@/lib/chat/import-bio-turn-guard';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { extractLastUserText } from '@/lib/chat/message-text';
import {
  buildPinnedOpportunityBlock,
  type PinnedOpportunityContext,
} from '@/lib/chat/pinned-opportunity';
import {
  createStaticTextLanguageModel,
  detectSystemPromptLeak,
  isPromptDisclosureRequest,
  PROMPT_DISCLOSURE_REFUSAL,
  sanitizeAssistantResponse,
} from '@/lib/chat/prompt-disclosure-guard';
import { ONBOARDING_SYSTEM_PROMPT } from '@/lib/chat/prompts/onboarding';
import { resolveChatPromptRegistryEntry } from '@/lib/chat/prompts/registry';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import {
  isChatToolStepCapExhausted,
  resolveChatToolStepLimit,
} from '@/lib/chat/tool-step-limit';
import type {
  ArtistContext,
  ChatTelemetry,
  ReleaseContext,
} from '@/lib/chat/types';
import {
  CHAT_MODEL_LIGHT,
  resolveRotatedChatModel,
} from '@/lib/constants/ai-models';
import type { getEntitlements as GetEntitlements } from '@/lib/entitlements/registry';
import { startChatTurnLangfuseTrace } from '@/lib/observability/langfuse';

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
  aiCanUseTools: boolean,
  lastUserText?: string
): boolean {
  // Free-plan users don't have advanced tools — always use the light model
  if (!aiCanUseTools) return true;

  // Only consider light model for short conversations
  if (messages.length > 6) return false;

  const text = lastUserText ?? extractLastUserText(messages);
  if (!text) return false;

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
 * Collects the raw text of the most recent user turns (most-recent first),
 * preserving any `@kind:id[label]` entity tokens verbatim so the server can
 * resolve them. Used both for knowledge-context selection and entity hydration.
 */
export function recentUserTexts(uiMessages: UIMessage[], limit = 3): string[] {
  return [...uiMessages]
    .reverse()
    .filter(m => m.role === 'user')
    .slice(0, limit)
    .map(m =>
      (m.parts ?? [])
        .filter(
          (p): p is { type: 'text'; text: string } =>
            p.type === 'text' && typeof p.text === 'string'
        )
        .map(p => p.text)
        .join(' ')
    );
}

/**
 * Selects the music-industry knowledge context relevant to the recent
 * conversation. Uses the last 3 user turns so follow-up questions retain
 * context from earlier turns.
 */
export function selectKnowledgeContextForTurn(uiMessages: UIMessage[]): string {
  return selectKnowledgeContext(recentUserTexts(uiMessages).join(' '));
}

export interface ExecuteChatTurnInput {
  uiMessages: UIMessage[];
  /**
   * Required for `mode='app'` (authenticated artist chat). Ignored when
   * `mode='onboarding'` — the anonymous visitor has no creator profile yet.
   */
  artistContext: ArtistContext | null;
  releases: ReleaseContext[];
  /** Internal creator-profile UUID. Null when anonymous (`mode='onboarding'`). */
  resolvedProfileId: string | null;
  resolvedConversationId: string | null;
  /** Clerk user id. Null when anonymous (`mode='onboarding'`). */
  userId: string | null;
  userPlan: string;
  planLimits: EntitlementsForPlan;
  insightsEnabled: boolean;
  accountContext?: ChatAccountContext;
  forceLightModel: boolean;
  /**
   * 👎 model-rotation step for this conversation (JOV-3362 / #11461).
   * 0/undefined = default model. Positive values select the matching entry
   * in `CHAT_MODEL_ROTATION_CHAIN` (clamped server-side) so a disliked
   * response is retried on a different model. Never overrides the
   * light-model path (cost lever / onboarding stay on Haiku).
   */
  modelRotationStep?: number;
  /** Precomputed once per turn to avoid repeated message scans. */
  lastUserText?: string;
  /**
   * Plan-locked tool stubs present in `tools` this turn (GH #13304).
   * Drives the system-prompt section that instructs the model to explain
   * what it would produce + relay one upgrade line instead of erroring.
   */
  lockedTools?: readonly {
    readonly name: string;
    readonly label: string;
    readonly planRequired: string;
  }[];
  /**
   * Opportunity card pinned when the thread was opened from the inbox
   * (JOV-3933). Injected into the system prompt as ground truth.
   */
  pinnedOpportunity?: PinnedOpportunityContext | null;
  /**
   * Pre-built tools for the turn. The caller composes free + paid tool sets
   * based on plan and feature flags before invoking. For `mode='onboarding'`,
   * the caller passes the ONBOARDING_TOOLS palette.
   */
  tools: ToolSet;
  signal: AbortSignal;
  requestId: string;
  /** Telemetry hooks (Sentry in prod, no-op in eval/tests). */
  telemetry?: ChatTelemetry;
  /** Optional durable persistence hook for model stream failures. */
  onStreamError?: (error: unknown) => PromiseLike<void> | void;
  /**
   * Mode discriminator (JOV-2132). `'app'` is the existing authenticated
   * artist chat path; `'onboarding'` is the anonymous /start visitor flow
   * that uses the Stanley-style ONBOARDING_SYSTEM_PROMPT, skips knowledge
   * context, and never reads artistContext. Default `'app'` keeps existing
   * callers behaviour-stable.
   */
  mode?: 'app' | 'onboarding';
}

export interface ChatTurnFinishSignals {
  /** True when the model still wanted another tool round at the step cap. */
  readonly toolStepCapExhausted: boolean;
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
  /** Terminal signals populated as the model stream finishes. */
  readonly turnSignals: ChatTurnFinishSignals;
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
    accountContext,
    forceLightModel,
    modelRotationStep,
    lastUserText,
    lockedTools,
    pinnedOpportunity,
    tools,
    signal,
    requestId,
    resolvedProfileId,
    telemetry,
    onStreamError,
    mode = 'app',
  } = input;

  // Onboarding mode swaps in the Stanley-style prompt and skips the
  // music-industry knowledge context (which is keyed on the artist's profile,
  // not relevant pre-account). Authenticated `mode='app'` keeps the existing
  // buildSystemPrompt path so this refactor is behaviour-stable for in-app chat.
  let systemPrompt: string;
  if (mode === 'onboarding') {
    systemPrompt = ONBOARDING_SYSTEM_PROMPT;
  } else {
    // Runtime guard rather than a `as ArtistContext` cast — the type system
    // can't express "non-null when mode='app'" without a discriminated union,
    // and we'd rather fail fast at the entry than crash inside buildSystemPrompt.
    if (!artistContext) {
      throw new Error('artistContext is required when mode is "app"');
    }
    // Resolve `@kind:id[label]` entity tokens from the recent user turns against
    // the artist's own catalog (the same `releases` rows that feed the
    // right-rail entity panel) so the model recognises owned assets instead of
    // mis-attributing them to another artist (JOV-3537).
    const referencedEntities = buildReferencedEntitiesBlock({
      userTexts: recentUserTexts(uiMessages),
      ownedReleases: releases,
      artist: {
        displayName: artistContext.displayName,
        username: artistContext.username,
      },
    });
    const pinnedOpportunityBlock =
      buildPinnedOpportunityBlock(pinnedOpportunity);
    systemPrompt = buildSystemPrompt(artistContext, releases, {
      aiCanUseTools: planLimits.booleans.aiCanUseTools,
      aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
      insightsEnabled,
      knowledgeContext: selectKnowledgeContextForTurn(uiMessages) || undefined,
      accountContext,
      referencedEntities,
      pinnedOpportunity: pinnedOpportunityBlock,
      lockedTools,
    });
  }

  const modelMessages = await convertToModelMessages(uiMessages);

  // `forceLightModel` is the runtime lever (Statsig `ai_chat_force_light`)
  // that degrades the entire chat surface to the light model during a
  // provider incident, overriding the per-request heuristic. Intermediate
  // variable keeps the precedence explicit (|| binds tighter than ?:).
  const shouldUseLightModel =
    forceLightModel ||
    canUseLightModel(
      uiMessages,
      planLimits.booleans.aiCanUseTools,
      lastUserText
    );
  // 👎 rotation (JOV-3362 / #11461): a disliked response routes the next
  // turn to a different chain model. Light-model routing wins — it is the
  // incident cost lever and the free-plan/onboarding path.
  const selectedModel = shouldUseLightModel
    ? CHAT_MODEL_LIGHT
    : resolveRotatedChatModel(modelRotationStep);

  // Tag the request scope with chat-specific dimensions so all telemetry
  // events for this turn (errors, perf, breadcrumbs) are filterable
  // together. `chat_conversation_id` goes in `extra` (high cardinality);
  // `chat_has_tools` reflects the real plan capability boundary rather
  // than a count of always-on freeTools.
  telemetry?.setTags?.({
    chat_model: selectedModel,
    chat_force_light: String(forceLightModel),
    chat_model_rotation_step: String(modelRotationStep ?? 0),
    chat_has_tools: String(planLimits.booleans.aiCanUseTools),
  });
  if (resolvedConversationId) {
    telemetry?.setExtra?.(
      'chat_conversation_id',
      resolvedConversationId.slice(0, 120)
    );
  }

  const toolNames = Object.keys(tools).sort((a, b) => a.localeCompare(b));
  const toolStepLimit = resolveChatToolStepLimit(
    planLimits.booleans.aiCanUseTools
  );
  const turnSignals = { toolStepCapExhausted: false };

  const disclosureProbeText =
    lastUserText ?? extractLastUserText(uiMessages) ?? '';
  const blockedForDisclosure =
    disclosureProbeText.length > 0 &&
    isPromptDisclosureRequest(disclosureProbeText);

  const promptRegistry = resolveChatPromptRegistryEntry(mode);
  const langfuseTrace = await startChatTurnLangfuseTrace({
    requestId,
    conversationId: resolvedConversationId,
    userId,
    userPlan,
    mode,
    selectedModel,
    toolNames,
    promptRegistry,
    messageCount: uiMessages.length,
    blockedForDisclosure,
  });

  const rawStreamResult = streamText({
    model: blockedForDisclosure
      ? (createStaticTextLanguageModel(
          PROMPT_DISCLOSURE_REFUSAL
        ) as unknown as LanguageModel)
      : gateway(selectedModel),
    system: systemPrompt,
    messages: modelMessages,
    tools: blockedForDisclosure ? undefined : tools,
    stopWhen: blockedForDisclosure ? undefined : stepCountIs(toolStepLimit),
    prepareStep: blockedForDisclosure
      ? undefined
      : ({ steps, stepNumber }) => {
          const restrictedTools = resolveImportBioRestrictedTools(
            steps,
            stepNumber
          );
          if (restrictedTools) {
            return { activeTools: restrictedTools };
          }
          return {};
        },
    abortSignal: signal,
    experimental_telemetry: buildAiTelemetry({
      functionId: 'jovie-chat',
      identity: {
        userId,
        sessionId: resolvedConversationId,
      },
      metadata: {
        model: selectedModel,
        plan: userPlan,
        chatToolStepLimit: toolStepLimit,
      },
    }),
    onFinish: async ({ steps, text }) => {
      let promptLeakBlocked = false;
      if (!blockedForDisclosure && typeof text === 'string') {
        const sanitized = sanitizeAssistantResponse(text);
        if (sanitized.leaked) {
          promptLeakBlocked = true;
          telemetry?.setTags?.({
            chat_prompt_leak_blocked: 'true',
          });
          telemetry?.addBreadcrumb?.({
            category: 'ai-chat',
            message: 'chat_prompt_leak_blocked',
            level: 'warning',
            data: {
              requestId,
              conversationId: resolvedConversationId,
              profileId: resolvedProfileId,
              plan: userPlan,
              mode,
            },
          });
          await telemetry?.captureException?.(
            new Error('Assistant response matched system-prompt leak markers'),
            {
              tags: { feature: 'ai-chat', errorType: 'prompt_leak_blocked' },
              extra: {
                requestId,
                conversationId: resolvedConversationId,
                profileId: resolvedProfileId,
                leakedChars: text.length,
              },
            }
          );
        } else if (text.length > 0 && detectSystemPromptLeak(text)) {
          telemetry?.setTags?.({
            chat_prompt_leak_detected: 'true',
          });
        }
      }

      langfuseTrace.endSuccess({
        text: typeof text === 'string' ? text : undefined,
        stepCount: steps.length,
        leaked: promptLeakBlocked,
      });

      if (
        blockedForDisclosure ||
        !isChatToolStepCapExhausted(steps, toolStepLimit)
      ) {
        return;
      }

      turnSignals.toolStepCapExhausted = true;

      telemetry?.setTags?.({
        chat_tool_step_cap_exhausted: 'true',
      });
      telemetry?.setExtra?.('chat_tool_step_count', steps.length);
      telemetry?.setExtra?.('chat_tool_step_limit', toolStepLimit);
      telemetry?.addBreadcrumb?.({
        category: 'ai-chat',
        message: 'chat_tool_step_cap_exhausted',
        level: 'warning',
        data: {
          stepLimit: toolStepLimit,
          stepCount: steps.length,
          requestId,
          conversationId: resolvedConversationId,
          profileId: resolvedProfileId,
          plan: userPlan,
          mode,
        },
      });
    },
    onError: async ({ error }) => {
      if (isClientDisconnect(error, signal)) return;

      langfuseTrace.endError(error);

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
      await onStreamError?.(error);
    },
  });

  const streamResult = blockedForDisclosure
    ? rawStreamResult
    : wrapStreamResultWithLeakGuard(rawStreamResult);

  return {
    streamResult,
    selectedModel,
    systemPrompt,
    toolNames,
    modelMessages,
    turnSignals,
  };
}

function wrapStreamResultWithLeakGuard<T extends ReturnType<typeof streamText>>(
  streamResult: T
): T {
  if (!streamResult?.text) {
    return streamResult;
  }

  const sanitizedTextPromise = streamResult.text.then(
    text => sanitizeAssistantResponse(text).text
  );

  return Object.create(streamResult, {
    text: {
      value: sanitizedTextPromise,
    },
  }) as T;
}
