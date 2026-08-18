import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EvePilotIdentityId = 'jovie' | 'ovie';

export type EvePilotCapability =
  | 'privileged-gbrain-write'
  | 'symphony-heal'
  | 'gbrain-read'
  | 'ingest-ack';

export type EvePilotPack = {
  readonly id: EvePilotIdentityId;
  readonly role: 'artist' | 'founder';
  readonly canPrivilegedWriteGbrain: false;
  readonly canHealSymphony: false;
  readonly canIngestAck: boolean;
  readonly canReadGbrain: boolean;
};

export class EvePilotCapabilityDeniedError extends Error {
  constructor(
    readonly identityId: EvePilotIdentityId,
    readonly capability: EvePilotCapability
  ) {
    super(`${identityId} denied ${capability}`);
    this.name = 'EvePilotCapabilityDeniedError';
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const JOVIE_PACK: EvePilotPack = {
  id: 'jovie',
  role: 'artist',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: false,
  canReadGbrain: false,
};

const OVIE_PACK: EvePilotPack = {
  id: 'ovie',
  role: 'founder',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: true,
  canReadGbrain: true,
};

function allowed(pack: EvePilotPack, capability: EvePilotCapability): boolean {
  switch (capability) {
    case 'privileged-gbrain-write':
      return pack.canPrivilegedWriteGbrain;
    case 'symphony-heal':
      return pack.canHealSymphony;
    case 'gbrain-read':
      return pack.canReadGbrain;
    case 'ingest-ack':
      return pack.canIngestAck;
  }
}

/**
 * Eve agent entry. Loads the on-disk identity pack and exposes `require`
 * so a runtime that still writes gbrain or heals Symphony fails closed.
 */
export function bindEvePilotIdentity(id: EvePilotIdentityId) {
  const pack = id === 'ovie' ? OVIE_PACK : JOVIE_PACK;
  const instructionPath = resolve(root, 'identities', id, 'instructions.md');
  const instructions = existsSync(instructionPath)
    ? readFileSync(instructionPath, 'utf8')
    : '';
  return {
    pack,
    instructions,
    require(capability: EvePilotCapability) {
      if (!allowed(pack, capability)) {
        throw new EvePilotCapabilityDeniedError(pack.id, capability);
      }
    },
  };
}

export function eveIdentityForRuntime() {
  return bindEvePilotIdentity(
    process.env.EVE_IDENTITY === 'ovie' ? 'ovie' : 'jovie'
  );
}
