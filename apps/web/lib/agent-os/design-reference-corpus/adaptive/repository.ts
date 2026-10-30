import {
  applyReferenceCommand,
  createReferenceSession,
  importReferenceCandidates,
  ReferenceConflict,
  referenceScopeKey,
} from './engine';
import {
  type ReferenceCommand,
  type ReferenceScope,
  type ReferenceSession,
  ReferenceSessionSchema,
} from './types';

/** Adapter for the canonical operating store. No process-local success fallback. */
export interface ReferenceRepository {
  read(key: string): Promise<unknown | null>;
  compareAndSet(
    key: string,
    expectedRevision: number | null,
    value: ReferenceSession
  ): Promise<boolean>;
}

/** Trusted capture/import boundary. Call only after source/bytes/rights checks;
 * user rating commands deliberately cannot mark imported material verified. */
export async function commitReferenceIntake(
  repository: ReferenceRepository,
  scope: ReferenceScope,
  inputs: readonly unknown[],
  expectedRevision: number,
  now: string
): Promise<ReferenceSession> {
  const key = referenceScopeKey(scope);
  const raw = await repository.read(key);
  const current =
    raw === null
      ? createReferenceSession(scope, now)
      : ReferenceSessionSchema.parse(raw);
  if (current.revision !== expectedRevision)
    throw new ReferenceConflict('References changed before intake.');
  const next = importReferenceCandidates(current, scope, inputs, now);
  if (
    !(await repository.compareAndSet(
      key,
      raw === null ? null : expectedRevision,
      next
    ))
  )
    throw new ReferenceConflict('References changed before intake.');
  return next;
}
export async function readReferenceSession(
  repository: ReferenceRepository,
  scope: ReferenceScope
): Promise<ReferenceSession> {
  const raw = await repository.read(referenceScopeKey(scope));
  const state =
    raw === null
      ? createReferenceSession(scope, new Date().toISOString())
      : ReferenceSessionSchema.parse(raw);
  // Check before exposing any content, including a corrupt row under the wrong key.
  if (referenceScopeKey(state.scope) !== referenceScopeKey(scope))
    throw new ReferenceConflict('Reference scope mismatch.');
  return state;
}
export async function commitReferenceCommand(
  repository: ReferenceRepository,
  scope: ReferenceScope,
  command: ReferenceCommand
): Promise<ReferenceSession> {
  const key = referenceScopeKey(scope);
  const raw = await repository.read(key);
  const current =
    raw === null
      ? createReferenceSession(scope, new Date().toISOString())
      : ReferenceSessionSchema.parse(raw);
  const next = applyReferenceCommand(current, scope, command);
  if (next === current) return current;
  if (
    await repository.compareAndSet(
      key,
      raw === null ? null : current.revision,
      next
    )
  )
    return next;
  // A lost response or simultaneous retry may already have committed this command.
  const latest = await readReferenceSession(repository, scope);
  if (latest.commands[command.commandId] === JSON.stringify(command))
    return latest;
  throw new ReferenceConflict('References changed. Reload to continue.');
}
