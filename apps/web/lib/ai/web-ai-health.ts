import 'server-only';

import { z } from 'zod';
import {
  gateway,
  generateObject,
  generateText,
  streamText,
} from '@/lib/ai/sdk';
import {
  CHAT_MODEL,
  GATEWAY_ALLOWED_MODELS,
  GATEWAY_ALLOWLIST_NAME,
  INSIGHT_MODEL,
  PACKAGING_INTELLIGENCE_MODEL,
  PITCH_MODEL,
  TITLE_MODEL,
} from '@/lib/constants/ai-models';

export const WEB_AI_HEALTH_RECEIPT_SCHEMA = 'jovie-web-ai-health/v1';

export const WEB_AI_HEALTH_PLACEHOLDER_SENTINELS = [
  'Done. What would you like to do next?',
] as const;

export type WebAiHealthSurface =
  | 'web_chat'
  | 'insights'
  | 'pitches'
  | 'titles'
  | 'packaging';

export type WebAiHealthFailureCause =
  | 'forbidden_model'
  | 'empty_stream'
  | 'placeholder_saved'
  | 'request_error';

export interface WebAiHealthProbeDefinition {
  readonly surface: WebAiHealthSurface;
  readonly model: string;
  readonly mode: 'stream' | 'text' | 'structured';
  readonly prompt: string;
}

export interface WebAiHealthProbeResult {
  readonly surface: WebAiHealthSurface;
  readonly model: string;
  readonly ok: boolean;
  readonly failureCause: WebAiHealthFailureCause | null;
  readonly message: string;
  readonly durationMs: number;
}

export interface WebAiHealthReceipt {
  readonly schema: typeof WEB_AI_HEALTH_RECEIPT_SCHEMA;
  readonly checkedAt: string;
  readonly environment: 'production';
  readonly status: 'passed' | 'failed';
  readonly signal: {
    readonly severity: 'high';
    readonly route: 'bug';
  };
  readonly gatewayAllowlist: {
    readonly name: string;
    readonly models: readonly string[];
  };
  readonly results: readonly WebAiHealthProbeResult[];
}

/**
 * Same object for every structured surface. A surface name in the prompt
 * made pitches diverge into a different object than insights and packaging.
 */
const STRUCTURED_HEALTH_PROMPT =
  'Return JSON {"response":"healthy"} and no other text.';

export const WEB_AI_HEALTH_PROBES: readonly WebAiHealthProbeDefinition[] = [
  {
    surface: 'web_chat',
    model: CHAT_MODEL,
    mode: 'stream',
    prompt: 'Production health check. Reply with only: healthy',
  },
  {
    surface: 'insights',
    model: INSIGHT_MODEL,
    mode: 'structured',
    prompt: STRUCTURED_HEALTH_PROMPT,
  },
  {
    surface: 'pitches',
    model: PITCH_MODEL,
    mode: 'structured',
    prompt: STRUCTURED_HEALTH_PROMPT,
  },
  {
    surface: 'titles',
    model: TITLE_MODEL,
    mode: 'text',
    prompt: 'Return only the one-word title: Healthy',
  },
  {
    surface: 'packaging',
    model: PACKAGING_INTELLIGENCE_MODEL,
    mode: 'structured',
    prompt: STRUCTURED_HEALTH_PROMPT,
  },
] as const;

const HEALTH_RESPONSE_MAX = 200;

const healthObjectSchema = z.object({
  response: z.string().min(1).max(HEALTH_RESPONSE_MAX),
});

const PROBE_TIMEOUT_MS = 30_000;
// GLM-5.3 always reasons, and Gateway counts reasoning against this ceiling.
// Keep the probe cheap while leaving enough room for final text/JSON output.
const PROBE_MAX_OUTPUT_TOKENS = 1_024;
// Structured JSON shares that ceiling with reasoning. 1,024 tokens let the
// pitches probe finish with no schema-valid object (JOV-8442) while the same
// model still answered the text probes. Match the insight generator ceiling.
const STRUCTURED_PROBE_MAX_OUTPUT_TOKENS = 4_096;

