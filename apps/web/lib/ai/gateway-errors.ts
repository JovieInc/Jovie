/**
 * Vercel AI Gateway error classification and provider retry (JOV-5856).
 *
 * Budget-exceeded is a hard wall on the gateway API key. Chat must not
 * surface the raw GatewayInternalServerError to users: retry the vetted
 * rotation chain, then show a calm fallback and a distinct alert.
 */

import { CHAT_MODEL_ROTATION_CHAIN } from '@/lib/constants/ai-models';

export const GATEWAY_BUDGET_EXCEEDED_ERROR_CODE = 'GATEWAY_BUDGET_EXCEEDED';

export const GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE =
  'Jovie is temporarily unavailable. Please try again in a moment.';

export const CHAT_STREAM_FAILED_ERROR_CODE = 'CHAT_STREAM_FAILED';

export const CHAT_STREAM_FAILED_USER_MESSAGE =
  'Jovie hit a temporary issue while processing your message. Please retry or send a simpler next step.';

interface GatewayLanguageModel {
  readonly specificationVersion?: string;
  readonly provider?: string;
  readonly modelId?: string;
  readonly supportedUrls?: unknown;
  doGenerate: (options: never) => Promise<unknown>;
  doStream: (options: never) => Promise<unknown>;
}

export interface GatewayRetryRotateEvent {
  readonly from: string;
  readonly to: string;
  readonly error: unknown;
}

export interface ChatStreamFailure {
  readonly errorCode: string;
  readonly userMessage: string;
  readonly errorMessage: string;
}

function readErrorString(
  error: unknown,
  key: 'name' | 'message' | 'code'
): string {
  if (typeof error === 'string' && key === 'message') {
    return error;
  }
  if (!error || typeof error !== 'object') {
    return '';
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function walkErrorChain(
  error: unknown,
  seen: Set<unknown> = new Set()
): unknown[] {
  if (error === undefined || error === null || seen.has(error)) {
    return [];
  }
  seen.add(error);
  const cause =
    error instanceof Error
      ? error.cause
      : error && typeof error === 'object'
        ? (error as { cause?: unknown }).cause
        : undefined;
  return [error, ...walkErrorChain(cause, seen)];
}

export function isGatewayBudgetExceededError(error: unknown): boolean {
  for (const candidate of walkErrorChain(error)) {
    const code = readErrorString(candidate, 'code');
    if (code === GATEWAY_BUDGET_EXCEEDED_ERROR_CODE) {
      return true;
    }
    const name = readErrorString(candidate, 'name');
    if (name === 'GatewayBudgetExceededError') {
      return true;
    }
    const message = readErrorString(candidate, 'message');
    if (/api key budget exceeded|budget exceeded/i.test(message)) {
      return true;
    }
  }
  return false;
}

export function isRetryableGatewayProviderError(error: unknown): boolean {
  if (isGatewayBudgetExceededError(error)) {
    return true;
  }
  for (const candidate of walkErrorChain(error)) {
    const name = readErrorString(candidate, 'name');
    if (
      /GatewayInternalServerError|GatewayRateLimitError|GatewayTimeoutError/i.test(
        name
      )
    ) {
      return true;
    }
    const message = readErrorString(candidate, 'message');
    if (
      /\b(overloaded|too many requests|rate limit|529|503)\b/i.test(message)
    ) {
      return true;
    }
  }
  return false;
}

export function toUserFacingGatewayError(error: unknown): Error {
  if (isGatewayBudgetExceededError(error)) {
    return Object.assign(new Error(GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE), {
      name: 'GatewayBudgetExceededError',
      code: GATEWAY_BUDGET_EXCEEDED_ERROR_CODE,
      cause: error,
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function classifyChatStreamFailure(error: unknown): ChatStreamFailure {
  if (isGatewayBudgetExceededError(error)) {
    return {
      errorCode: GATEWAY_BUDGET_EXCEEDED_ERROR_CODE,
      userMessage: GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
      errorMessage: GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
    };
  }
  return {
    errorCode: CHAT_STREAM_FAILED_ERROR_CODE,
    userMessage: CHAT_STREAM_FAILED_USER_MESSAGE,
    errorMessage:
      error instanceof Error ? error.message : 'The assistant stream failed.',
  };
}

export function resolveChatStreamErrorMessage(error: unknown): string {
  return classifyChatStreamFailure(error).userMessage;
}

/**
 * Selected model first, then the 👎 rotation chain (JOV-3362), de-duplicated.
 * Incident recovery may leave the light-model cost lever after the first try.
 */
export function buildGatewayRetryChain(
  selectedModel: string
): readonly string[] {
  const chain = [selectedModel];
  for (const candidate of CHAT_MODEL_ROTATION_CHAIN) {
    if (!chain.includes(candidate)) {
      chain.push(candidate);
    }
  }
  return chain;
}

function isGatewayLanguageModel(value: unknown): value is GatewayLanguageModel {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<GatewayLanguageModel>;
  return (
    typeof candidate.doStream === 'function' &&
    typeof candidate.doGenerate === 'function'
  );
}

async function invokeWithGatewayRetry<T>(input: {
  readonly models: readonly string[];
  readonly resolveModel: (modelId: string) => unknown;
  readonly invoke: (model: GatewayLanguageModel) => Promise<T>;
  readonly onRotate?: (event: GatewayRetryRotateEvent) => void;
}): Promise<T> {
  const { models, resolveModel, invoke, onRotate } = input;
  if (models.length === 0) {
    throw new Error('Gateway retry chain must include at least one model');
  }

  let lastError: unknown;
  for (let index = 0; index < models.length; index += 1) {
    const modelId = models[index];
    if (!modelId) continue;
    const resolved = resolveModel(modelId);
    if (!isGatewayLanguageModel(resolved)) {
      throw new Error(`Gateway model ${modelId} is not callable`);
    }
    try {
      return await invoke(resolved);
    } catch (error) {
      lastError = error;
      const nextModelId = models[index + 1];
      if (!nextModelId || !isRetryableGatewayProviderError(error)) {
        throw toUserFacingGatewayError(error);
      }
      onRotate?.({ from: modelId, to: nextModelId, error });
    }
  }

  throw toUserFacingGatewayError(lastError);
}

export function createRotatingGatewayLanguageModel(input: {
  readonly models: readonly string[];
  readonly resolveModel: (modelId: string) => unknown;
  readonly onRotate?: (event: GatewayRetryRotateEvent) => void;
}): GatewayLanguageModel {
  const models = input.models.filter(
    (modelId, index, all) =>
      modelId.length > 0 && all.indexOf(modelId) === index
  );
  const primaryModelId = models[0] ?? 'unknown';

  return {
    specificationVersion: 'v3',
    provider: 'jovie-gateway-rotate',
    modelId: primaryModelId,
    supportedUrls: Promise.resolve({}),
    doGenerate: options =>
      invokeWithGatewayRetry({
        models,
        resolveModel: input.resolveModel,
        invoke: model => model.doGenerate(options),
        onRotate: input.onRotate,
      }),
    doStream: options =>
      invokeWithGatewayRetry({
        models,
        resolveModel: input.resolveModel,
        invoke: model => model.doStream(options),
        onRotate: input.onRotate,
      }),
  };
}
