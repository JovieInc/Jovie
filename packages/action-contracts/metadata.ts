import type { z } from 'zod';

import type { ActionId } from './ids';

/**
 * Version of the canonical actions contract itself (not of any one action).
 * Bump per the evolution rules in README.md.
 */
export const ACTION_CONTRACT_VERSION = '1.0.0' as const;

/** Adapter kinds that may present a canonical action. */
export type ActionBindingKind =
  | 'web-api'
  | 'chat-tool'
  | 'swift'
  | 'mcp'
  | 'cli';

/**
 * - `existing`: the surface runs today against a legacy path (see
 *   docs/features/canonical-actions/INVENTORY.md) and migrates later.
 * - `contract-only`: binding contract is specified (bindings/*.md) but no
 *   runtime product exists; nothing may claim support for it yet.
 */
export type ActionBindingStatus = 'existing' | 'contract-only';

export interface ActionBinding {
  readonly kind: ActionBindingKind;
  readonly status: ActionBindingStatus;
  readonly note?: string;
}

/**
 * Auth/scope contract. Hard invariants:
 * - every action is authenticated and profile-scoped;
 * - the public per-artist MCP endpoint never receives workspace writes.
 */
export interface ActionAuth {
  readonly requiresAuth: true;
  readonly profileScoped: true;
  readonly publicArtistMcpWritable: false;
}

export interface ActionIdempotency {
  readonly required: true;
  /** Input field carrying the client-supplied idempotency key. */
  readonly keyField: 'idempotencyKey';
  /**
   * `replay`: a repeated key returns the recorded result (`meta.replayed`).
   * `conflict`: a repeated key with a different payload is rejected with
   * `IDEMPOTENCY_CONFLICT`.
   */
  readonly onConflict: 'replay' | 'conflict';
}

/** Evolution rules, restated per action so adapters can rely on them. */
export interface ActionEvolution {
  /** Only optional fields may be added to an input/output minor revision. */
  readonly additiveOnly: true;
  /** Breaking changes ship as a new action version, never in place. */
  readonly breakingChanges: 'new-action-version';
  /** Deprecation requires a successor action id/version to exist first. */
  readonly deprecation: 'successor-required';
}

export interface ActionDiscovery {
  readonly title: string;
  readonly summary: string;
  readonly category: 'chat' | 'audience' | 'releases' | 'tasks';
  readonly bindings: readonly ActionBinding[];
}

export interface ActionDefinition<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
  E extends z.ZodType = z.ZodType,
> {
  readonly id: ActionId;
  readonly version: '1';
  readonly kind: 'mutation';
  readonly discovery: ActionDiscovery;
  readonly auth: ActionAuth;
  readonly idempotency: ActionIdempotency;
  readonly evolution: ActionEvolution;
  /** Domain error codes this action adds on top of COMMON_ERROR_CODES. */
  readonly domainErrorCodes: readonly string[];
  /** Entitlement registry keys the dispatcher must evaluate (phase 2+). */
  readonly entitlementKeys: readonly string[];
  readonly input: I;
  readonly output: O;
  readonly error: E;
}
