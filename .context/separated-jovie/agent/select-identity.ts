import { IDENTITY_INSTRUCTIONS } from './identity-instructions';
import { assertRuntimeEnvironment } from './lib/application-boundary';
import { APPLICATION_IDENTITY } from './runtime-identity';

export type EvePilotIdentityId = 'jovie' | 'summer';
export type EvePilotCapability =
  | 'privileged-gbrain-write'
  | 'symphony-heal'
  | 'symphony-bounded-dispatch'
  | 'gbrain-read'
  | 'ingest-ack';
export class EvePilotCapabilityDeniedError extends Error {}
export function bindEvePilotIdentity(id: EvePilotIdentityId) {
  assertRuntimeEnvironment();
  if (id !== APPLICATION_IDENTITY)
    throw new Error('cross-domain identity denied');
  const pack = {
    id,
    role: id === 'summer' ? 'company-operator' : 'artist',
    canPrivilegedWriteGbrain: false,
    canHealSymphony: false,
    canDispatchBoundedSymphonyRepair: id === 'summer',
    canReadGbrain: false,
    canIngestAck: false,
  } as const;
  return {
    pack,
    instructions: IDENTITY_INSTRUCTIONS,
    require(capability: EvePilotCapability) {
      if (capability !== 'symphony-bounded-dispatch' || id !== 'summer')
        throw new EvePilotCapabilityDeniedError(`${id} denied ${capability}`);
    },
  };
}
export type EvePilotBoundTurn = ReturnType<typeof bindEvePilotIdentity>;
export function assertEvePilotFactoryLock(turn: EvePilotBoundTurn) {
  if (turn.pack.canPrivilegedWriteGbrain || turn.pack.canHealSymphony)
    throw new EvePilotCapabilityDeniedError('factory authority denied');
}
export function photonIdentityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  assertRuntimeEnvironment(environment);
  return APPLICATION_IDENTITY;
}
export function eveIdentityIdForChannel(
  source?: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  assertRuntimeEnvironment(environment);
  const summerChannel =
    source === 'telegram' || source?.startsWith('ovie-summer-');
  if (
    (summerChannel && APPLICATION_IDENTITY !== 'summer') ||
    (source === 'jovie-core-chat' && APPLICATION_IDENTITY !== 'jovie')
  )
    throw new Error('cross-domain channel denied');
  return APPLICATION_IDENTITY;
}
export function eveIdentityForChannel(source?: string) {
  return bindEvePilotIdentity(eveIdentityIdForChannel(source));
}
export function eveIdentityForRuntime() {
  return eveIdentityForChannel();
}
