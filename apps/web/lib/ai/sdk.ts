import 'server-only';
import { createGateway, gateway as defaultGateway } from '@ai-sdk/gateway';
import * as ai from 'ai';
import {
  type AiProviderName,
  createCreditFailoverModel,
  isAbortError,
} from '@/lib/ai/credit-failover';
import {
  type AiUsageLike,
  buildAiReceipt,
  emitAiReceipt,
} from '@/lib/ai/receipt';
import { isChatCall, routeForCall } from '@/lib/ai/routing';
import { withStreamStallGuard } from '@/lib/ai/stream-stall-guard';
import {
  isWorkersAiConfigured,
  workersAiLanguageModel,
} from '@/lib/ai/workers-ai';
import {
  assertGatewayImageModelAllowed,
  assertGatewayModelAllowed,
} from '@/lib/constants/ai-models';
import { env } from '@/lib/env-server';
import {
  guardModelOutput,
  guardStructuredValue,
  isLeakGuardEnabled,
  type LeakGuardContext,
  wrapStreamObjectResult,
  wrapStreamTextOptions,
  wrapStreamTextResult,
} from '@/lib/eval/leak-guard';

// Braintrust removed (2026-07-02): calls go straight to the AI SDK. Keep the
// indirection so leak-guard wrapping stays in one place.
function getWrapped(): typeof ai {
  return ai;
}

function leakGuardContext(
  source: LeakGuardContext['source']
): LeakGuardContext {
  return { source };
}

function guardGenerateTextResult<
  RESULT extends {
    readonly text: string;
  },
>(result: RESULT, context: LeakGuardContext): RESULT {
  const guarded = guardModelOutput(result.text, context);
  if (!guarded.leaked) {
    return result;
  }

  return Object.create(result, {
    text: { value: guarded.text },
  }) as RESULT;
}

function guardGenerateObjectResult<
  RESULT extends {
    readonly object: unknown;
  },
>(result: RESULT, context: LeakGuardContext): RESULT {
  const guarded = guardStructuredValue(result.object, context);
  if (!guarded.leaked) {
    return result;
  }

  return Object.create(result, {
    object: { value: guarded.value },
  }) as RESULT;
}

/** Tag on every call so Gateway spend (`/v1/report?group_by=tag`) splits by app. */
export const GATEWAY_APP_TAG = 'app:web';
/** Feature tag for a call site that set no `experimental_telemetry.functionId`. */
export const GATEWAY_UNTAGGED_FEATURE_TAG = 'feature:untagged';

type GatewayTaggableOptions = {
  readonly providerOptions?: Record<string, unknown>;
  readonly experimental_telemetry?: { readonly functionId?: string };
};

/**
 * Adds AI Gateway reporting tags (`feature:<functionId>` + `app:web`) to a
 * call's `providerOptions.gateway.tags`, keeping any tags the caller set.
 */
export function withGatewayReportingTags<OPTIONS extends object>(
  options: OPTIONS
): OPTIONS & { readonly providerOptions: Record<string, unknown> } {
  const taggable = options as GatewayTaggableOptions;
  const providerOptions = taggable.providerOptions ?? {};
  const gatewayOptions = (providerOptions.gateway ?? {}) as Record<
    string,
    unknown
  >;
  const callerTags = Array.isArray(gatewayOptions.tags)
    ? gatewayOptions.tags.filter(
        (tag): tag is string => typeof tag === 'string'
      )
    : [];
  const functionId = taggable.experimental_telemetry?.functionId;
  const hasFeatureTag = callerTags.some(tag => tag.startsWith('feature:'));
  const featureTags = hasFeatureTag
    ? []
    : [functionId ? `feature:${functionId}` : GATEWAY_UNTAGGED_FEATURE_TAG];
  const tags = [...new Set([...callerTags, ...featureTags, GATEWAY_APP_TAG])];

  return {
    ...options,
    providerOptions: {
      ...providerOptions,
      gateway: { ...gatewayOptions, tags },
    },
  };
}

function tagFirstArg<ARGS extends readonly [unknown, ...unknown[]]>(
  args: ARGS
): ARGS {
  const [options, ...rest] = args;
  return [
    withGatewayReportingTags(options as object),
    ...rest,
  ] as unknown as ARGS;
}

