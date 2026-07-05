/** Stable codes persisted on tool failure payloads and shown in chat UI. */
export const TOOL_ERROR_CODES = {
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  PLAN_UNAVAILABLE: 'PLAN_UNAVAILABLE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TOOL_UNAVAILABLE: 'TOOL_UNAVAILABLE',
  TOOL_UNPROVISIONED: 'TOOL_UNPROVISIONED',
  RATE_LIMITED: 'RATE_LIMITED',
  PROFILE_REQUIRED: 'PROFILE_REQUIRED',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
} as const;

export type ToolErrorCode =
  (typeof TOOL_ERROR_CODES)[keyof typeof TOOL_ERROR_CODES];

export interface ToolFailurePayload {
  readonly success: false;
  readonly error: string;
  readonly errorCode: ToolErrorCode;
  readonly retryable: boolean;
  readonly hint?: string;
}

export interface ToolFailurePresentation {
  readonly title: string;
  readonly body: string;
  readonly nextStep: string;
  readonly errorCode: ToolErrorCode;
  readonly recoverable: boolean;
}

const USER_COPY: Record<
  ToolErrorCode,
  {
    readonly body: string;
    readonly nextStep: string;
    readonly recoverable: boolean;
  }
> = {
  FEATURE_DISABLED: {
    body: 'This feature is not enabled for your workspace yet.',
    nextStep:
      'Try a different request or check back after your workspace is updated.',
    recoverable: true,
  },
  PLAN_UNAVAILABLE: {
    body: 'This action needs a paid Jovie plan.',
    nextStep:
      'Upgrade your plan or ask Jovie for a workaround you can do manually.',
    recoverable: true,
  },
  PROVIDER_UNAVAILABLE: {
    body: 'The service behind this action is temporarily unavailable.',
    nextStep: 'Retry in a few minutes or ask Jovie for an alternate approach.',
    recoverable: true,
  },
  TOOL_UNAVAILABLE: {
    body: 'This action is temporarily unavailable.',
    nextStep: 'Retry shortly or rephrase what you need help with.',
    recoverable: true,
  },
  TOOL_UNPROVISIONED: {
    body: 'This capability has not been provisioned for your account yet.',
    nextStep:
      'Ask Jovie for a manual workaround while provisioning catches up.',
    recoverable: true,
  },
  RATE_LIMITED: {
    body: 'You have hit the limit for this action.',
    nextStep: 'Wait a moment, then try again.',
    recoverable: true,
  },
  PROFILE_REQUIRED: {
    body: 'Jovie needs an artist profile before it can run this action.',
    nextStep: 'Refresh the page and try again once your profile has loaded.',
    recoverable: true,
  },
  TOOL_EXECUTION_FAILED: {
    body: 'Jovie could not finish this action.',
    nextStep: 'Retry or ask for a simpler next step.',
    recoverable: true,
  },
};

const RECOVERABLE_STREAM_ERROR_CODES = new Set<ToolErrorCode>([
  TOOL_ERROR_CODES.FEATURE_DISABLED,
  TOOL_ERROR_CODES.PLAN_UNAVAILABLE,
  TOOL_ERROR_CODES.PROVIDER_UNAVAILABLE,
  TOOL_ERROR_CODES.TOOL_UNAVAILABLE,
  TOOL_ERROR_CODES.TOOL_UNPROVISIONED,
  TOOL_ERROR_CODES.RATE_LIMITED,
  TOOL_ERROR_CODES.PROFILE_REQUIRED,
  TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asToolErrorCode(value: unknown): ToolErrorCode | undefined {
  if (typeof value !== 'string') return undefined;
  return Object.values(TOOL_ERROR_CODES).includes(value as ToolErrorCode)
    ? (value as ToolErrorCode)
    : undefined;
}

function inferErrorCodeFromMessage(message: string): ToolErrorCode {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('not provisioned') ||
    normalized.includes('unprovisioned')
  ) {
    return TOOL_ERROR_CODES.TOOL_UNPROVISIONED;
  }
  if (
    normalized.includes('requires a pro plan') ||
    normalized.includes('paid plan') ||
    normalized.includes('upgrade')
  ) {
    return TOOL_ERROR_CODES.PLAN_UNAVAILABLE;
  }
  if (
    normalized.includes('temporarily unavailable') ||
    normalized.includes('provider') ||
    normalized.includes('not configured')
  ) {
    return TOOL_ERROR_CODES.PROVIDER_UNAVAILABLE;
  }
  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many') ||
    normalized.includes('limit reached')
  ) {
    return TOOL_ERROR_CODES.RATE_LIMITED;
  }
  if (normalized.includes('profile id required')) {
    return TOOL_ERROR_CODES.PROFILE_REQUIRED;
  }
  if (
    normalized.includes('not enabled') ||
    normalized.includes('feature disabled')
  ) {
    return TOOL_ERROR_CODES.FEATURE_DISABLED;
  }

  return TOOL_ERROR_CODES.TOOL_EXECUTION_FAILED;
}

