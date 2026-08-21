/**
 * Eve identity pack selection (JOV-5216 / JOV-5214).
 *
 * `ovie` is a door/surface id, not a persona or model identity. Artist
 * Jovie generation is forbidden on the Ovie door (see summer-transport).
 * Chat and Eve entries must go through bindEveIdentityForTurn so
 * capability flags are enforced at runtime.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type EveIdentityId = 'jovie' | 'ovie';

export type EveCapability =
  | 'privileged-gbrain-write'
  | 'symphony-heal'
  | 'gbrain-read'
  | 'ingest-ack';

export type EveIdentityPack = {
  readonly id: EveIdentityId;
  readonly surface: 'door' | 'artist';
  readonly conversationalAuthority: 'summer' | 'jovie-artist';
  readonly isPersona: boolean;
  readonly role: 'artist' | 'founder';
  readonly canPrivilegedWriteGbrain: boolean;
  readonly canHealSymphony: boolean;
  readonly canIngestAck: boolean;
  readonly canReadGbrain: boolean;
  readonly allowsLybHealthMemory: boolean;
};

export class EveCapabilityDeniedError extends Error {
  constructor(
    readonly identityId: EveIdentityId,
    readonly capability: EveCapability
  ) {
    super(`${identityId} denied ${capability}`);
    this.name = 'EveCapabilityDeniedError';
  }
}

const JOVIE_PACK: EveIdentityPack = {
  id: 'jovie',
  surface: 'artist',
  conversationalAuthority: 'jovie-artist',
  isPersona: true,
  role: 'artist',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: false,
  canReadGbrain: false,
  allowsLybHealthMemory: false,
};

const OVIE_PACK: EveIdentityPack = {
  id: 'ovie',
  surface: 'door',
  conversationalAuthority: 'summer',
  isPersona: false,
  role: 'founder',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: true,
  canReadGbrain: true,
  allowsLybHealthMemory: false,
};

export function selectEveIdentity(id: EveIdentityId): EveIdentityPack {
  return id === 'ovie' ? OVIE_PACK : JOVIE_PACK;
}

/** Map the existing OV chat surface onto the Ovie door pack. */
export function eveIdentityForChatMode(
  chatMode: 'ov' | null | undefined
): EveIdentityPack {
  return selectEveIdentity(chatMode === 'ov' ? 'ovie' : 'jovie');
}

/** ChatGPT / private founder MCP is always the Ovie pack. */
export function eveIdentityForMcpDoor(): EveIdentityPack {
  return selectEveIdentity('ovie');
}

export function authorizeEveCapability(
  pack: EveIdentityPack,
  capability: EveCapability
): { allowed: boolean } {
  switch (capability) {
    case 'privileged-gbrain-write':
      return { allowed: pack.canPrivilegedWriteGbrain };
    case 'symphony-heal':
      return { allowed: pack.canHealSymphony };
    case 'gbrain-read':
      return { allowed: pack.canReadGbrain };
    case 'ingest-ack':
      return { allowed: pack.canIngestAck };
  }
}

function readIdentityInstructions(id: EveIdentityId): string {
  const candidates = [
    resolve(process.cwd(), '../eve-pilot/identities', id, 'instructions.md'),
    resolve(process.cwd(), 'apps/eve-pilot/identities', id, 'instructions.md'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  return '';
}

export type EveBoundTurn = {
  readonly pack: EveIdentityPack;
  readonly instructions: string;
  require(capability: EveCapability): void;
};

/**
 * Chat/Eve entry. Capability checks go through `require` so a pack that
 * still grants privileged gbrain write or Symphony heal fails closed.
 */
export function bindEveIdentityForTurn(id: EveIdentityId): EveBoundTurn {
  const pack = selectEveIdentity(id);
  return {
    pack,
    instructions: readIdentityInstructions(id),
    require(capability: EveCapability) {
      if (!authorizeEveCapability(pack, capability).allowed) {
        throw new EveCapabilityDeniedError(pack.id, capability);
      }
    },
  };
}

export function bindEveIdentityForChatMode(
  chatMode: 'ov' | null | undefined
): EveBoundTurn {
  return bindEveIdentityForTurn(chatMode === 'ov' ? 'ovie' : 'jovie');
}

/**
 * Selected door owns self-id. Ovie instructions prepend and override any
 * later "You are Jovie" product copy. Jovie keeps the existing system prompt.
 */
export function applyEveIdentityToSystemPrompt(
  systemPrompt: string,
  identity: {
    readonly id: EveIdentityId;
    readonly instructions: string;
  }
): string {
  if (identity.id !== 'ovie') return systemPrompt;
  const instructions = identity.instructions.trim();
  const identityBlock =
    instructions.length > 0
      ? instructions
      : 'You are Ovie, the founder door. You are not Jovie.';
  return `${identityBlock}\n\nThe following artist-product context is available when you drive Jovie tools. Do not identify as Jovie.\n\n${systemPrompt}`;
}

/** Fail closed if this turn is armed with factory-only capabilities. */
export function assertEveChatFactoryLock(turn: EveBoundTurn): void {
  if (authorizeEveCapability(turn.pack, 'privileged-gbrain-write').allowed) {
    throw new EveCapabilityDeniedError(turn.pack.id, 'privileged-gbrain-write');
  }
  if (authorizeEveCapability(turn.pack, 'symphony-heal').allowed) {
    throw new EveCapabilityDeniedError(turn.pack.id, 'symphony-heal');
  }
}