/**
 * Non-chat generate calls (classifiers, extractors, crons) default to low
 * reasoning: on glm-5.3-flash the provider default spent ~2.4k reasoning
 * tokens per request on Jovie_Production background jobs. A caller that sets
 * `reasoning` keeps it; chat-tagged calls are left on the provider default.
 */
export const BACKGROUND_REASONING_DEFAULT = 'low' as const;

function withBackgroundReasoning<ARGS extends readonly [unknown, ...unknown[]]>(
  args: ARGS
): ARGS {
  const [options, ...rest] = args;
  const call = options as GatewayTaggableOptions & { reasoning?: unknown };
  if (call.reasoning !== undefined) return args;
  if (isChatCall(callIdentity(call))) return args;
  return [
    { ...(options as object), reasoning: BACKGROUND_REASONING_DEFAULT },
    ...rest,
  ] as unknown as ARGS;
}

function callIdentity(call: GatewayTaggableOptions): {
  readonly functionId: string;
  readonly tags: readonly unknown[];
} {
  const tags = (call.providerOptions?.gateway as { tags?: unknown } | undefined)
    ?.tags;
  return {
    functionId: call.experimental_telemetry?.functionId ?? '',
    tags: Array.isArray(tags) ? tags : [],
  };
}

type RoutableCall = GatewayTaggableOptions & { model?: unknown };

