import type { ChatPromptRegistryEntry } from '@/lib/chat/prompts/registry';

/**
 * Langfuse LLM tracing — async batched export to Langfuse Cloud.
 *
 * Reads `process.env` directly (not `env-server`) so this module stays loadable
 * from promptfoo eval harnesses that import `executeChatTurn`.
 *
 * @see https://langfuse.com/docs/sdk/typescript
 */

const DEFAULT_LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
/** Bounded export — observability sink must not hang chat turns. */
const LANGFUSE_REQUEST_TIMEOUT_MS = 10_000;

let langfuseClientPromise: Promise<import('langfuse').Langfuse | null> | null =
  null;

function readProcessEnv(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function shouldEnableLangfuse(): boolean {
  if (readProcessEnv('CI') === 'true') return false;
  if (
    readProcessEnv('NODE_ENV') === 'test' ||
    readProcessEnv('NEXT_PUBLIC_E2E_MODE') === '1'
  ) {
    return false;
  }

  if (
    !readProcessEnv('LANGFUSE_SECRET_KEY') ||
    !readProcessEnv('LANGFUSE_PUBLIC_KEY')
  ) {
    return false;
  }

  if (readProcessEnv('NODE_ENV') === 'development') {
    return readProcessEnv('JOVIE_ENABLE_LANGFUSE') === '1';
  }

  return true;
}

async function loadLangfuseClient(): Promise<
  import('langfuse').Langfuse | null
> {
  if (!shouldEnableLangfuse()) return null;

  if (!langfuseClientPromise) {
    langfuseClientPromise = (async () => {
      try {
        const { Langfuse } = await import('langfuse');
        return new Langfuse({
          secretKey: readProcessEnv('LANGFUSE_SECRET_KEY'),
          publicKey: readProcessEnv('LANGFUSE_PUBLIC_KEY'),
          baseUrl:
            readProcessEnv('LANGFUSE_BASE_URL') ?? DEFAULT_LANGFUSE_BASE_URL,
          flushAt: 15,
          flushInterval: 10_000,
          requestTimeout: LANGFUSE_REQUEST_TIMEOUT_MS,
          environment:
            readProcessEnv('VERCEL_ENV') ?? readProcessEnv('NODE_ENV'),
          release: readProcessEnv('NEXT_PUBLIC_BUILD_SHA'),
        });
      } catch (error) {
        console.warn('[langfuse] Client init failed:', error);
        return null;
      }
    })();
  }

  return langfuseClientPromise;
}

export type ChatTurnLangfuseInput = {
  readonly requestId: string;
  readonly conversationId: string | null;
  readonly userId: string | null;
  readonly userPlan: string;
  readonly mode: 'app' | 'onboarding';
  readonly selectedModel: string;
  readonly toolNames: readonly string[];
  readonly promptRegistry: ChatPromptRegistryEntry;
  readonly messageCount: number;
  readonly blockedForDisclosure: boolean;
};

export type ChatTurnLangfuseTrace = {
  endSuccess(output: {
    text?: string;
    stepCount?: number;
    leaked?: boolean;
  }): void;
  endError(error: unknown): void;
};

const noopTrace: ChatTurnLangfuseTrace = {
  endSuccess() {},
  endError() {},
};

/**
 * Opens session → request → chain → leaf spans for a chat turn.
 * Returns a no-op handle when Langfuse is disabled or init fails.
 */
export async function startChatTurnLangfuseTrace(
  input: ChatTurnLangfuseInput
): Promise<ChatTurnLangfuseTrace> {
  const client = await loadLangfuseClient();
  if (!client) return noopTrace;

  const sessionId = input.conversationId ?? input.requestId;
  const { promptRegistry } = input;

  const trace = client.trace({
    id: input.requestId,
    name: 'jovie-chat-session',
    sessionId,
    userId: input.userId ?? undefined,
    tags: [input.mode, input.userPlan],
    metadata: {
      requestId: input.requestId,
      conversationId: input.conversationId,
      mode: input.mode,
      plan: input.userPlan,
      prompt_version_id: promptRegistry.versionId,
    },
  });

  const requestSpan = trace.span({
    name: 'chat-turn-request',
    metadata: {
      requestId: input.requestId,
      messageCount: input.messageCount,
      blockedForDisclosure: input.blockedForDisclosure,
      prompt_version_id: promptRegistry.versionId,
    },
  });

  const chainSpan = requestSpan.span({
    name: 'jovie-chat-chain',
    metadata: {
      model: input.selectedModel,
      toolNames: input.toolNames,
      prompt_version_id: promptRegistry.versionId,
    },
  });

  const generation = chainSpan.generation({
    name: 'jovie-chat',
    model: input.selectedModel,
    metadata: {
      prompt_name: promptRegistry.name,
      prompt_version: promptRegistry.version,
      prompt_version_id: promptRegistry.versionId,
      toolCount: input.toolNames.length,
      blockedForDisclosure: input.blockedForDisclosure,
    },
  });

  return {
    endSuccess(output) {
      generation.end({
        output: output.text ? { text: output.text } : undefined,
        metadata: {
          stepCount: output.stepCount,
          prompt_leak_blocked: output.leaked ?? false,
        },
      });
      chainSpan.end();
      requestSpan.end();
      trace.update({
        output: output.text ? { text: output.text } : undefined,
        metadata: {
          stepCount: output.stepCount,
          prompt_leak_blocked: output.leaked ?? false,
        },
      });
    },
    endError(error) {
      const message =
        error instanceof Error ? error.message : 'Chat turn stream failed';
      generation.end({
        level: 'ERROR',
        statusMessage: message,
        metadata: { errorType: 'streaming' },
      });
      chainSpan.end({ level: 'ERROR', statusMessage: message });
      requestSpan.end({ level: 'ERROR', statusMessage: message });
      trace.update({
        metadata: { errorType: 'streaming', errorMessage: message },
      });
    },
  };
}
