import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateGateway, mockGatewayModel } = vi.hoisted(() => ({
  mockCreateGateway: vi.fn(),
  mockGatewayModel: vi.fn((modelId: string) => ({ __model: modelId })),
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: (...args: unknown[]) => mockCreateGateway(...args),
  gateway: vi.fn(),
}));

describe('lib/ai/sdk gateway routing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCreateGateway.mockReturnValue(mockGatewayModel);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses the default gateway when Helicone base URL is unset', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    delete process.env.HELICONE_GATEWAY_BASE_URL;
    delete process.env.HELICONE_API_KEY;

    const { gateway } = await import('@/lib/ai/sdk');
    const model = gateway('zai/glm-5.3-flash');

    expect(mockCreateGateway).toHaveBeenCalledWith({ apiKey: 'gateway-key' });
    expect(mockGatewayModel).toHaveBeenCalledWith('zai/glm-5.3-flash');
    expect(model).toEqual({
      __model: 'zai/glm-5.3-flash',
    });
  });

  it('routes through Helicone proxy when base URL is configured', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    process.env.HELICONE_GATEWAY_BASE_URL =
      'https://helicone-proxy.example.workers.dev/v1/ai';
    process.env.HELICONE_API_KEY = 'helicone-key';

    const { gateway } = await import('@/lib/ai/sdk');
    gateway('zai/glm-5.3');

    expect(mockCreateGateway).toHaveBeenCalledWith({
      apiKey: 'gateway-key',
      baseURL: 'https://helicone-proxy.example.workers.dev/v1/ai',
      headers: {
        'Helicone-Auth': 'Bearer helicone-key',
      },
    });
    expect(mockGatewayModel).toHaveBeenCalledWith('zai/glm-5.3');
  });

  it('omits Helicone auth header when API key is unset', async () => {
    process.env.HELICONE_GATEWAY_BASE_URL =
      'https://helicone-proxy.example.workers.dev/v1/ai';
    delete process.env.HELICONE_API_KEY;
    // Ambient Doppler/dev AI_GATEWAY_API_KEY must not leak into this case.
    delete process.env.AI_GATEWAY_API_KEY;

    const { gateway } = await import('@/lib/ai/sdk');
    gateway('zai/glm-5.3');

    expect(mockCreateGateway).toHaveBeenCalledWith({
      apiKey: undefined,
      baseURL: 'https://helicone-proxy.example.workers.dev/v1/ai',
      headers: undefined,
    });
  });

  it('fails closed for non-allowlisted Gateway models before network', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    delete process.env.HELICONE_GATEWAY_BASE_URL;

    const { gateway } = await import('@/lib/ai/sdk');
    expect(() => gateway('openai/gpt-5.5-pro')).toThrow(
      'gateway-allowlist:denied-model'
    );
    expect(() => gateway('openai/gpt-6-astra')).toThrow('openai/gpt-6-astra');
    expect(mockGatewayModel).not.toHaveBeenCalled();
  });
});
