import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eveIdentityIdForChannel } from '../agent/select-identity';

const repoRoot = resolve(import.meta.dirname, '..');

function readAgentSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Photon/iMessage identity boundary', () => {
  it('routes live Photon and iMessage to Ovie, not Summer', () => {
    expect(eveIdentityIdForChannel('photon')).toBe('ovie');
    expect(eveIdentityIdForChannel('imessage')).toBe('ovie');
    expect(eveIdentityIdForChannel('ovie-summer-shadow')).toBe('summer');
    expect(eveIdentityIdForChannel('ovie-summer-bottleneck')).toBe('summer');
  });

  it('binds the live Photon channel to Ovie with no Summer or Hermes/Trigger fallback', () => {
    const photon = readAgentSource('agent/channels/photon.ts');
    const identity = readAgentSource('agent/select-identity.ts');
    const agent = readAgentSource('agent/agent.ts');
    const liveSurface = withoutComments(`${photon}\n${identity}\n${agent}`);

    expect(photon).toContain("bindEvePilotIdentity('ovie')");
    expect(photon).toContain("identity: 'ovie'");
    expect(photon).not.toContain("bindEvePilotIdentity('summer')");
    expect(photon).not.toContain("identity: 'summer'");
    expect(liveSurface.toLowerCase()).not.toMatch(
      /hermes|trigger\.dev|local-executor/
    );
  });
});
