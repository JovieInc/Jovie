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
      ...CHAT_MODEL_ROTATION_CHAIN,
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
      models: [CHAT_MODEL_LIGHT, CHAT_MODEL_ROTATION_CHAIN[1]!],
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
        to: CHAT_MODEL_ROTATION_CHAIN[1],
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
