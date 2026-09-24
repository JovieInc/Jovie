import { afterEach, describe, expect, it, vi } from 'vitest';

const { withWorkflow } = vi.hoisted(() => ({
  withWorkflow: vi.fn(config => config),
}));
vi.mock('workflow/next', () => ({ withWorkflow }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Ovie deployment configuration', () => {
  it('compiles shared workflows while preserving the artist switch destination', async () => {
    vi.stubEnv('AGENT_OS_WORKFLOWS_ENABLED', 'false');
    const { default: config } = await import('./next.config.mjs');
    expect(withWorkflow).toHaveBeenCalledOnce();
    expect(config.output).toBe('standalone');
    const documents = config.outputFileTracingIncludes['/*'].filter(path =>
      path.startsWith('../../docs/')
    );
    expect(documents).toContain('../../docs/FEATURE_REGISTRY.md');
    expect(documents.every(path => !path.includes('*'))).toBe(true);
    expect(await config.redirects()).toContainEqual({
      source: '/app',
      destination: 'https://jov.ie/app',
      permanent: false,
    });
    for (const source of ['/support', '/legal/terms', '/legal/privacy']) {
      expect(await config.redirects()).toContainEqual({
        source,
        destination: `https://jov.ie${source}`,
        permanent: false,
      });
    }
  });

  it('rejects workflow activation before private-host callback authentication is verified', async () => {
    vi.stubEnv('AGENT_OS_WORKFLOWS_ENABLED', 'true');
    await expect(import('./next.config.mjs')).rejects.toThrow(
      'requires verified callback authentication'
    );
    expect(withWorkflow).not.toHaveBeenCalled();
  });
});
