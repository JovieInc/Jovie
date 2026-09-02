import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EvePilotIdentityId = 'jovie' | 'ovie' | 'summer';

export type EvePilotCapability =
  | 'privileged-gbrain-write'
  | 'symphony-heal'
  | 'gbrain-read'
  | 'ingest-ack';

export type EvePilotPack = {
  readonly id: EvePilotIdentityId;
  readonly role: 'artist' | 'founder' | 'company-operator';
  readonly canPrivilegedWriteGbrain: boolean;
  readonly canHealSymphony: boolean;
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

/**
 * First Vercel cutover phase: Summer can observe and reason about company
 * operations, but cannot yet mutate Linear, GitHub, GBrain, or Symphony.
 * The future receipt/outbox writer must be introduced as a separately tested
 * capability before any of those permissions are granted.
 */
const SUMMER_SHADOW_PACK: EvePilotPack = {
  id: 'summer',
  role: 'company-operator',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canIngestAck: false,
  canReadGbrain: false,
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
  const pack =
    id === 'ovie'
      ? OVIE_PACK
      : id === 'summer'
        ? SUMMER_SHADOW_PACK
        : JOVIE_PACK;
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

export type EvePilotBoundTurn = ReturnType<typeof bindEvePilotIdentity>;

export function assertEvePilotFactoryLock(turn: EvePilotBoundTurn): void {
  if (allowed(turn.pack, 'privileged-gbrain-write')) {
    throw new EvePilotCapabilityDeniedError(
      turn.pack.id,
      'privileged-gbrain-write'
    );
  }
  if (allowed(turn.pack, 'symphony-heal')) {
    throw new EvePilotCapabilityDeniedError(turn.pack.id, 'symphony-heal');
  }
}

export type EvePilotChannelSource =
  | 'telegram'
  | 'imessage'
  | 'photon'
  | 'ovie-summer-shadow'
  | 'jovie-core-chat'
  | string;

/**
 * Telegram remains the Ovie founder pack. Photon/iMessage is Summer's live
 * talk channel. The ovie-summer-shadow source stays Summer for the OIDC
 * observation path. Other sources keep the Jovie runtime default.
 */
export function eveIdentityIdForChannel(
  source?: EvePilotChannelSource
): EvePilotIdentityId {
  if (source === 'telegram') {
    return 'ovie';
  }
  if (source === 'imessage' || source === 'photon') {
    return 'summer';
  }
  if (source === 'ovie-summer-shadow') return 'summer';
  if (process.env.EVE_IDENTITY === 'ovie') return 'ovie';
  return 'jovie';
}

export function eveIdentityForChannel(source?: EvePilotChannelSource) {
  const turn = bindEvePilotIdentity(eveIdentityIdForChannel(source));
  assertEvePilotFactoryLock(turn);
  return turn;
}

export function eveIdentityForRuntime() {
  return eveIdentityForChannel();
}