function gatewayModelIdOf(model: unknown): string | undefined {
  if (typeof model === 'string') return model;
  const id = (model as { modelId?: unknown } | undefined)?.modelId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Background calls (everything that is not chat) go to Workers AI first and
 * fall back to the Gateway on any Workers error (routing.json). Chat stays
 * Gateway-first; its credit failover lives in the `gateway()` selector below.
 * Models without a Workers AI twin, custom wrappers (the chat rotation model)
 * and runs with no WORKERS_AI_TOKEN are returned untouched. `served` is filled
 * with the provider that answered, for the receipt.
 */
export function routeCallProvider<
  ARGS extends readonly [unknown, ...unknown[]],
>(args: ARGS, served: { provider?: AiProviderName }): ARGS {
  const [options, ...rest] = args;
  const call = options as RoutableCall;
  const identity = callIdentity(call);
  if (routeForCall(identity) !== 'workers-first') return args;
  const gatewayId = gatewayModelIdOf(call.model);
  if (!gatewayId || !isWorkersAiConfigured()) return args;
  const provider = (call.model as { provider?: unknown }).provider;
  if (typeof provider === 'string' && !provider.startsWith('gateway')) {
    return args;
  }
  const workers = workersAiLanguageModel(gatewayId);
  if (!workers) return args;
  const model = createCreditFailoverModel({
    label: identity.functionId || 'untagged',
    primary: { name: 'workers-ai', model: withStreamStallGuard(workers) },
    secondary: {
      name: 'gateway',
      model: withStreamStallGuard(getGatewayProvider()(gatewayId)),
    },
    shouldFailover: error => !isAbortError(error),
    served,
  });
  const providerOptions = (call.providerOptions ?? {}) as Record<
    string,
    unknown
  >;
  return [
    {
      ...(options as object),
      model,
      providerOptions: {
        ...providerOptions,
        workersAi: { reasoningEffort: BACKGROUND_REASONING_DEFAULT },
      },
    },
    ...rest,
  ] as unknown as ARGS;
}

function functionIdOf(options: unknown): string | undefined {
  return (options as GatewayTaggableOptions | undefined)?.experimental_telemetry
    ?.functionId;
}

/** Fire-and-forget receipt; never throws into the caller. */
function recordReceipt(
  functionId: string | undefined,
  usage: PromiseLike<AiUsageLike> | AiUsageLike | undefined,
  served: { provider?: AiProviderName } = {}
): void {
  Promise.resolve(usage)
    .then(u =>
      emitAiReceipt(buildAiReceipt(functionId, u, served.provider ?? 'gateway'))
    )
    .catch(() => undefined);
}

export const generateText: typeof ai.generateText = async (...args) => {
  const served: { provider?: AiProviderName } = {};
  const result = await getWrapped().generateText(
    ...routeCallProvider(withBackgroundReasoning(tagFirstArg(args)), served)
  );
  recordReceipt(functionIdOf(args[0]), result.totalUsage, served);
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateTextResult(result, leakGuardContext('generateText'));
};

export const streamText: typeof ai.streamText = ((...args) => {
  const context = leakGuardContext('streamText');
  const taggedArgs = tagFirstArg(args);
  const guardedArgs = isLeakGuardEnabled()
    ? ([
        wrapStreamTextOptions(taggedArgs[0], context),
        ...taggedArgs.slice(1),
      ] as typeof args)
    : taggedArgs;
  const served: { provider?: AiProviderName } = {};
  const result = getWrapped().streamText(
    ...routeCallProvider(guardedArgs, served)
  );
  recordReceipt(functionIdOf(args[0]), result.totalUsage, served);

  if (!isLeakGuardEnabled()) {
    return result;
  }

  return wrapStreamTextResult(result, context);
}) as typeof ai.streamText;

export const generateObject: typeof ai.generateObject = async (...args) => {
  const result = await getWrapped().generateObject(
    ...routeCallProvider(withBackgroundReasoning(tagFirstArg(args)), {})
  );
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateObjectResult(result, leakGuardContext('generateObject'));
};

export const streamObject: typeof ai.streamObject = (...args) => {
  const context = leakGuardContext('streamObject');
  const result = getWrapped().streamObject(
    ...routeCallProvider(tagFirstArg(args), {})
  );

  if (!isLeakGuardEnabled()) {
    return result;
  }

  return wrapStreamObjectResult(result, context);
};

export type * from 'ai';

type GatewayModelSelector = typeof defaultGateway;

let cachedGateway: GatewayModelSelector | null = null;

function resolveHeliconeGatewayHeaders(): Record<string, string> | undefined {
  const heliconeApiKey = env.HELICONE_API_KEY?.trim();
  if (!heliconeApiKey) {
    return undefined;
  }

  return {
    'Helicone-Auth': `Bearer ${heliconeApiKey}`,
  };
}

function getGatewayProvider(): GatewayModelSelector {
  if (!cachedGateway) {
    const heliconeBaseUrl = env.HELICONE_GATEWAY_BASE_URL?.trim();
    const apiKey = env.AI_GATEWAY_API_KEY?.trim();

    cachedGateway = heliconeBaseUrl
      ? createGateway({
          apiKey,
          baseURL: heliconeBaseUrl,
          headers: resolveHeliconeGatewayHeaders(),
        })
      : createGateway(apiKey ? { apiKey } : undefined);
  }

  return cachedGateway;
}

/**
 * Env-gated Vercel AI Gateway selector (optionally routed through Helicone proxy).
 *
 * `gateway(id)` selects a language model. `gateway.image(id)` selects an image
 * model on the same provider instance, so image calls use the same API key or
 * Vercel OIDC fallback and the same optional Helicone base URL.
 */
const gatewaySelector = ((modelId: string) => {
  // JOV-7119 + JOV-8109: the gateway is a strict fail-closed allowlist —
  // OpenAI/Anthropic are banned outright and anything off
  // GATEWAY_ALLOWED_MODELS throws before it can bill per-token.
  assertGatewayModelAllowed(modelId);
  // Bounded first-chunk/idle time: a provider that accepts the call and then
  // goes silent must fail (and fail over) instead of leaving the turn open.
  const gatewayModel = withStreamStallGuard(getGatewayProvider()(modelId));
  // Credits can never be a single point of failure: if the Gateway reports
  // insufficient funds or a spent key budget, replay the call on the Workers AI
  // twin of the same model (routing.json). No token or no twin: unchanged.
  const workersTwin = workersAiLanguageModel(modelId);
  const workers = workersTwin ? withStreamStallGuard(workersTwin) : undefined;
  if (!workers) return gatewayModel;
  return createCreditFailoverModel({
    label: 'gateway',
    primary: { name: 'gateway', model: gatewayModel },
    secondary: { name: 'workers-ai', model: workers },
  });
}) as GatewayModelSelector;

gatewaySelector.image = ((
  modelId: Parameters<GatewayModelSelector['image']>[0]
) => {
  assertGatewayImageModelAllowed(modelId);
  return getGatewayProvider().image(modelId);
}) as GatewayModelSelector['image'];

export const gateway: GatewayModelSelector = gatewaySelector;
