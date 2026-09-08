import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EvePilotIdentityId = 'jovie' | 'summer';

export type EvePilotCapability =
  | 'privileged-gbrain-write'
  | 'symphony-heal'
  | 'symphony-bounded-dispatch'
  | 'gbrain-read'
  | 'ingest-ack'
  | 'governor-admit'
  | 'governor-route'
  | 'governor-enforce';

export type EvePilotPack = {
  readonly id: EvePilotIdentityId;
  readonly role: 'artist' | 'founder' | 'company-operator';
  readonly canPrivilegedWriteGbrain: boolean;
  readonly canHealSymphony: boolean;
  readonly canDispatchBoundedSymphonyRepair: boolean;
  readonly canIngestAck: boolean;
  readonly canReadGbrain: boolean;
  readonly canGovernorAdmit: boolean;
  readonly canGovernorRoute: boolean;
  readonly canGovernorEnforce: boolean;
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
  canDispatchBoundedSymphonyRepair: false,
  canIngestAck: false,
  canReadGbrain: false,
  canGovernorAdmit: false,
  canGovernorRoute: false,
  canGovernorEnforce: false,
};

const SUMMER_SHADOW_PACK: EvePilotPack = {
  id: 'summer',
  role: 'company-operator',
  canPrivilegedWriteGbrain: false,
  canHealSymphony: false,
  canDispatchBoundedSymphonyRepair: true,
  canIngestAck: false,
  canReadGbrain: false,
  canGovernorAdmit: true,
  canGovernorRoute: true,
  canGovernorEnforce: true,
};

function allowed(pack: EvePilotPack, capability: EvePilotCapability): boolean {
  switch (capability) {
    case 'privileged-gbrain-write':
      return pack.canPrivilegedWriteGbrain;
    case 'symphony-heal':
      return pack.canHealSymphony;
    case 'symphony-bounded-dispatch':
      return pack.canDispatchBoundedSymphonyRepair;
    case 'gbrain-read':
      return pack.canReadGbrain;
    case 'ingest-ack':
      return pack.canIngestAck;
    case 'governor-admit':
      return pack.canGovernorAdmit;
    case 'governor-route':
      return pack.canGovernorRoute;
    case 'governor-enforce':
      return pack.canGovernorEnforce;
  }
}

export function bindEvePilotIdentity(id: EvePilotIdentityId) {
  const pack = id === 'summer' ? SUMMER_SHADOW_PACK : JOVIE_PACK;
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
  | 'ovie-summer-bottleneck'
  | 'jovie-core-chat'
  | string;

export function eveIdentityIdForChannel(
  source?: EvePilotChannelSource,
  environment: Readonly<Record<string, string | undefined>> = process.env
): EvePilotIdentityId {
  if (
    source === 'telegram' ||
    source === 'ovie-summer-shadow' ||
    source === 'ovie-summer-bottleneck'
  ) {
    return 'summer';
  }
  if (source === 'imessage' || source === 'photon') {
    const lane = photonIdentityFromEnvironment(environment);
    if (!lane) throw new EvePilotPhotonLaneUnconfiguredError();
    return lane;
  }
  if (environment.EVE_IDENTITY === 'summer') return 'summer';
  return 'jovie';
}

export class EvePilotPhotonLaneUnconfiguredError extends Error {
  constructor() {
    super('Photon lane requires EVE_IDENTITY=jovie or EVE_IDENTITY=summer');
    this.name = 'EvePilotPhotonLaneUnconfiguredError';
  }
}

export function photonIdentityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): EvePilotIdentityId | null {
  const identity = environment.EVE_IDENTITY?.trim().toLowerCase();
  return identity === 'jovie' || identity === 'summer' ? identity : null;
}

export function eveIdentityForChannel(source?: EvePilotChannelSource) {
  const turn = bindEvePilotIdentity(eveIdentityIdForChannel(source));
  assertEvePilotFactoryLock(turn);
  return turn;
}

export function eveIdentityForRuntime() {
  return eveIdentityForChannel();
}