export function classifyThrownToolError(
  toolName: string,
  error: unknown
): ToolFailurePayload {
  const thrownCode =
    error instanceof Error ? (error as { code?: unknown }).code : undefined;
  const errorCodeFromThrown = asToolErrorCode(thrownCode);

  if (
    errorCodeFromThrown === TOOL_ERROR_CODES.PROVIDER_UNAVAILABLE ||
    thrownCode === 'XAI_API_KEY_MISSING'
  ) {
    return buildToolFailure({
      errorCode: TOOL_ERROR_CODES.PROVIDER_UNAVAILABLE,
      error: 'Album art generation is temporarily unavailable.',
      retryable: false,
      toolName,
    });
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Tool execution failed.';
  const code =
    error instanceof Error
      ? asToolErrorCode((error as { code?: unknown }).code)
      : undefined;

  return buildToolFailure({
    errorCode: code ?? inferErrorCodeFromMessage(message),
    error: message,
    retryable: code !== TOOL_ERROR_CODES.PLAN_UNAVAILABLE,
    toolName,
  });
}

export function buildToolFailure(input: {
  readonly toolName?: string;
  readonly errorCode: ToolErrorCode;
  readonly error?: string;
  readonly retryable?: boolean;
  readonly hint?: string;
}): ToolFailurePayload {
  const presentation = resolveToolFailurePresentation({
    toolName: input.toolName ?? 'tool',
    errorCode: input.errorCode,
    errorMessage: input.error,
    retryable: input.retryable,
  });

  return {
    success: false,
    errorCode: input.errorCode,
    error: presentation.body,
    retryable: input.retryable ?? presentation.recoverable,
    ...(input.hint ? { hint: input.hint } : {}),
  };
}

export function normalizeToolFailureOutput(
  toolName: string,
  output: unknown
): ToolFailurePayload | null {
  if (!isRecord(output) || output.success !== false) {
    return null;
  }

  const rawError =
    typeof output.error === 'string' && output.error.trim().length > 0
      ? output.error.trim()
      : typeof output.message === 'string' && output.message.trim().length > 0
        ? output.message.trim()
        : 'Tool execution failed.';

  const errorCode =
    asToolErrorCode(output.errorCode) ??
    asToolErrorCode(output.code) ??
    asToolErrorCode(output.reason) ??
    inferErrorCodeFromMessage(rawError);

  const retryable =
    typeof output.retryable === 'boolean'
      ? output.retryable
      : errorCode !== TOOL_ERROR_CODES.PLAN_UNAVAILABLE;

  return buildToolFailure({
    toolName,
    errorCode,
    error: rawError,
    retryable,
    hint: typeof output.hint === 'string' ? output.hint : undefined,
  });
}

export function resolveToolFailurePresentation(input: {
  readonly toolName: string;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly retryable?: boolean | null;
}): ToolFailurePresentation {
  const errorCode =
    asToolErrorCode(input.errorCode) ??
    inferErrorCodeFromMessage(input.errorMessage ?? '');
  const defaults = USER_COPY[errorCode];
  const body =
    input.errorMessage && input.errorMessage.trim().length > 0
      ? input.errorMessage.trim()
      : defaults.body;

  return {
    title: `Couldn't finish ${humanizeToolName(input.toolName)}`,
    body,
    nextStep: defaults.nextStep,
    errorCode,
    recoverable: input.retryable ?? defaults.recoverable,
  };
}

export function isRecoverableToolErrorCode(
  errorCode: string | undefined | null
): boolean {
  if (!errorCode) return false;
  return RECOVERABLE_STREAM_ERROR_CODES.has(errorCode as ToolErrorCode);
}

export function isRecoverableToolStreamError(error: Error): boolean {
  const code =
    typeof (error as { code?: unknown }).code === 'string'
      ? ((error as { code?: string }).code ?? undefined)
      : undefined;

  if (isRecoverableToolErrorCode(code)) {
    return true;
  }

  const message = error.message.toLowerCase();
  if (message.includes('tool') && message.includes('unavailable')) {
    return true;
  }
  if (
    message.includes('not provisioned') ||
    message.includes('unprovisioned')
  ) {
    return true;
  }

  return false;
}

function humanizeToolName(toolName: string): string {
  return toolName
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[-_]/g, ' ')
    .trim()
    .toLowerCase();
}
