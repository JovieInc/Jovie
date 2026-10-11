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
    const model = gateway('zai/glm-5.3');

    expect(mockCreateGateway).toHaveBeenCalledWith({ apiKey: 'gateway-key' });
    expect(mockGatewayModel).toHaveBeenCalledWith('zai/glm-5.3');
    expect(model).toEqual({
      __model: 'zai/glm-5.3',
    });
  });

  it('fails fast on banned openai/anthropic model ids (JOV-7119)', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    const { gateway } = await import('@/lib/ai/sdk');

    expect(() => gateway('openai/gpt-6-sol')).toThrow(/banned provider/);
    expect(() => gateway('anthropic/claude-haiku-4-5-20251001')).toThrow(
      /banned provider/
    );
    expect(mockGatewayModel).not.toHaveBeenCalled();
  });

  it('fails fast on banned image model ids (JOV-7119)', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    const image = vi.fn((modelId: string) => ({ __image: modelId }));
    const provider = Object.assign(
      vi.fn((modelId: string) => ({ __model: modelId })),
      { image }
    );
    mockCreateGateway.mockReturnValue(provider);

    const { gateway } = await import('@/lib/ai/sdk');
    expect(() => gateway.image('openai/gpt-image-1.5')).toThrow(
      /banned provider/
    );
    expect(image).not.toHaveBeenCalled();
  });

  it('routes through Helicone proxy when base URL is configured', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    process.env.HELICONE_GATEWAY_BASE_URL =
      'https://helicone-proxy.example.workers.dev/v1/ai';
    process.env.HELICONE_API_KEY = 'helicone-key';

    const { gateway } = await import('@/lib/ai/sdk');
    gateway('zai/glm-5.3-flash');

    expect(mockCreateGateway).toHaveBeenCalledWith({
      apiKey: 'gateway-key',
      baseURL: 'https://helicone-proxy.example.workers.dev/v1/ai',
      headers: {
        'Helicone-Auth': 'Bearer helicone-key',
      },
    });
    expect(mockGatewayModel).toHaveBeenCalledWith('zai/glm-5.3-flash');
  });

  it('omits Helicone auth header when API key is unset', async () => {
    process.env.HELICONE_GATEWAY_BASE_URL =
      'https://helicone-proxy.example.workers.dev/v1/ai';
    delete process.env.HELICONE_API_KEY;
    // Ambient Doppler/dev AI_GATEWAY_API_KEY must not leak into this case.
    delete process.env.AI_GATEWAY_API_KEY;

    const { gateway } = await import('@/lib/ai/sdk');
    gateway('zai/glm-5.3-flash');

    expect(mockCreateGateway).toHaveBeenCalledWith({
      apiKey: undefined,
      baseURL: 'https://helicone-proxy.example.workers.dev/v1/ai',
      headers: undefined,
    });
  });

  it('routes image models through the same gateway provider', async () => {
    process.env.AI_GATEWAY_API_KEY = 'gateway-key';
    delete process.env.HELICONE_GATEWAY_BASE_URL;
    const image = vi.fn((modelId: string) => ({ __image: modelId }));
    const provider = Object.assign(
      vi.fn((modelId: string) => ({ __model: modelId })),
      { image }
    );
    mockCreateGateway.mockReturnValue(provider);

    const { gateway } = await import('@/lib/ai/sdk');
    const model = gateway.image('spacexai/grok-imagine-image');

    expect(mockCreateGateway).toHaveBeenCalledWith({ apiKey: 'gateway-key' });
    expect(image).toHaveBeenCalledWith('spacexai/grok-imagine-image');
    expect(model).toEqual({ __image: 'spacexai/grok-imagine-image' });
  });
});
