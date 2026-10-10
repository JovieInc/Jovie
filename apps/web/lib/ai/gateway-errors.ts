/**
 * Vercel AI Gateway error classification and provider retry (JOV-5856).
 *
 * Budget-exceeded is a hard wall on the gateway API key. Chat must not
 * surface the raw GatewayInternalServerError to users: retry the vetted
 * rotation chain, then show a calm fallback and a distinct alert.
 * Insufficient account funds affect every model on the same Gateway account:
 * fail fast instead of rotating (JOV-7953).
 */

import { CHAT_MODEL_ROTATION_CHAIN } from '@/lib/constants/ai-models';

export const GATEWAY_BUDGET_EXCEEDED_ERROR_CODE = 'GATEWAY_BUDGET_EXCEEDED';

export const GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE =
  'Jovie is temporarily unavailable. Please try again in a moment.';

// This public support code must not reveal the Gateway account funding state.
export const GATEWAY_INSUFFICIENT_FUNDS_ERROR_CODE = 'AI_UNAVAILABLE';

export const GATEWAY_INSUFFICIENT_FUNDS_USER_MESSAGE =
  'Jovie AI is currently unavailable. Please try again later.';

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
  key: 'name' | 'message' | 'code' | 'type' | 'errorCode'
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
  let cause: unknown;
  if (error instanceof Error) cause = error.cause;
  else if (error && typeof error === 'object') {
    cause = (error as { cause?: unknown }).cause;
  } else cause = undefined;
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

/** SDK causes, retry wrappers, stream events and serialized transport bodies. */
function* walkGatewayErrorDetails(error: unknown): Generator<unknown> {
  const pending = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (candidate == null || seen.has(candidate)) continue;
    seen.add(candidate);
    yield candidate;
    if (typeof candidate === 'string') {
      const serialized = candidate.trim().replace(/^Error:\s*/, '');
      if (!serialized.startsWith('{') && !serialized.startsWith('[')) continue;
      try {
        pending.push(JSON.parse(serialized));
      } catch {
        // Plain provider messages and malformed bodies are still classifiable.
      }
    } else if (Array.isArray(candidate)) {
      pending.push(...candidate);
    } else if (typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const key of [
        'cause',
        'error',
        'lastError',
        'errors',
        'responseBody',
        'response',
        'data',
        'message',
      ]) {
        pending.push(record[key]);
      }
    }
  }
}

export function isGatewayInsufficientFundsError(error: unknown): boolean {
  for (const candidate of walkGatewayErrorDetails(error)) {
    if (
      readErrorString(candidate, 'code') ===
        GATEWAY_INSUFFICIENT_FUNDS_ERROR_CODE ||
      readErrorString(candidate, 'errorCode') ===
        GATEWAY_INSUFFICIENT_FUNDS_ERROR_CODE ||
      readErrorString(candidate, 'name') === 'GatewayInsufficientFundsError' ||
      readErrorString(candidate, 'type') === 'insufficient_funds' ||
      readErrorString(candidate, 'code') === 'insufficient_funds'
    ) {
      return true;
    }
    const message = readErrorString(candidate, 'message');
    if (
      message === GATEWAY_INSUFFICIENT_FUNDS_USER_MESSAGE ||
      /\binsufficient[_ ]funds\b|\bpositive credit balance\b/i.test(message)
    ) {
      return true;
    }
    if (
      candidate &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>).statusCode === 402 &&
      /^Gateway.*Error$/.test(readErrorString(candidate, 'name')) &&
      !isGatewayBudgetExceededError(candidate)
    ) {
      // The SDK maps unknown Gateway types (including insufficient_funds) to
      // GatewayInternalServerError. A Gateway 402 is not a transient 500.
      return true;
    }
  }
  return false;
}

export function isRetryableGatewayProviderError(error: unknown): boolean {
  if (isGatewayInsufficientFundsError(error)) {
    return false;
  }
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
  if (isGatewayInsufficientFundsError(error)) {
    return Object.assign(new Error(GATEWAY_INSUFFICIENT_FUNDS_USER_MESSAGE), {
      name: 'GatewayInsufficientFundsError',
      code: GATEWAY_INSUFFICIENT_FUNDS_ERROR_CODE,
      isRetryable: false,
      cause: error,
    });
  }
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
  if (isGatewayInsufficientFundsError(error)) {
    return {
      errorCode: GATEWAY_INSUFFICIENT_FUNDS_ERROR_CODE,
      userMessage: GATEWAY_INSUFFICIENT_FUNDS_USER_MESSAGE,
      errorMessage: GATEWAY_INSUFFICIENT_FUNDS_USER_MESSAGE,
    };
  }
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
