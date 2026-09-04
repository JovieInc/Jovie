import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface EveInfo {
  status: string;
  diagnostics: {
    errors: number;
    warnings: number;
  };
  skills: string[];
  tools: string[];
  subagents: string[];
  schedules: string[];
  channels: Array<{
    name: string;
    kind: string;
    method: string;
    urlPath: string;
  }>;
}

const pilotRoot = process.cwd();

/**
 * Eve 0.39 compiles the primary model's context window from AI Gateway
 * metadata. `openai/gpt-5.4-mini` was built in; `zai/glm-5.3-flash` is not,
 * so `eve info` would fetch the Gateway catalog. The smoke test is offline by
 * contract, so seed Eve's app-local catalog cache (`.eve/cache/model-catalog.json`,
 * schema `eve-model-catalog-cache` v2, 24h TTL) with the published Gateway
 * metadata for the Summer speaker model instead of calling the live Gateway.
 * Source: https://vercel.com/ai-gateway/models/glm-5.3-flash
 * (context window 1,048,576; maximum output tokens 1,048,576).
 */
const SUMMER_SPEAKER_MODEL = 'zai/glm-5.3-flash';
const GATEWAY_MODEL_CATALOG_CACHE = {
  fetchedAt: new Date().toISOString(),
  kind: 'eve-model-catalog-cache',
  models: [
    {
      slug: SUMMER_SPEAKER_MODEL,
      providers: [
        {
          provider: 'zai',
          providerModelId: 'glm-5.3-flash',
          contextWindowTokens: 1_048_576,
          maxOutputTokens: 1_048_576,
        },
      ],
    },
  ],
  providerAliases: {},
  version: 2,
};

function seedOfflineModelCatalog(appRoot: string): void {
  const cacheDir = join(appRoot, '.eve', 'cache');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    join(cacheDir, 'model-catalog.json'),
    `${JSON.stringify(GATEWAY_MODEL_CATALOG_CACHE, null, 2)}\n`
  );
}

describe('Eve framework smoke', () => {
  it('pins the Summer speaker model the offline catalog seed describes', () => {
    const agentSource = readFileSync(
      resolve(pilotRoot, 'agent/agent.ts'),
      'utf8'
    );

    expect(agentSource).toContain(`model: '${SUMMER_SPEAKER_MODEL}'`);
  });

  it('pins the deployment CLI used by the isolated pilot workflow', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(pilotRoot, 'package.json'), 'utf8')
    ) as { devDependencies?: Record<string, string> };

    expect(manifest.devDependencies?.vercel).toBe('56.3.2');
  });

  it('discovers Eve with Ovie Telegram and Summer iMessage channels offline', () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), 'jovie-eve-smoke-'));
    const networkSentinel = join(isolatedRoot, 'network-blocked');

    try {
      cpSync(resolve(pilotRoot, 'agent'), join(isolatedRoot, 'agent'), {
        recursive: true,
      });
      const identities = resolve(pilotRoot, 'identities');
      if (existsSync(identities)) {
        cpSync(identities, join(isolatedRoot, 'identities'), {
          recursive: true,
        });
      }
      symlinkSync(
        resolve(pilotRoot, 'node_modules'),
        join(isolatedRoot, 'node_modules'),
        'dir'
      );
      copyFileSync(
        resolve(pilotRoot, 'package.json'),
        join(isolatedRoot, 'package.json')
      );
      seedOfflineModelCatalog(isolatedRoot);

      const output = execFileSync('eve', ['info', '--json'], {
        cwd: isolatedRoot,
        encoding: 'utf8',
        env: {
          EVE_SMOKE_NETWORK_SENTINEL: networkSentinel,
          NODE_OPTIONS: `--import=${resolve(pilotRoot, 'tests/deny-network.mjs')}`,
          PATH: process.env.PATH,
        },
      });
      const jsonStart = output.indexOf('{');

      expect(jsonStart).toBeGreaterThanOrEqual(0);

      const info = JSON.parse(output.slice(jsonStart)) as EveInfo;

      expect(info).toMatchObject({
        status: 'ready',
        diagnostics: { errors: 0, warnings: 0 },
        skills: ['jovie-action-boundary'],
        subagents: [],
      });
      // Eve 0.47 registers a growing set of built-in tools (bash, read_file,
      // web_search, agent, ...). Pin only the pilot-owned capability surface —
      // the Jovie capability manifest tool must be discovered alongside the
      // framework's built-ins, never replaced by them.
      expect(info.tools).toContain('jovie_capability_manifest');
      expect(info.schedules).toContain('summer-bottleneck-heartbeat');

      // Eve 0.47 ships additional built-in HTTP channels (the `home` landing
      // surface, `/eve/v1/health`, connection callbacks, activity/task-input
      // webhooks). Pin the pilot-owned channels plus the core session
      // protocol; the framework's volatile extras are not part of this
      // contract.
      const hasChannel = (
        name: string,
        kind: string,
        method: string,
        urlPath: string
      ) =>
        info.channels.some(
          c =>
            c.name === name &&
            c.kind === kind &&
            c.method === method &&
            c.urlPath === urlPath
        );
      expect(hasChannel('eve', 'http', 'GET', '/eve/v1/info')).toBe(true);
      expect(hasChannel('eve', 'http', 'POST', '/eve/v1/session')).toBe(true);
      expect(
        hasChannel('eve', 'http', 'POST', '/eve/v1/session/:sessionId')
      ).toBe(true);
      expect(
        hasChannel('eve', 'http', 'POST', '/eve/v1/session/:sessionId/cancel')
      ).toBe(true);
      expect(
        hasChannel('eve', 'http', 'POST', '/eve/v1/session/:sessionId/compact')
      ).toBe(true);
      expect(
        hasChannel('eve', 'http', 'POST', '/eve/v1/session/:sessionId/clear')
      ).toBe(true);
      expect(
        hasChannel('eve', 'http', 'POST', '/eve/v1/session/:sessionId/reset')
      ).toBe(true);
      expect(
        hasChannel('eve', 'http', 'GET', '/eve/v1/session/:sessionId/stream')
      ).toBe(true);
      expect(
        hasChannel(
          'eve',
          'http',
          'GET',
          '/eve/v1/session/:parentSessionId/subagents/:callId/:childSessionId/stream'
        )
      ).toBe(true);
      expect(hasChannel('photon', 'chat-sdk', 'GET', '/eve/v1/photon')).toBe(
        true
      );
      expect(hasChannel('photon', 'chat-sdk', 'POST', '/eve/v1/photon')).toBe(
        true
      );
      expect(
        hasChannel(
          'summer-shadow',
          'defineChannel',
          'POST',
          '/ovie/v1/summer-shadow/events'
        )
      ).toBe(true);
      expect(
        hasChannel(
          'summer-shadow',
          'defineChannel',
          'GET',
          '/ovie/v1/summer-shadow/sessions/:sessionId/stream'
        )
      ).toBe(true);
      expect(
        hasChannel('telegram', 'telegram', 'POST', '/eve/v1/telegram')
      ).toBe(true);
      // Eve 0.39 discovery is offline. The hook would write this file if
      // fetch ran; a missing sentinel means no network attempt.
      expect(existsSync(networkSentinel)).toBe(false);
    } finally {
      rmSync(isolatedRoot, { force: true, recursive: true });
    }
  });
});
