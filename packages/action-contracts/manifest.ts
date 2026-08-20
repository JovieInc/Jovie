import { z } from 'zod';

import { chatStartAction } from './actions/chat-start';
import { contactCreateAction } from './actions/contact-create';
import { releaseCreateAction } from './actions/release-create';
import { taskCreateAction } from './actions/task-create';
import type { ActionDescriptor, ActionDescriptorPayload } from './descriptor';
import { ACTION_ERROR_CODES } from './errors';
import { type ActionId, isActionId } from './ids';
import { ACTION_CHANNELS } from './invocation';

/**
 * The canonical action registry. One entry per stable action ID; this is
 * the only place action identity, schemas, effects, confirmation policy,
 * channels, and requirements are declared. No surface may add a public
 * action identifier that is absent here.
 */
export const ACTION_MANIFEST = [
  chatStartAction,
  contactCreateAction,
  releaseCreateAction,
  taskCreateAction,
] as const satisfies readonly ActionDescriptor[];

export function getActionDescriptor(id: ActionId): ActionDescriptor {
  const descriptor = ACTION_MANIFEST.find(action => action.id === id);
  if (!descriptor) {
    throw new Error(`Unknown action id: ${id}`);
  }
  return descriptor;
}

export function listActionIds(): readonly ActionId[] {
  return ACTION_MANIFEST.map(action => action.id);
}

export { isActionId };

/**
 * Wire form of a descriptor: identical metadata with zod schemas replaced
 * by deterministic JSON Schema documents. Used by the discovery endpoint.
 */
export function buildDescriptorPayload(
  action: ActionDescriptor
): ActionDescriptorPayload {
  return {
    id: action.id,
    schemaVersion: action.schemaVersion,
    titleKey: action.titleKey,
    descriptionKey: action.descriptionKey,
    effect: action.effect,
    confirmation: action.confirmation,
    supportedChannels: [...action.supportedChannels],
    requirements: [...action.requirements],
    ...(action.minimumClientVersions
      ? { minimumClientVersions: { ...action.minimumClientVersions } }
      : {}),
    ...(action.deprecatedAt ? { deprecatedAt: action.deprecatedAt } : {}),
    ...(action.sunsetAt ? { sunsetAt: action.sunsetAt } : {}),
    inputSchema: z.toJSONSchema(action.inputSchema, {
      target: 'draft-2020-12',
    }) as Record<string, unknown>,
    outputSchema: z.toJSONSchema(action.outputSchema, {
      target: 'draft-2020-12',
    }) as Record<string, unknown>,
  };
}

/**
 * Machine-readable discovery document: the complete contract vocabulary
 * (channels, stable errors) plus one descriptor entry per action, with
 * schemas referenced by relative path into generated/schemas/.
 * Serialized deterministically by generate.ts.
 */
export function buildDiscoveryDocument() {
  return {
    contract: 'jovie-actions',
    transport: {
      major: 'v1',
      discoveryPath: '/api/v1/actions',
      invokePathTemplate: '/api/v1/actions/{actionId}/invoke',
    },
    channels: ACTION_CHANNELS,
    errorCodes: ACTION_ERROR_CODES,
    actions: ACTION_MANIFEST.map(action => ({
      id: action.id,
      schemaVersion: action.schemaVersion,
      titleKey: action.titleKey,
      descriptionKey: action.descriptionKey,
      effect: action.effect,
      confirmation: action.confirmation,
      supportedChannels: action.supportedChannels,
      requirements: action.requirements,
      minimumClientVersions: action.minimumClientVersions,
      deprecatedAt: action.deprecatedAt,
      sunsetAt: action.sunsetAt,
      schemas: {
        input: `schemas/${action.id}.input.json`,
        output: `schemas/${action.id}.output.json`,
        invocation: `schemas/${action.id}.invocation.json`,
        result: `schemas/${action.id}.result.json`,
      },
    })),
  };
}
