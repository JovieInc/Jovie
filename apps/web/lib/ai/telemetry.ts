/**
 * Shared Vercel AI SDK telemetry helpers for Agnost (via OpenTelemetry).
 *
 * Agnost reads `userId` and `sessionId` from span metadata — pass real
 * Clerk user ids and conversation/thread ids wherever available.
 */

export type AiTelemetryIdentity = {
  readonly userId?: string | null;
  readonly sessionId?: string | null;
};

export type AiTelemetryOptions = {
  readonly functionId: string;
  readonly identity?: AiTelemetryIdentity;
  readonly metadata?: Record<
    string,
    string | number | boolean | null | undefined
  >;
  readonly recordInputs?: boolean;
  readonly recordOutputs?: boolean;
};

export function buildAiTelemetry(options: AiTelemetryOptions) {
  const metadata: Record<string, string> = {};
  const { userId, sessionId } = options.identity ?? {};

  if (userId) metadata.userId = userId;
  if (sessionId) metadata.sessionId = sessionId;

  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    if (value != null) metadata[key] = String(value);
  }

  return {
    isEnabled: true,
    recordInputs: options.recordInputs ?? false,
    recordOutputs: options.recordOutputs ?? false,
    functionId: options.functionId,
    metadata,
  } as const;
}