export type ExecuteWebAiHealthProbe = (
  definition: WebAiHealthProbeDefinition
) => Promise<unknown>;

function normalizeSentinel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/^["']|["']$/g, '')
    .replaceAll(/\s+/g, ' ');
}

function collectStringLeaves(value: unknown, depth = 0): string[] {
  if (typeof value === 'string') return [value];
  if (depth >= 4 || value === null || typeof value !== 'object') return [];

  if (value instanceof Error) {
    return [
      value.name,
      value.message,
      ...collectStringLeaves(value.cause, depth + 1),
    ];
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => collectStringLeaves(item, depth + 1));
  }

  return Object.values(value).flatMap(item =>
    collectStringLeaves(item, depth + 1)
  );
}

function noObjectFailureKind(message: string): string {
  if (message.includes('did not return a response')) return 'no_response';
  if (message.includes('could not parse')) return 'unparseable';
  if (message.includes('did not match schema')) return 'schema_mismatch';
  return 'object';
}

function errorFingerprint(error: unknown): string {
  if (!error || typeof error !== 'object') return typeof error;

  const candidate = error as {
    readonly name?: unknown;
    readonly message?: unknown;
    readonly status?: unknown;
    readonly statusCode?: unknown;
    readonly finishReason?: unknown;
  };
  const name =
    typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name.trim()
      : 'Error';
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === 'number' || typeof status === 'string') {
    return `${name}:${status}`;
  }
  if (name !== 'AI_NoObjectGeneratedError') return name;

  const message =
    typeof candidate.message === 'string' ? candidate.message : '';
  const finishReason =
    typeof candidate.finishReason === 'string' && candidate.finishReason.trim()
      ? candidate.finishReason.trim()
      : 'unknown';
  return `${name}:${noObjectFailureKind(message)}:${finishReason}`;
}

function isNoObjectGeneratedError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AI_NoObjectGeneratedError';
}

/**
 * Pull a short `response` string out of fenced or extra-field JSON.
 * Returns null when the model did not produce an object, so a real
 * structured-output failure still fails the probe. Model text never
 * leaves this function except as the repaired JSON the schema accepts.
 */
export function repairWebAiHealthObjectText(text: string): string | null {
  const withoutFence = text.replaceAll(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const preferred =
    typeof record.response === 'string' ? record.response : undefined;
  const fallback =
    preferred ??
    Object.values(record).find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0
    );
  if (typeof fallback !== 'string') return null;

  const response = fallback.trim().slice(0, HEALTH_RESPONSE_MAX);
  if (!response) return null;
  return JSON.stringify({ response });
}

function containsForbiddenSignal(value: unknown): boolean {
  if (
    value &&
    typeof value === 'object' &&
    ('status' in value || 'statusCode' in value)
  ) {
    const candidate = value as {
      readonly status?: unknown;
      readonly statusCode?: unknown;
    };
    if (candidate.status === 403 || candidate.statusCode === 403) return true;
  }

  return collectStringLeaves(value).some(text =>
    /\bforbidden\b|\bstatus(?: code)?\s*[:=]?\s*403\b|\bhttp\s*403\b/i.test(
      text
    )
  );
}

function classifyOutput(value: unknown): WebAiHealthFailureCause | null {
  if (containsForbiddenSignal(value)) return 'forbidden_model';

  const strings = collectStringLeaves(value);
  if (strings.every(text => text.trim().length === 0)) return 'empty_stream';

  const sentinels = new Set(
    WEB_AI_HEALTH_PLACEHOLDER_SENTINELS.map(normalizeSentinel)
  );
  if (strings.some(text => sentinels.has(normalizeSentinel(text)))) {
    return 'placeholder_saved';
  }

  return null;
}

