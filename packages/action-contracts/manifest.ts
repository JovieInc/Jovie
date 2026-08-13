import { chatStartAction } from './actions/chat-start';
import { contactCreateAction } from './actions/contact-create';
import { releaseCreateAction } from './actions/release-create';
import { taskCreateAction } from './actions/task-create';
import { type ActionId, isActionId } from './ids';
import { ACTION_CONTRACT_VERSION, type ActionDefinition } from './metadata';

/**
 * The canonical action registry. One entry per stable action ID; this is
 * the only place action identity, schemas, capability/discovery metadata,
 * auth scope, idempotency, and evolution rules are declared.
 */
export const ACTION_MANIFEST = [
  chatStartAction,
  contactCreateAction,
  releaseCreateAction,
  taskCreateAction,
] as const satisfies readonly ActionDefinition[];

export function getActionDefinition(id: ActionId): ActionDefinition {
  const definition = ACTION_MANIFEST.find(action => action.id === id);
  if (!definition) {
    throw new Error(`Unknown action id: ${id}`);
  }
  return definition;
}

export function listActionIds(): readonly ActionId[] {
  return ACTION_MANIFEST.map(action => action.id);
}

export { isActionId };

/**
 * Machine-readable discovery document. Pure metadata — schemas are
 * referenced by relative path into generated/schemas/ so clients fetch
 * exactly what they need. Serialized deterministically by generate.ts.
 */
export function buildDiscoveryDocument() {
  return {
    contract: 'jovie-actions',
    contractVersion: ACTION_CONTRACT_VERSION,
    invariants: {
      dispatcherOwnsPolicy: true,
      ledgerRequiredBeforeWrites: true,
      publicArtistMcpWritable: false,
      clientsArePresentationOnly: true,
    },
    actions: ACTION_MANIFEST.map(action => ({
      id: action.id,
      version: action.version,
      kind: action.kind,
      title: action.discovery.title,
      summary: action.discovery.summary,
      category: action.discovery.category,
      auth: action.auth,
      idempotency: action.idempotency,
      evolution: action.evolution,
      bindings: action.discovery.bindings,
      entitlementKeys: action.entitlementKeys,
      errorCodes: action.domainErrorCodes,
      schemas: {
        input: `schemas/${action.id}.input.json`,
        output: `schemas/${action.id}.output.json`,
        error: `schemas/${action.id}.error.json`,
      },
    })),
  };
}
