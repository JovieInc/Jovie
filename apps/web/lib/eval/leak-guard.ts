import * as Sentry from '@sentry/nextjs';
import type { AsyncIterableStream } from 'ai';

import { toWhatwgReadableStream } from '@/lib/ai/stream-normalization';
import {
  detectSystemPromptLeak,
  PROMPT_DISCLOSURE_REFUSAL,
  PROMPT_LEAK_CANARY,
} from '@/lib/chat/prompt-disclosure-guard';

const LEAK_GUARD_DEFAULT_ENABLED = true;

const DISTINCTIVE_PROMPT_MARKERS: readonly string[] = [
  PROMPT_LEAK_CANARY,
  '## Voice (CRITICAL)',
  '## Music Industry Knowledge',
  '## Entity & Skill Tokens',
  '## Plan Limitations (Free Tier)',
  'Merch confirmation fence:',
  'You are Jovie, an AI music career assistant',
  '# How you sound',
  '# Diction rules',
  '## Security (CRITICAL',
  'ONBOARDING_SYSTEM_PROMPT',
];

const INSTRUCTION_ECHO_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/gi,
  /\b(?:system\s+prompt|developer\s+instructions?|hidden\s+instructions?)\b/gi,
  /\b(?:show|print|reveal|repeat|output|dump|display)\b[^.\n]{0,80}\b(?:system\s+prompt|hidden\s+prompt|developer\s+prompt|your\s+prompt|the\s+prompt|instructions?\s+above)\b/gi,
];

const FENCED_PROMPT_PATTERN =
  /```[\w-]*\n[\s\S]*?(?:You are Jovie|## Voice \(CRITICAL\)|jv-prompt-canary|## Music Industry Knowledge|## Security \(CRITICAL)[\s\S]*?```/gi;

const REDACTED_SPAN = '[REDACTED]';

export type LeakGuardAction = 'none' | 'redact' | 'fallback';

export type LeakGuardContext = {
  readonly source:
    | 'generateText'
    | 'streamText'
    | 'generateObject'
    | 'streamObject';
  readonly functionId?: string;
};

export type LeakGuardResult = {
  readonly text: string;
  readonly leaked: boolean;
  readonly action: LeakGuardAction;
  readonly matchedMarkers: readonly string[];
};

export type LeakGuardStructuredResult<T> = {
  readonly value: T;
  readonly leaked: boolean;
  readonly action: LeakGuardAction;
  readonly matchedMarkers: readonly string[];
};

/** Feature-flagged runtime output guard; default-on in production. */
export function isLeakGuardEnabled(): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return LEAK_GUARD_DEFAULT_ENABLED;
  }

  const envVal = process.env.FEATURE_AI_OUTPUT_LEAK_GUARD;
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return LEAK_GUARD_DEFAULT_ENABLED;
}

function collectMatchedMarkers(text: string): string[] {
  const matches = new Set<string>();
  const lower = text.toLowerCase();

  for (const marker of DISTINCTIVE_PROMPT_MARKERS) {
    if (lower.includes(marker.toLowerCase())) {
      matches.add(marker);
    }
  }

  for (const pattern of INSTRUCTION_ECHO_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.add(pattern.source);
    }
  }

  if (FENCED_PROMPT_PATTERN.test(text)) {
    FENCED_PROMPT_PATTERN.lastIndex = 0;
    matches.add('fenced_prompt_block');
  }

  return [...matches];
}

function redactLeakSpans(text: string): string {
  let redacted = text;

  for (const marker of DISTINCTIVE_PROMPT_MARKERS) {
    const pattern = new RegExp(escapeRegExp(marker), 'gi');
    redacted = redacted.replace(pattern, REDACTED_SPAN);
  }

  for (const pattern of INSTRUCTION_ECHO_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED_SPAN);
  }

  FENCED_PROMPT_PATTERN.lastIndex = 0;
  redacted = redacted.replace(FENCED_PROMPT_PATTERN, REDACTED_SPAN);

  return redacted;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldUseFallback(
  text: string,
  matchedMarkers: readonly string[]
): boolean {
  if (text.includes(PROMPT_LEAK_CANARY)) {
    return true;
  }

  if (detectSystemPromptLeak(text)) {
    return true;
  }

  return matchedMarkers.includes('fenced_prompt_block');
}

