import { describe, expect, it } from 'vitest';
import {
  getMeshAgent,
  isMeshAgentId,
  MESH_AGENT_IDS,
  MESH_AGENT_REGISTRY,
} from './registry';

/**
 * JOV-8937 redaction contract: the mesh registry is sender ids only. It must
 * never carry token hashes, tokens, secrets, or credentials of any kind.
 */
const FORBIDDEN_KEY_PATTERN = /token|hash|secret|key|credential|password/i;

function collectForbiddenStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectForbiddenStrings);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([entryKey, entryValue]) =>
      FORBIDDEN_KEY_PATTERN.test(entryKey)
        ? [entryKey]
        : collectForbiddenStrings(entryValue)
    );
  }
  return [];
}

describe('mesh agent registry', () => {
  it('carries exactly the eight mesh agents (sender ids only)', () => {
    expect(MESH_AGENT_IDS).toEqual([
      'summer',
      'instinct',
      'chloe',
      'lola',
      'aeon',
      'stella',
      'grok-bot',
      'mesh-watcher',
    ]);
    expect(MESH_AGENT_REGISTRY).toHaveLength(8);
  });

  it('keeps every receive mode within direct|relay', () => {
    for (const agent of MESH_AGENT_REGISTRY) {
      expect(
        agent.receiveMode === 'direct' || agent.receiveMode === 'relay'
      ).toBe(true);
    }
  });

  it('exposes no token, hash, or secret fields anywhere in the registry', () => {
    expect(collectForbiddenStrings(MESH_AGENT_REGISTRY)).toEqual([]);
  });

  it('serializes the registry with only id/label/receiveMode/waitingOnTim keys', () => {
    expect(JSON.parse(JSON.stringify(MESH_AGENT_REGISTRY))).toEqual(
      MESH_AGENT_REGISTRY.map(agent => ({
        id: agent.id,
        label: agent.label,
        receiveMode: agent.receiveMode,
        ...(agent.waitingOnTim ? { waitingOnTim: agent.waitingOnTim } : {}),
      }))
    );
  });

  it('flags the known waiting-on-Tim agents (Lola rotation, Aeon grants)', () => {
    expect(getMeshAgent('lola')?.waitingOnTim).toBe('Rotation');
    expect(getMeshAgent('aeon')?.waitingOnTim).toBe('Grants');
  });

  it('resolves lookups defensively', () => {
    expect(isMeshAgentId('summer')).toBe(true);
    expect(isMeshAgentId('not-an-agent')).toBe(false);
    expect(getMeshAgent('not-an-agent')).toBeUndefined();
  });
});
