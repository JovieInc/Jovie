import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFactoryBrief } from './brief';
import {
  dryProviders,
  FIXTURE_PASS_VERDICT,
  fixtureTransport,
  liveProviders,
} from './providers';
import { fixtureCaptures } from './render-measurer';

const brief = loadFactoryBrief('solutions', 'founders');
const request = {
  stage: 'copy' as const,
  model: 'anthropic/claude-opus-5.5',
  system: 's',
  prompt: 'p',
  feedback: [],
  attempt: 1,
};

describe('dryProviders', () => {
  it('replays the brief fixtures with no network', async () => {
    const dry = dryProviders(brief);

    expect(dry.mode).toBe('dry');
    await expect(dry.generate(request)).resolves.toEqual({
      status: 'ok',
      value: brief.dry?.copy,
    });
    await expect(dry.measureRender('/x')).resolves.toEqual({
      status: 'ok',
      cls: 0,
      lcpMs: 1200,
      captures: fixtureCaptures('/x', { cls: 0, lcpMs: 1200 }),
    });
    expect(dry.label('openai/gpt-5.5')).toBe('fixture:openai/gpt-5.5');
    expect(dry.now().toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(dry.selectJudges('flagship', 'anthropic/claude-opus-5.5')).toEqual([
      'openai/gpt-5.5',
      'zai/glm-5.3',
    ]);
  });

  it('refuses to invent output when the brief has no dry block', async () => {
    const dry = dryProviders({ ...brief, dry: undefined });

    await expect(dry.generate(request)).resolves.toMatchObject({
      status: 'credentials-unavailable',
    });
    await expect(dry.measureRender('/x')).resolves.toMatchObject({
      status: 'credentials-unavailable',
    });
  });
});

describe('liveProviders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports credentials-unavailable for unreachable models and unwired providers', async () => {
    // A Codex binary that cannot run: image generation fails closed.
    vi.stubEnv('JOVIE_CODEX_BIN', '/nonexistent/codex');
    const live = liveProviders(null);

    await expect(live.generate(request)).resolves.toEqual({
      status: 'credentials-unavailable',
      reason: 'anthropic/claude-opus-5.5 is not reachable from this machine',
    });
    await expect(live.measureRender('/x')).resolves.toMatchObject({
      status: 'credentials-unavailable',
    });
    await expect(
      live.generateAsset({
        prompt: 'p',
        recipeId: 'editorial-illustration' as never,
        characterId: null,
        width: 1,
        height: 1,
        brief: 'b',
      })
    ).resolves.toMatchObject({ status: 'credentials-unavailable' });
    expect(live.label('openai/gpt-5.5')).toBe('openai/gpt-5.5');
  });

  it('reports the render measurer only when a production build is configured', () => {
    const saved = process.env.FACTORY_RENDER_BASE_URL;
    try {
      delete process.env.FACTORY_RENDER_BASE_URL;
      expect(liveProviders(null).capabilities.renderMeasurer).toBe(false);
      process.env.FACTORY_RENDER_BASE_URL = 'http://127.0.0.1:3100';
      expect(liveProviders(null).capabilities.renderMeasurer).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.FACTORY_RENDER_BASE_URL;
      else process.env.FACTORY_RENDER_BASE_URL = saved;
    }
  });

  it('parses the JSON a reachable model returns', async () => {
    const live = liveProviders(
      fixtureTransport(() => 'Sure: {"slots": []} done')
    );

    await expect(live.generate(request)).resolves.toEqual({
      status: 'ok',
      value: { slots: [] },
    });
    const bare = liveProviders(fixtureTransport(() => 'no json here'));
    await expect(bare.generate(request)).rejects.toThrow(/no JSON/);
  });

  it('fixture transport answers every model with a passing verdict', async () => {
    const transport = fixtureTransport();

    expect(transport.available?.('zai/glm-5.3')).toBe(true);
    await expect(
      transport({ model: 'zai/glm-5.3', system: '', prompt: '' })
    ).resolves.toBe(FIXTURE_PASS_VERDICT);
  });
});