export function guardModelOutput(
  text: string,
  context?: LeakGuardContext
): LeakGuardResult {
  if (typeof text !== 'string') {
    return {
      text: '' as string,
      leaked: false,
      action: 'none',
      matchedMarkers: [],
    };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { text, leaked: false, action: 'none', matchedMarkers: [] };
  }

  const matchedMarkers = collectMatchedMarkers(text);
  if (matchedMarkers.length === 0) {
    return { text, leaked: false, action: 'none', matchedMarkers: [] };
  }

  if (shouldUseFallback(text, matchedMarkers)) {
    const result: LeakGuardResult = {
      text: PROMPT_DISCLOSURE_REFUSAL,
      leaked: true,
      action: 'fallback',
      matchedMarkers,
    };
    logLeakGuardEvent(result, context);
    return result;
  }

  const redacted = redactLeakSpans(text);
  const result: LeakGuardResult = {
    text: redacted,
    leaked: true,
    action: 'redact',
    matchedMarkers,
  };
  logLeakGuardEvent(result, context);
  return result;
}

export function guardStructuredValue<T>(
  value: T,
  context?: LeakGuardContext
): LeakGuardStructuredResult<T> {
  const matchedMarkers = new Set<string>();
  let leaked = false;
  let action: LeakGuardAction = 'none';

  const guarded = walkStructuredValue(value, current => {
    const result = guardModelOutput(current, context);
    if (result.leaked) {
      leaked = true;
      if (result.action === 'fallback') {
        action = 'fallback';
      } else if (action !== 'fallback') {
        action = 'redact';
      }
      for (const marker of result.matchedMarkers) {
        matchedMarkers.add(marker);
      }
    }
    return result.text;
  });

  if (!leaked) {
    return {
      value,
      leaked: false,
      action: 'none',
      matchedMarkers: [],
    };
  }

  return {
    value: guarded,
    leaked: true,
    action,
    matchedMarkers: [...matchedMarkers],
  };
}

