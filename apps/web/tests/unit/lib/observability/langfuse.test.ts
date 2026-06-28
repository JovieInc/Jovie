import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
