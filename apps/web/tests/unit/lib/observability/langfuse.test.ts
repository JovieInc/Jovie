import { afterEach, describe, expect, it, vi } from 'vitest';

const langfuseMock = vi.hoisted(() => {
  const generationEnd = vi.fn();
  const ctor = vi.fn(function Langfuse() {
    return {
      trace: () => ({
        update: vi.fn(),
        span: () => ({
          end: vi.fn(),
          span: () => ({
            end: vi.fn(),
            generation: () => ({ end: generationEnd }),
          }),
        }),
      }),
    };
  });
  return { ctor, generationEnd };
});

vi.mock('langfuse', () => ({
  Langfuse: langfuseMock.ctor,
}));

describe('langfuse telemetry guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('disables export in CI', async () => {
    vi.stubEnv('CI', 'true');
    const { shouldEnableLangfuse } = await import(
      '@/lib/observability/langfuse'
    );
    expect(shouldEnableLangfuse()).toBe(false);
  });

  it('disables export in local dev unless explicitly enabled', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('JOVIE_ENABLE_LANGFUSE', '');
    const { shouldEnableLangfuse } = await import(
      '@/lib/observability/langfuse'
    );
    expect(shouldEnableLangfuse()).toBe(false);
  });

  it('disables export in local E2E runtime', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('JOVIE_ENABLE_LANGFUSE', '1');
    const { shouldEnableLangfuse } = await import(
      '@/lib/observability/langfuse'
    );
    expect(shouldEnableLangfuse()).toBe(false);
  });

  it('disables export when keys are missing', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const { shouldEnableLangfuse } = await import(
      '@/lib/observability/langfuse'
    );
    expect(shouldEnableLangfuse()).toBe(false);
  });

  it('enables export in production when keys are configured', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    const { shouldEnableLangfuse } = await import(
      '@/lib/observability/langfuse'
    );
    expect(shouldEnableLangfuse()).toBe(true);
  });

  it('returns a no-op trace handle when Langfuse is disabled', async () => {
    vi.stubEnv('CI', 'true');
    const { startChatTurnLangfuseTrace } = await import(
      '@/lib/observability/langfuse'
    );
    const trace = await startChatTurnLangfuseTrace({
      requestId: 'req-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      userPlan: 'pro',
      mode: 'app',
      selectedModel: 'anthropic/claude-sonnet-4',
      toolNames: ['update_display_name'],
      promptRegistry: {
        name: 'jovie-chat-app-system',
        version: 1,
        versionId: 'jovie-chat-app-system:v1',
      },
      messageCount: 2,
      blockedForDisclosure: false,
    });

    expect(() => trace.endSuccess({ text: 'ok', stepCount: 1 })).not.toThrow();
    expect(() => trace.endError(new Error('boom'))).not.toThrow();
  });

  it('builds one Langfuse client for repeated enabled traces', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    langfuseMock.ctor.mockClear();
    langfuseMock.generationEnd.mockClear();
    const { startChatTurnLangfuseTrace } = await import(
      '@/lib/observability/langfuse'
    );
    const input = {
      requestId: 'req-cache',
      conversationId: 'conv-cache',
      userId: 'user-1',
      userPlan: 'pro',
      mode: 'app' as const,
      selectedModel: 'anthropic/claude-sonnet-4',
      toolNames: ['update_display_name'],
      promptRegistry: {
        name: 'jovie-chat-app-system',
        version: 1,
        versionId: 'jovie-chat-app-system:v1',
      },
      messageCount: 2,
      blockedForDisclosure: false,
    };

    const first = await startChatTurnLangfuseTrace(input);
    const second = await startChatTurnLangfuseTrace({
      ...input,
      requestId: 'req-cache-2',
    });

    expect(langfuseMock.ctor).toHaveBeenCalledTimes(1);
    first.endSuccess({ text: 'kept', stepCount: 1 });
    expect(langfuseMock.generationEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { text: 'kept' },
      })
    );
    second.endSuccess({ text: 'again', stepCount: 2 });
    expect(langfuseMock.generationEnd).toHaveBeenCalledTimes(2);
  });
});
