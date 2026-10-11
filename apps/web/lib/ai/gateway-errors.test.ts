import { GatewayInternalServerError } from '@ai-sdk/gateway';
import { describe, expect, it, vi } from 'vitest';

import {
  buildGatewayRetryChain,
  classifyChatStreamFailure,
  createRotatingGatewayLanguageModel,
  GATEWAY_BUDGET_EXCEEDED_ERROR_CODE,
  GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
  isGatewayBudgetExceededError,
  isRetryableGatewayProviderError,
  resolveChatStreamErrorMessage,
  toUserFacingGatewayError,
} from '@/lib/ai/gateway-errors';
import {
  CHAT_MODEL,
  CHAT_MODEL_LIGHT,
  CHAT_MODEL_ROTATION_CHAIN,
} from '@/lib/constants/ai-models';

function gatewayBudgetError(): Error {
  return Object.assign(
    new Error(
      'API key budget exceeded. Current spend: $1.05, limit: $1.00. Please contact your administrator to increase the budget.'
    ),
    { name: 'GatewayInternalServerError' }
  );
}

describe('isGatewayBudgetExceededError', () => {
  it('detects GatewayInternalServerError budget walls', () => {
    expect(isGatewayBudgetExceededError(gatewayBudgetError())).toBe(true);
  });

  it('detects nested causes and classified wrappers', () => {
    const wrapped = toUserFacingGatewayError(gatewayBudgetError());
    expect(isGatewayBudgetExceededError(wrapped)).toBe(true);
    expect(isGatewayBudgetExceededError({ cause: gatewayBudgetError() })).toBe(
      true
    );
  });

  it('does not treat a non-object failure as a budget wall', () => {
    expect(isGatewayBudgetExceededError('model not found')).toBe(false);
    expect(isGatewayBudgetExceededError(null)).toBe(false);
  });

  it('ignores unrelated provider failures', () => {
    expect(
      isGatewayBudgetExceededError(
        Object.assign(new Error('model not found'), {
          name: 'GatewayModelNotFoundError',
        })
      )
    ).toBe(false);
  });
});

describe('isRetryableGatewayProviderError', () => {
  it('retries budget walls and generic gateway 500s', () => {
    expect(isRetryableGatewayProviderError(gatewayBudgetError())).toBe(true);
    expect(
      isRetryableGatewayProviderError(
        Object.assign(new Error('internal'), {
          name: 'GatewayInternalServerError',
        })
      )
    ).toBe(true);
  });

  it('does not retry model-not-found', () => {
    expect(
      isRetryableGatewayProviderError(
        Object.assign(new Error('model not found'), {
          name: 'GatewayModelNotFoundError',
        })
      )
    ).toBe(false);
  });
});

describe('classifyChatStreamFailure', () => {
  it('replaces budget walls with a friendly fallback', () => {
    expect(classifyChatStreamFailure(gatewayBudgetError())).toEqual({
      errorCode: GATEWAY_BUDGET_EXCEEDED_ERROR_CODE,
      userMessage: GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
      errorMessage: GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
    });
    expect(resolveChatStreamErrorMessage(gatewayBudgetError())).toBe(
      GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE
    );
    expect(toUserFacingGatewayError(gatewayBudgetError()).message).toBe(
      GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE
    );
  });
});

describe('buildGatewayRetryChain', () => {
  it('keeps the selected model first and appends the rotation chain', () => {
    expect(buildGatewayRetryChain(CHAT_MODEL_LIGHT)).toEqual([
      CHAT_MODEL_LIGHT,
      ...CHAT_MODEL_ROTATION_CHAIN.filter(model => model !== CHAT_MODEL_LIGHT),
    ]);
    expect(buildGatewayRetryChain(CHAT_MODEL)).toEqual([
      ...CHAT_MODEL_ROTATION_CHAIN,
    ]);
  });
});

