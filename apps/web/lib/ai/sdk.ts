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

export const generateText: typeof ai.generateText = async (...args) => {
  const result = await getWrapped().generateText(...args);
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateTextResult(result, leakGuardContext('generateText'));
};

export const streamText: typeof ai.streamText = ((...args) => {
  const context = leakGuardContext('streamText');
  const guardedArgs = isLeakGuardEnabled()
    ? ([
        wrapStreamTextOptions(args[0], context),
        ...args.slice(1),
      ] as typeof args)
    : args;
  const result = getWrapped().streamText(...guardedArgs);

  if (!isLeakGuardEnabled()) {
    return result;
  }

  return wrapStreamTextResult(result, context);
}) as typeof ai.streamText;

export const generateObject: typeof ai.generateObject = async (...args) => {
  const result = await getWrapped().generateObject(...args);
  if (!isLeakGuardEnabled()) {
    return result;
  }

  return guardGenerateObjectResult(result, leakGuardContext('generateObject'));
};

export const streamObject: typeof ai.streamObject = (...args) => {
  const context = leakGuardContext('streamObject');
  const result = getWrapped().streamObject(...args);

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

/** Env-gated Vercel AI Gateway selector (optionally routed through Helicone proxy). */
export const gateway: GatewayModelSelector = ((...args) =>
  getGatewayProvider()(...args)) as GatewayModelSelector;
