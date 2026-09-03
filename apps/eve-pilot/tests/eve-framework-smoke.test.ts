import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

describe('Eve framework smoke', () => {
  it('pins the deployment CLI used by the isolated pilot workflow', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(pilotRoot, 'package.json'), 'utf8')
    ) as { devDependencies?: Record<string, string> };

    expect(manifest.devDependencies?.vercel).toBe('56.3.2');
  });

  it('discovers Eve with Ovie Telegram and iMessage channels', () => {
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
        tools: ['jovie_capability_manifest'],
        subagents: [],
        schedules: [],
        channels: [
          {
            name: 'eve',
            kind: 'http',
            method: 'GET',
            urlPath: '/eve/v1/info',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session/:sessionId',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session/:sessionId/cancel',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session/:sessionId/compact',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session/:sessionId/clear',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'POST',
            urlPath: '/eve/v1/session/:sessionId/reset',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'GET',
            urlPath: '/eve/v1/session/:sessionId/stream',
          },
          {
            name: 'eve',
            kind: 'http',
            method: 'GET',
            urlPath:
              '/eve/v1/session/:parentSessionId/subagents/:callId/:childSessionId/stream',
          },
          {
            name: 'photon',
            kind: 'chat-sdk',
            method: 'GET',
            urlPath: '/eve/v1/photon',
          },
          {
            name: 'photon',
            kind: 'chat-sdk',
            method: 'POST',
            urlPath: '/eve/v1/photon',
          },
          {
            name: 'summer-shadow',
            kind: 'defineChannel',
            method: 'POST',
            urlPath: '/ovie/v1/summer-shadow/events',
          },
          {
            name: 'summer-shadow',
            kind: 'defineChannel',
            method: 'GET',
            urlPath: '/ovie/v1/summer-shadow/sessions/:sessionId/stream',
          },
          {
            name: 'telegram',
            kind: 'telegram',
            method: 'POST',
            urlPath: '/eve/v1/telegram',
          },
        ],
      });
      // Eve 0.39 discovery is offline. The hook would write this file if
      // fetch ran; a missing sentinel means no network attempt.
      expect(existsSync(networkSentinel)).toBe(false);
    } finally {
      rmSync(isolatedRoot, { force: true, recursive: true });
    }
  });
});