describe('createRotatingGatewayLanguageModel', () => {
  it('rotates to the next model after a budget wall', async () => {
    const onRotate = vi.fn();
    const haiku = {
      doGenerate: vi.fn(),
      doStream: vi.fn().mockRejectedValue(gatewayBudgetError()),
    };
    const gemini = {
      doGenerate: vi.fn(),
      doStream: vi.fn().mockResolvedValue({ stream: 'ok' }),
    };

    const rotating = createRotatingGatewayLanguageModel({
      models: [CHAT_MODEL_LIGHT, CHAT_MODEL],
      resolveModel: modelId => (modelId === CHAT_MODEL_LIGHT ? haiku : gemini),
      onRotate,
    });

    await expect(rotating.doStream({} as never)).resolves.toEqual({
      stream: 'ok',
    });
    expect(haiku.doStream).toHaveBeenCalledTimes(1);
    expect(gemini.doStream).toHaveBeenCalledTimes(1);
    expect(onRotate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CHAT_MODEL_LIGHT,
        to: CHAT_MODEL,
      })
    );
  });

  it('surfaces a friendly error after the chain is exhausted', async () => {
    const rotating = createRotatingGatewayLanguageModel({
      models: [CHAT_MODEL_LIGHT],
      resolveModel: () => ({
        doGenerate: vi.fn(),
        doStream: vi.fn().mockRejectedValue(gatewayBudgetError()),
      }),
    });

    await expect(rotating.doStream({} as never)).rejects.toMatchObject({
      name: 'GatewayBudgetExceededError',
      code: GATEWAY_BUDGET_EXCEEDED_ERROR_CODE,
      message: GATEWAY_BUDGET_EXCEEDED_USER_MESSAGE,
    });
  });
});

// Mirrors the production Gateway 402, including the transport body retained by
// the SDK as a cause. All model calls below are local mocks.
function gatewayInsufficientFundsError(): Error {
  const message =
    'A positive credit balance is required to use AI Gateway, including when using your own provider keys.';
  return new GatewayInternalServerError({
    message,
    statusCode: 402,
    cause: Object.assign(new Error(message), {
      name: 'AI_APICallError',
      url: 'https://ai-gateway.vercel.sh/v1/ai/language-model',
      requestBodyValues: {},
      statusCode: 402,
      responseBody: JSON.stringify({
        error: { type: 'insufficient_funds', message },
      }),
    }),
  });
}

const unavailableFailure = {
  errorCode: 'AI_UNAVAILABLE',
  userMessage: 'Jovie AI is currently unavailable. Please try again later.',
  errorMessage: 'Jovie AI is currently unavailable. Please try again later.',
};

