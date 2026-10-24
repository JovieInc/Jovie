/**
 * Mesh agent registry (JOV-8937).
 *
 * The canonical sender-id roster for the read-only Ovie Mesh page. This file
 * carries ids and display metadata ONLY — never token hashes, tokens, or
 * secrets. Mesh credentials stay in the JOVIE_MESH_* env contract and on the
 * agents' hosts; Jovie reads mailbox records from the env-configured Summer
 * mesh origin instead.
 *
 * `meshKind` is the real mesh recipient name (MESH_KINDS in
 * packages/jovie-cli/src/mesh.ts) used to address pings; null means the
 * roster entry is not a mesh recipient (the watcher is a Jovie-side role).
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
    meshKind: 'summer',
  },
  {
    id: 'instinct',
    label: 'Instinct',
    receiveMode: 'relay',
    meshKind: 'instinct',
  },
  {
    id: 'chloe',
    label: 'Chloe',
    receiveMode: 'direct',
    meshKind: 'chloe',
  },
  {
    id: 'lola',
    label: 'Lola',
    receiveMode: 'direct',
    meshKind: 'lola',
    waitingOnTim: 'Rotation',
  },
  {
    id: 'aeon',
    label: 'Aeon',
    receiveMode: 'relay',
    meshKind: 'aeon',
    waitingOnTim: 'Grants',
  },
  {
    id: 'stella',
    label: 'Stella',
    receiveMode: 'direct',
    meshKind: 'stella',
  },
  {
    id: 'grokbot',
    label: 'Grok Bot',
    receiveMode: 'relay',
    meshKind: 'grokbot',
  },
  {
    id: 'mesh-watcher',
    label: 'Mesh watcher',
    receiveMode: 'relay',
    meshKind: null,
  },
] as const satisfies readonly MeshAgentRegistryEntry[];

export const MESH_AGENT_IDS: readonly string[] = MESH_AGENT_REGISTRY.map(
  agent => agent.id
);

/** The subset of the roster addressable through the mesh inbox. */
export const MESH_KIND_IDS: readonly string[] = MESH_AGENT_REGISTRY.filter(
  agent => agent.meshKind !== null
).map(agent => agent.id);

export function isMeshAgentId(id: string): boolean {
  return MESH_AGENT_IDS.includes(id);
}

export function getMeshAgent(id: string): MeshAgentRegistryEntry | undefined {
  return MESH_AGENT_REGISTRY.find(agent => agent.id === id);
}
