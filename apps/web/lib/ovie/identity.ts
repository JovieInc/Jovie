/**
 * Eve identity pack selection (JOV-5216 / JOV-5214).
 *
 * `ovie` is a door/surface id, never a persona or model identity. Artist
 * Jovie generation is forbidden on the Ovie door (see summer-transport),
 * which binds the executable `summer` identity.
 * Chat and Eve entries must go through bindEveIdentityForTurn so
 * capability flags are enforced at runtime.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertModelMustNotSelfIdentifyAsOvie } from '@/lib/ovie/program';

export type EveIdentityId = 'jovie' | 'summer';

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
  readonly role: 'artist' | 'company-operator';
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

const SUMMER_PACK: EveIdentityPack = {
  id: 'summer',
  surface: 'door',
  conversationalAuthority: 'summer',
  isPersona: false,
  role: 'company-operator',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: true,
  canReadGbrain: true,
  allowsLybHealthMemory: false,
};

export function selectEveIdentity(id: EveIdentityId): EveIdentityPack {
  return id === 'summer' ? SUMMER_PACK : JOVIE_PACK;
}

/** Map the existing OV presentation surface onto the Summer pack. */
export function eveIdentityForChatMode(
  chatMode: 'ov' | null | undefined
): EveIdentityPack {
  return selectEveIdentity(chatMode === 'ov' ? 'summer' : 'jovie');
}

/** ChatGPT / private founder MCP is always the Summer pack. */
export function eveIdentityForMcpDoor(): EveIdentityPack {
  return selectEveIdentity('summer');
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
  return bindEveIdentityForTurn(chatMode === 'ov' ? 'summer' : 'jovie');
}

/**
 * Summer owns self-id behind the Ovie presentation surface. Summer
 * instructions prepend and override later artist-product copy.
 */
export function applyEveIdentityToSystemPrompt(
  systemPrompt: string,
  identity: {
    readonly id: EveIdentityId;
    readonly instructions: string;
  }
): string {
  if (identity.id !== 'summer') return systemPrompt;
  const instructions = identity.instructions.trim();
  const identityBlock =
    instructions.length > 0
      ? instructions
      : 'You are Summer behind the Ovie presentation surface. Do not self-identify as Ovie or Jovie.';
  assertModelMustNotSelfIdentifyAsOvie(identityBlock);
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