describe('Gateway insufficient funds', () => {
  it.each([
    ['production SDK error', gatewayInsufficientFundsError()],
    ['provider code', { code: 'insufficient_funds' }],
    [
      'response data',
      { response: { data: { error: { type: 'insufficient_funds' } } } },
    ],
    [
      'prefixed serialized response',
      new Error('Error: ' + JSON.stringify({ errorCode: 'AI_UNAVAILABLE' })),
    ],
    [
      'Gateway 402 with opaque message',
      new GatewayInternalServerError({ statusCode: 402 }),
    ],
    [
      'no-output cause',
      new Error('No output generated', {
        cause: gatewayInsufficientFundsError(),
      }),
    ],
    ['stream callback', { error: gatewayInsufficientFundsError() }],
    [
      'stream error part',
      {
        type: 'error',
        error: { type: 'insufficient_funds', message: 'Unavailable' },
      },
    ],
    [
      'retry wrapper',
      { name: 'AI_RetryError', lastError: gatewayInsufficientFundsError() },
    ],
    [
      'retry errors',
      { errors: [new Error('Transient'), gatewayInsufficientFundsError()] },
    ],
    [
      'transport body',
      {
        responseBody: JSON.stringify({ error: { type: 'insufficient_funds' } }),
      },
    ],
    [
      'serialized response',
      new Error(JSON.stringify({ errorCode: 'AI_UNAVAILABLE' })),
    ],
    [
      'plain Gateway message',
      new Error('A positive credit balance is required to use AI Gateway.'),
    ],
  ])('fails fast and returns safe unavailable copy for %s', (_shape, error) => {
    expect(isRetryableGatewayProviderError(error)).toBe(false);
    expect(classifyChatStreamFailure(error)).toEqual(unavailableFailure);
    expect(resolveChatStreamErrorMessage(error)).toBe(
      unavailableFailure.userMessage
    );
    const safeError = toUserFacingGatewayError(error);
    expect(safeError).toMatchObject({
      name: 'GatewayInsufficientFundsError',
      code: unavailableFailure.errorCode,
      message: unavailableFailure.userMessage,
      cause: error,
    });
    expect(classifyChatStreamFailure(safeError)).toEqual(unavailableFailure);
  });

  it('handles cyclic and malformed wrappers without masking a real failure', () => {
    const error: Record<string, unknown> = {
      error: gatewayInsufficientFundsError(),
      responseBody: '{malformed',
    };
    error.cause = error;
    expect(classifyChatStreamFailure(error)).toEqual(unavailableFailure);
    expect(
      classifyChatStreamFailure({ responseBody: '{malformed' }).errorCode
    ).toBe('CHAT_STREAM_FAILED');
  });

  it.each(['doGenerate', 'doStream'] as const)(
    'does not resolve another model or rotate on %s',
    async method => {
      const first = { doGenerate: vi.fn(), doStream: vi.fn() };
      first[method].mockRejectedValue(gatewayInsufficientFundsError());
      const resolveModel = vi.fn(() => first);
      const onRotate = vi.fn();
      const rotating = createRotatingGatewayLanguageModel({
        models: [CHAT_MODEL, CHAT_MODEL_LIGHT],
        resolveModel,
        onRotate,
      });
      await expect(rotating[method]({} as never)).rejects.toMatchObject({
        code: unavailableFailure.errorCode,
        message: unavailableFailure.userMessage,
      });
      expect(first[method]).toHaveBeenCalledTimes(1);
      expect(resolveModel).toHaveBeenCalledTimes(1);
      expect(onRotate).not.toHaveBeenCalled();
    }
  );

  it('classifies an error received after streaming starts without rotating', async () => {
    const error = gatewayInsufficientFundsError();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'error', error });
        controller.close();
      },
    });
    const resolveModel = vi.fn(() => ({
      doGenerate: vi.fn(),
      doStream: vi.fn().mockResolvedValue({ stream }),
    }));
    const onRotate = vi.fn();
    const rotating = createRotatingGatewayLanguageModel({
      models: [CHAT_MODEL, CHAT_MODEL_LIGHT],
      resolveModel,
      onRotate,
    });
    const result = (await rotating.doStream({} as never)) as {
      stream: ReadableStream<{ type: string; error: unknown }>;
    };
    const part = await result.stream.getReader().read();
    expect(classifyChatStreamFailure(part.value)).toEqual(unavailableFailure);
    expect(resolveModel).toHaveBeenCalledTimes(1);
    expect(onRotate).not.toHaveBeenCalled();
  });

  it.each([
    new GatewayInternalServerError(),
    Object.assign(new Error('rate limited'), { name: 'GatewayRateLimitError' }),
    Object.assign(new Error('timeout'), { name: 'GatewayTimeoutError' }),
    new Error('provider overloaded'),
    gatewayBudgetError(),
    Object.assign(gatewayBudgetError(), { statusCode: 402 }),
  ])('preserves unrelated retryable failures', error => {
    expect(isRetryableGatewayProviderError(error)).toBe(true);
    expect(classifyChatStreamFailure(error).errorCode).not.toBe(
      unavailableFailure.errorCode
    );
  });

  it('does not misclassify unrelated payment or authentication errors', () => {
    for (const error of [
      Object.assign(new Error('Payment required'), { statusCode: 402 }),
      Object.assign(new Error('Unauthorized'), {
        name: 'GatewayAuthenticationError',
        statusCode: 401,
      }),
      new Error('No output generated'),
      null,
    ]) {
      expect(classifyChatStreamFailure(error).errorCode).toBe(
        'CHAT_STREAM_FAILED'
      );
      expect(isRetryableGatewayProviderError(error)).toBe(false);
    }
  });
});