function walkStructuredValue<T>(
  value: T,
  guardString: (text: string) => string
): T {
  if (typeof value === 'string') {
    return guardString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => walkStructuredValue(item, guardString)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => [key, walkStructuredValue(item, guardString)] as const
    );
    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function logLeakGuardEvent(
  result: Pick<LeakGuardResult, 'action' | 'matchedMarkers' | 'leaked'>,
  context?: LeakGuardContext
): void {
  if (!result.leaked) return;

  const payload = {
    event: 'ai_output_leak_guard',
    action: result.action,
    matchedMarkers: result.matchedMarkers,
    source: context?.source ?? 'unknown',
    functionId: context?.functionId,
  };

  console.warn(JSON.stringify(payload));

  try {
    Sentry.addBreadcrumb({
      category: 'ai-security',
      message: 'ai_output_leak_guard',
      level: 'warning',
      data: payload,
    });
  } catch {
    // fail-open: guard output even if telemetry sinks are unavailable
  }
}

function guardTextPromise(
  textPromise: PromiseLike<string>,
  context: LeakGuardContext
): Promise<string> {
  return Promise.resolve(textPromise).then(text => {
    if (typeof text !== 'string') {
      return text;
    }

    return guardModelOutput(text, context).text;
  });
}

function createGuardedTextStream(
  stream: AsyncIterableStream<string>,
  context: LeakGuardContext
): AsyncIterableStream<string> {
  let accumulated = '';
  let leakHandled = false;

  async function* generator(): AsyncGenerator<string> {
    for await (const delta of stream) {
      if (leakHandled) {
        continue;
      }

      accumulated += delta;
      const guarded = guardModelOutput(accumulated, context);
      if (guarded.leaked && guarded.action === 'fallback') {
        leakHandled = true;
        yield guarded.text;
        return;
      }

      yield delta;
    }

    if (!leakHandled && accumulated.length > 0) {
      const finalGuarded = guardModelOutput(accumulated, context);
      if (finalGuarded.leaked && finalGuarded.text !== accumulated) {
        yield finalGuarded.text;
      }
    }
  }

  // Normalize back to a genuine WHATWG ReadableStream: the AI SDK's
  // `createUIMessageStreamResponse` calls `stream.pipeThrough(...)`, which a
  // bare generator does not have (JOV-3694 / JOV-3693).
  return toWhatwgReadableStream(generator());
}

type TextDeltaChunk = {
  readonly type: 'text-delta';
  readonly id?: string;
  readonly text?: string;
  readonly delta?: string;
};

function isTextDeltaChunk(chunk: unknown): chunk is TextDeltaChunk {
  return (
    typeof chunk === 'object' &&
    chunk !== null &&
    'type' in chunk &&
    chunk.type === 'text-delta'
  );
}

function createGuardedDeltaStream<T>(
  stream: AsyncIterableStream<T>,
  context: LeakGuardContext
): AsyncIterableStream<T> {
  let accumulated = '';
  let leakHandled = false;

  async function* generator(): AsyncGenerator<T> {
    for await (const chunk of stream) {
      if (leakHandled) {
        continue;
      }

      if (isTextDeltaChunk(chunk)) {
        const delta = chunk.delta ?? chunk.text ?? '';
        accumulated += delta;
        const guarded = guardModelOutput(accumulated, context);
        if (guarded.leaked && guarded.action === 'fallback') {
          leakHandled = true;
          yield {
            ...chunk,
            ...(chunk.delta !== undefined
              ? { delta: guarded.text }
              : { text: guarded.text }),
          } as T;
          continue;
        }
      }

      yield chunk;
    }
  }

  // See createGuardedTextStream: keep the AsyncIterableStream contract whole
  // (ReadableStream + AsyncIterable) for `toUIMessageStreamResponse()`.
  return toWhatwgReadableStream(generator());
}

type StreamTextOptions = {
  onFinish?: (event: { text?: string } & Record<string, unknown>) => unknown;
};

export function wrapStreamTextOptions<OPTIONS>(
  options: OPTIONS | undefined,
  context: LeakGuardContext
): OPTIONS | undefined {
  if (!options || typeof options !== 'object') {
    return options;
  }

  const candidate = options as OPTIONS & StreamTextOptions;
  if (!candidate.onFinish) {
    return options;
  }

  const originalOnFinish = candidate.onFinish;

  return {
    ...options,
    onFinish: async (event: { text?: string } & Record<string, unknown>) => {
      const guarded =
        typeof event.text === 'string'
          ? guardModelOutput(event.text, context)
          : null;

      await originalOnFinish({
        ...event,
        ...(guarded ? { text: guarded.text } : {}),
      });
    },
  };
}

type StreamTextGuardableResult = {
  readonly text: PromiseLike<string>;
  readonly textStream: AsyncIterableStream<string>;
  readonly fullStream: AsyncIterableStream<unknown>;
  toUIMessageStream: (...args: unknown[]) => AsyncIterableStream<unknown>;
};

type StreamObjectGuardableResult = {
  readonly object: Promise<unknown>;
  readonly textStream: AsyncIterableStream<string>;
};

function hasStreamTextGuardSurface(
  result: Partial<StreamTextGuardableResult>
): result is StreamTextGuardableResult {
  return (
    result.text !== undefined &&
    result.textStream !== undefined &&
    result.fullStream !== undefined &&
    typeof result.toUIMessageStream === 'function'
  );
}

export function wrapStreamTextResult<TResult>(
  streamResult: TResult,
  context: LeakGuardContext
): TResult {
  const result = streamResult as TResult & Partial<StreamTextGuardableResult>;
  if (!hasStreamTextGuardSurface(result)) {
    return streamResult;
  }

  const guardedText = guardTextPromise(result.text, context);
  const guardedTextStream = createGuardedTextStream(result.textStream, context);
  const guardedFullStream = createGuardedDeltaStream(
    result.fullStream,
    context
  );
  const originalToUIMessageStream = result.toUIMessageStream.bind(result);

  return Object.create(result, {
    text: { value: guardedText },
    textStream: { value: guardedTextStream },
    fullStream: { value: guardedFullStream },
    toUIMessageStream: {
      value: (...args: unknown[]) =>
        createGuardedDeltaStream(originalToUIMessageStream(...args), context),
    },
  }) as TResult;
}

function hasStreamObjectGuardSurface(
  result: Partial<StreamObjectGuardableResult>
): result is StreamObjectGuardableResult {
  return result.object !== undefined && result.textStream !== undefined;
}

export function wrapStreamObjectResult<TResult>(
  streamResult: TResult,
  context: LeakGuardContext
): TResult {
  const result = streamResult as TResult & Partial<StreamObjectGuardableResult>;
  if (!hasStreamObjectGuardSurface(result)) {
    return streamResult;
  }

  const guardedObject = Promise.resolve(result.object).then(async object => {
    const guarded = guardStructuredValue(object, context);
    return guarded.value;
  });
  const guardedTextStream = createGuardedTextStream(result.textStream, context);

  return Object.create(result, {
    object: { value: guardedObject },
    textStream: { value: guardedTextStream },
  }) as TResult;
}
