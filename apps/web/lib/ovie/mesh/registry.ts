/**
 * Mesh agent registry (JOV-8937).
 *
 * The canonical sender-id roster for the read-only Ovie Mesh page. This file
 * carries ids and display metadata ONLY — never token hashes, tokens, or
 * secrets. Mesh credentials stay on the mesh hosts; Jovie reads mailbox
 * records from the env-configured Summer mesh endpoint instead.
 *
 * Server-safe: no 'server-only' import so tests and the client table can read
 * labels, but nothing here is ever sent anywhere by the client.
 */
import type { MeshAgentRegistryEntry } from './types';

export const MESH_AGENT_REGISTRY = [
  {
    id: 'summer',
    label: 'Summer',
    receiveMode: 'direct',
  },
  {
    id: 'instinct',
    label: 'Instinct',
    receiveMode: 'relay',
  },
  {
    id: 'chloe',
    label: 'Chloe',
    receiveMode: 'direct',
  },
  {
    id: 'lola',
    label: 'Lola',
    receiveMode: 'direct',
    waitingOnTim: 'Rotation',
  },
  {
    id: 'aeon',
    label: 'Aeon',
    receiveMode: 'relay',
    waitingOnTim: 'Grants',
  },
  {
    id: 'stella',
    label: 'Stella',
    receiveMode: 'direct',
  },
  {
    id: 'grok-bot',
    label: 'Grok Bot',
    receiveMode: 'relay',
  },
  {
    id: 'mesh-watcher',
    label: 'Mesh watcher',
    receiveMode: 'relay',
  },
] as const satisfies readonly MeshAgentRegistryEntry[];

export const MESH_AGENT_IDS: readonly string[] = MESH_AGENT_REGISTRY.map(
  agent => agent.id
);

export function isMeshAgentId(id: string): boolean {
  return MESH_AGENT_IDS.includes(id);
}

export function getMeshAgent(id: string): MeshAgentRegistryEntry | undefined {
  return MESH_AGENT_REGISTRY.find(agent => agent.id === id);
}
