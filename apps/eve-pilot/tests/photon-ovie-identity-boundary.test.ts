import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EvePilotPhotonLaneUnconfiguredError,
  eveIdentityIdForChannel,
} from '../agent/select-identity';

const repoRoot = resolve(import.meta.dirname, '..');

function readAgentSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Photon/iMessage identity boundary', () => {
  it('routes Photon only to the explicitly configured Jovie or Summer lane', () => {
    expect(eveIdentityIdForChannel('photon', { EVE_IDENTITY: 'jovie' })).toBe(
      'jovie'
    );
    expect(
      eveIdentityIdForChannel('imessage', { EVE_IDENTITY: 'summer' })
    ).toBe('summer');
    expect(() => eveIdentityIdForChannel('photon', {})).toThrow(
      EvePilotPhotonLaneUnconfiguredError
    );
    expect(eveIdentityIdForChannel('ovie-summer-shadow')).toBe('summer');
    expect(eveIdentityIdForChannel('ovie-summer-bottleneck')).toBe('summer');
  });

  it('contains no executable Ovie identity or alternate router fallback', () => {
    const photon = readAgentSource('agent/channels/photon.ts');
    const identity = readAgentSource('agent/select-identity.ts');
    const agent = readAgentSource('agent/agent.ts');
    const liveSurface = withoutComments(`${photon}\n${identity}\n${agent}`);

    expect(photon).toContain('bindEvePilotIdentity(identity)');
    expect(identity).not.toMatch(/id: 'ovie'|EvePilotIdentityId[^\n]*'ovie'/);
    expect(liveSurface).not.toMatch(/bindEvePilotIdentity\('ovie'\)/);
    expect(liveSurface.toLowerCase()).not.toMatch(
      /hermes|trigger\.dev|local-executor/
    );
  });
});