function failureMessage(
  definition: WebAiHealthProbeDefinition,
  cause: WebAiHealthFailureCause,
  error?: unknown
): string {
  const prefix = `${definition.surface} (${definition.model})`;
  const allowlist = `gateway allowlist ${GATEWAY_ALLOWLIST_NAME}`;

  switch (cause) {
    case 'forbidden_model':
      return `${prefix}: model rejected as forbidden by ${allowlist}.`;
    case 'empty_stream':
      return `${prefix}: model stream completed without response content under ${allowlist}.`;
    case 'placeholder_saved':
      return `${prefix}: turn resolved to the saved placeholder sentinel under ${allowlist}.`;
    case 'request_error':
      return `${prefix}: production Gateway probe failed (${errorFingerprint(error)}) under ${allowlist}.`;
  }
}

export async function executeWebAiHealthProbe(
  definition: WebAiHealthProbeDefinition
): Promise<unknown> {
  const common = {
    model: gateway(definition.model),
    prompt: definition.prompt,
    temperature: 0,
    maxRetries: 0,
    maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
    reasoning: 'low',
    abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    experimental_telemetry: {
      functionId: `jovie-web-ai-health-${definition.surface}`,
    },
  } as const;

  if (definition.mode === 'stream') {
    const result = streamText(common);
    return result.text;
  }

  if (definition.mode === 'text') {
    const result = await generateText(common);
    return result.text;
  }

  const generateHealthObject = () =>
    generateObject({
      ...common,
      maxOutputTokens: STRUCTURED_PROBE_MAX_OUTPUT_TOKENS,
      schema: healthObjectSchema,
      schemaName: 'WebAiHealthSignal',
      schemaDescription:
        'One field, response, containing a short health status.',
      repairText: async ({ text }) => repairWebAiHealthObjectText(text),
    });

  try {
    const result = await generateHealthObject();
    return result.object.response;
  } catch (error) {
    // The first structured attempt can finish with reasoning and no object.
    // Transport and allowlist errors still fail immediately.
    if (!isNoObjectGeneratedError(error)) throw error;
    const result = await generateHealthObject();
    return result.object.response;
  }
}

export async function runWebAiHealth(input?: {
  readonly executeProbe?: ExecuteWebAiHealthProbe;
  readonly now?: () => Date;
}): Promise<WebAiHealthReceipt> {
  const executeProbe = input?.executeProbe ?? executeWebAiHealthProbe;
  const now = input?.now ?? (() => new Date());
  const checkedAt = now().toISOString();

  const results = await Promise.all(
    WEB_AI_HEALTH_PROBES.map(async definition => {
      const startedAt = Date.now();
      try {
        const output = await executeProbe(definition);
        const failureCause = classifyOutput(output);
        return {
          surface: definition.surface,
          model: definition.model,
          ok: failureCause === null,
          failureCause,
          message:
            failureCause === null
              ? `${definition.surface} (${definition.model}): non-empty production Gateway response.`
              : failureMessage(definition, failureCause),
          durationMs: Date.now() - startedAt,
        } satisfies WebAiHealthProbeResult;
      } catch (error) {
        const failureCause: WebAiHealthFailureCause = containsForbiddenSignal(
          error
        )
          ? 'forbidden_model'
          : 'request_error';
        return {
          surface: definition.surface,
          model: definition.model,
          ok: false,
          failureCause,
          message: failureMessage(definition, failureCause, error),
          durationMs: Date.now() - startedAt,
        } satisfies WebAiHealthProbeResult;
      }
    })
  );

  return {
    schema: WEB_AI_HEALTH_RECEIPT_SCHEMA,
    checkedAt,
    environment: 'production',
    status: results.every(result => result.ok) ? 'passed' : 'failed',
    signal: { severity: 'high', route: 'bug' },
    gatewayAllowlist: {
      name: GATEWAY_ALLOWLIST_NAME,
      models: GATEWAY_ALLOWED_MODELS,
    },
    results,
  };
}
