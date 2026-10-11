import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  vercelAIIntegration: vi.fn(() => ({ name: 'VercelAI' })),
}));
vi.mock('@sentry/nextjs', () => sdk);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.resetModules());
describe('Sentry runtime instrumentation', () => {
  it('does not install the unsupported Vercel AI integration on Edge', async () => {
    await import('../../../../sentry.edge.config');
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.vercelAIIntegration).not.toHaveBeenCalled();
    expect(sdk.init.mock.calls[0]?.[0].dataCollection.genAI).toEqual({
      inputs: false,
      outputs: false,
    });
  });
  it('retains Node AI instrumentation with explicit input/output privacy', async () => {
    await import('../../../../sentry.server.config');
    expect(sdk.vercelAIIntegration).toHaveBeenCalledWith({
      recordInputs: false,
      recordOutputs: false,
    });
    expect(sdk.init.mock.calls[0]?.[0].integrations).toEqual([
      { name: 'VercelAI' },
    ]);
    expect(sdk.init.mock.calls[0]?.[0].dataCollection.genAI).toEqual({
      inputs: false,
      outputs: false,
    });
  });
});
