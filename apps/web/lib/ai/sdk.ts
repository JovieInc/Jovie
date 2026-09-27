import 'server-only';
import { createGateway, gateway as defaultGateway } from '@ai-sdk/gateway';
import * as ai from 'ai';

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
export function withGatewayReportingTags<OPTIONS>(options: OPTIONS): OPTIONS {
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
  return [withGatewayReportingTags(options), ...rest] as unknown as ARGS;
}

export const generateText: typeof ai.generateText = async (...args) => {
  const result = await getWrapped().generateText(...tagFirstArg(args));
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
  const result = getWrapped().streamText(...guardedArgs);

  if (!isLeakGuardEnabled()) {
    return result;
  }

  return wrapStreamTextResult(result, context);
}) as typeof ai.streamText;

export const generateObject: typeof ai.generateObject = async (...args) => {
  const result = await getWrapped().generateObject(...tagFirstArg(args));
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateObjectResult(result, leakGuardContext('generateObject'));
};

export const streamObject: typeof ai.streamObject = (...args) => {
  const context = leakGuardContext('streamObject');
  const result = getWrapped().streamObject(...tagFirstArg(args));

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
const gatewaySelector = ((...args: Parameters<GatewayModelSelector>) =>
  getGatewayProvider()(...args)) as GatewayModelSelector;

gatewaySelector.image = ((
  modelId: Parameters<GatewayModelSelector['image']>[0]
) => getGatewayProvider().image(modelId)) as GatewayModelSelector['image'];

export const gateway: GatewayModelSelector = gatewaySelector;
