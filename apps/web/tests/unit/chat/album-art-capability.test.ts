import { readFileSync } from 'node:fs';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  buildAlbumArtUnavailableAssistantMessage,
  detectAlbumArtGenerationIntent,
  filterSkillsHidingBrokenAlbumArt,
  resolveAlbumArtCapability,
  shouldHideAlbumArtChatSuggestion,
} from '@/lib/chat/album-art-capability';
import { commandsForSurface } from '@/lib/commands/registry';

describe('album art capability resolution', () => {
  it('marks album art unavailable when the provider is not configured', () => {
    const capability = resolveAlbumArtCapability({
      featureEnabled: true,
      providerConfigured: false,
      entitlements: {
        canGenerateAlbumArt: true,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    expect(capability).toEqual({
      availability: 'unavailable',
      reason: 'Album art generation is temporarily unavailable.',
      reasonCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('preflights typed generation requests but lets brief drafting through', () => {
    expect(
      detectAlbumArtGenerationIntent({
        text: 'Generate album art for my latest release.',
      })
    ).toBe(true);
    expect(
      detectAlbumArtGenerationIntent({
        text: 'Draft an album-art brief for my latest release.',
      })
    ).toBe(false);
  });

  it('hides chat suggestions when provider is unavailable or feature is disabled', () => {
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation is temporarily unavailable.',
        reasonCode: 'PROVIDER_UNAVAILABLE',
      })
    ).toBe(true);
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation is not enabled for this workspace.',
        reasonCode: 'FEATURE_DISABLED',
      })
    ).toBe(true);
    expect(
      shouldHideAlbumArtChatSuggestion({
        availability: 'unavailable',
        reason: 'Album art generation requires the Artist Presence plan.',
        reasonCode: 'PLAN_UNAVAILABLE',
      })
    ).toBe(false);
  });

  it('filters generateAlbumArt from slash/cmdk skills when provider is broken', () => {
    const skills = commandsForSurface('chat-slash').filter(
      command => command.kind === 'skill'
    );
    const filtered = filterSkillsHidingBrokenAlbumArt(skills, {
      availability: 'unavailable',
      reason: 'Album art generation is temporarily unavailable.',
      reasonCode: 'PROVIDER_UNAVAILABLE',
    });

    expect(filtered.some(skill => skill.id === 'generateAlbumArt')).toBe(false);
    expect(filtered.length).toBe(skills.length - 1);
  });

  it('builds a durable assistant recovery message', () => {
    expect(
      buildAlbumArtUnavailableAssistantMessage({
        availability: 'unavailable',
        reason: 'Album art generation is temporarily unavailable.',
        reasonCode: 'PROVIDER_UNAVAILABLE',
      })
    ).toContain('draft a cover concept');
  });
});

const routeFixture = vi.hoisted(() => ({ source: null as string | null }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (
        routeFixture.source !== null &&
        String(args[0]).endsWith('/app/api/chat/route.ts')
      ) {
        return routeFixture.source;
      }
      return actual.readFileSync(...args);
    },
  };
});

const currentRoute = readFileSync(
  new URL('../../../app/api/chat/route.ts', import.meta.url),
  'utf8'
);

describe('album art deterministic provider-order contract', () => {
  interface ContractProvider {
    callApi(
      prompt: string,
      context: { vars: { target: string } }
    ): Promise<{ output?: unknown }>;
  }
  let provider: ContractProvider;
  const guard = 'if (!isAlbumArtGatewayConfigured()) {}';
  const lookup = `const target = await resolveAlbumArtReleaseTarget(
    params.profileId, params.releases, {});`;
  const burst =
    'const burstLimit = await albumArtGenerationBurstLimiter.limit();';
  const daily = 'const dailyLimit = await albumArtGenerationLimiter.limit();';
  const generation = 'const generated = await generateAlbumArtBackgrounds();';

  beforeAll(async () => {
    for (const flag of [
      'JOVIE_RUN_LIVE_EVALS',
      'JOVIE_RUN_LIVE_HTTP_EVALS',
      'JOVIE_RUN_LIVE_HTTP_RATE_LIMIT_EVALS',
      'JOVIE_RUN_LIVE_HTTP_MODEL_ERROR_EVALS',
    ])
      vi.stubEnv(flag, '0');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('network disabled in source contract test')
    );
    // Application test types exclude these standalone eval scripts.
    const { default: Provider } = await vi.importActual<{
      default: new () => ContractProvider;
    }>('../../eval/promptfoo/jovie-chat-provider');
    provider = new Provider();
  });
  afterEach(() => {
    routeFixture.source = null;
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function facts(source: string) {
    routeFixture.source = source;
    const response = await provider.callApi('', {
      vars: { target: 'album-art-provider-contract' },
    });
    const payload = JSON.parse(String(response.output)) as {
      route: { facts: Record<string, boolean> };
      modelCalled: boolean;
      persistenceAttempted: boolean;
      dbAttempted: boolean;
      networkAttempted: boolean;
    };
    expect(payload).toMatchObject({
      modelCalled: false,
      persistenceAttempted: false,
      dbAttempted: false,
      networkAttempted: false,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    return payload.route.facts;
  }

  it.each([currentRoute, currentRoute.replaceAll('        ', '\t')])(
    'recognizes the actual awaited owned lookup across indentation',
    async source => {
      expect(
        (await facts(source)).checksProviderBeforeReleaseFetchAndRateLimits
      ).toBe(true);
    }
  );

  it.each([
    ['missing provider check', [lookup, burst, daily, generation]],
    ['provider check after lookup', [lookup, guard, burst, daily, generation]],
    [
      'missing input object',
      [guard, lookup.replace(', {}', ', undefined'), burst, daily, generation],
    ],
    [
      'unawaited lookup',
      [guard, lookup.replace('await ', ''), burst, daily, generation],
    ],
    [
      'wrong ownership argument',
      [
        guard,
        lookup.replace('params.profileId', 'params.otherProfileId'),
        burst,
        daily,
        generation,
      ],
    ],
    [
      'missing ownership argument',
      [
        guard,
        lookup.replace('params.profileId,', ''),
        burst,
        daily,
        generation,
      ],
    ],
    ['lookup after burst limit', [guard, burst, lookup, daily, generation]],
    [
      'generation before burst limit',
      [guard, lookup, generation, burst, daily],
    ],
  ] as const)('rejects %s', async (_name, fragments) => {
    expect(
      (await facts(fragments.join('\n')))
        .checksProviderBeforeReleaseFetchAndRateLimits
    ).toBe(false);
  });

  it('retains the separate burst-before-daily boundary', async () => {
    expect(
      (await facts([guard, lookup, daily, burst, generation].join('\n')))
        .appliesBurstBeforeDailyLimit
    ).toBe(false);
  });
});
