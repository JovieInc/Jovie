import 'server-only';
import { createGateway, gateway as defaultGateway } from '@ai-sdk/gateway';
import * as ai from 'ai';
import { isOfferGuardedFeature } from '@/lib/billing/offer/guard';
import { getOfferGuardStrict } from '@/lib/billing/offer/kill-switch';
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
  setOfferGuardStrictProvider,
  wrapStreamObjectResult,
  wrapStreamTextOptions,
  wrapStreamTextResult,
} from '@/lib/eval/leak-guard';

// Braintrust removed (2026-07-02): calls go straight to the AI SDK. Keep the
// indirection so leak-guard wrapping stays in one place.
function getWrapped(): typeof ai {
  return ai;
}

// Offer kill switch: a failing live offer-truth check forces fixed templates.
setOfferGuardStrictProvider(getOfferGuardStrict);

/** Feature of a call: gateway `feature:` tag, else telemetry functionId. */
function callFeature(options: unknown): string | undefined {
  const o = (options ?? {}) as {
    providerOptions?: { gateway?: { tags?: unknown } };
    experimental_telemetry?: { functionId?: string };
  };
  const tags = o.providerOptions?.gateway?.tags;
  const tagged = Array.isArray(tags)
    ? tags.find(
        (t): t is string => typeof t === 'string' && t.startsWith('feature:')
      )
    : undefined;
  return (
    tagged?.slice('feature:'.length) ?? o.experimental_telemetry?.functionId
  );
}

function leakGuardContext(
  source: LeakGuardContext['source'],
  options?: unknown
): LeakGuardContext {
  const feature = callFeature(options);
  return {
    source,
    ...(feature ? { functionId: feature } : {}),
    offerGuard: isOfferGuardedFeature(feature),
  };
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

export const generateText: typeof ai.generateText = async (...args) => {
  const tagged = tagFirstArg(args);
  const result = await getWrapped().generateText(...tagged);
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateTextResult(
    result,
    leakGuardContext('generateText', tagged[0])
  );
};

export const streamText: typeof ai.streamText = ((...args) => {
  const taggedArgs = tagFirstArg(args);
  const context = leakGuardContext('streamText', taggedArgs[0]);
  const guardedArgs = isLeakGuardEnabled()
    ? ([
        wrapStreamTextOptions(taggedArgs[0], context),
        ...taggedArgs.slice(1),
      ] as typeof args)
    : taggedArgs;
  const result = getWrapped().streamText(...guardedArgs);

  if (!isLeakGuardEnabled()) {
    return result;
  }

  return wrapStreamTextResult(result, context);
}) as typeof ai.streamText;

export const generateObject: typeof ai.generateObject = async (...args) => {
  const tagged = tagFirstArg(args);
  const result = await getWrapped().generateObject(...tagged);
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateObjectResult(
    result,
    leakGuardContext('generateObject', tagged[0])
  );
};

export const streamObject: typeof ai.streamObject = (...args) => {
  const tagged = tagFirstArg(args);
  const context = leakGuardContext('streamObject', tagged[0]);
  const result = getWrapped().streamObject(...tagged);

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
  return getGatewayProvider()(modelId);
}) as GatewayModelSelector;

gatewaySelector.image = ((
  modelId: Parameters<GatewayModelSelector['image']>[0]
) => {
  assertGatewayImageModelAllowed(modelId);
  return getGatewayProvider().image(modelId);
}) as GatewayModelSelector['image'];

export const gateway: GatewayModelSelector = gatewaySelector;
