/**
 * Entitlement-locked chat tool stubs (GH #13304).
 *
 * When a plan denies a gated chat capability, the tool stays VISIBLE to the
 * model but its execute is swapped for a stub returning
 * `{ locked: true, reason, plan_required, upgrade_cta }`. The model then
 * explains what it would produce and the chat UI renders a single upgrade
 * prompt — instead of erroring or dead-ending the turn (Best-UX guardrail #1:
 * never reject what you can degrade).
 *
 * Lock copy is derived from the entitlement registry — one schema, no
 * drifting copy.
 */

import { tool } from 'ai';
import {
  type BooleanEntitlement,
  ENTITLEMENT_REGISTRY,
  type PlanId,
} from '@/lib/entitlements/registry';
import { TOOL_SCHEMAS } from './tool-schemas';
import { getToolUiConfig } from './tool-ui-registry';

/**
 * Chat tools that may be plan-locked, mapped to the registry gate that
 * controls them. Merch is represented by its two generative entry points —
 * the management tools (publish/pause/reorder/…) are meaningless without a
 * generation, so they stay hidden when the plan denies merch.
 */
export const LOCKABLE_CHAT_TOOL_GATES = {
  generateAlbumArt: 'canGenerateAlbumArt',
  retouchImage: 'canAccessAiRetouching',
  createMerch: 'canAccessMerchCreation',
  previewMerchOptions: 'canAccessMerchCreation',
} as const satisfies Partial<
  Record<keyof typeof TOOL_SCHEMAS, BooleanEntitlement>
>;

export type LockableChatToolName = keyof typeof LOCKABLE_CHAT_TOOL_GATES;

/** Paid plans in upgrade order — the first one granting a gate is the ask. */
const PAID_PLAN_UPGRADE_ORDER: readonly PlanId[] = ['pro', 'max'];

export interface LockedToolResult {
  /** Success-shaped so the chat stream renders a status row, not an error. */
  readonly success: true;
  readonly locked: true;
  /** Registry gate that denied the call (exact entitlement key). */
  readonly gate: BooleanEntitlement;
  /** Human-readable lock copy naming the exact gate + plan. */
  readonly reason: string;
  /** Display name of the lowest plan that unlocks the gate (e.g. "Pro"). */
  readonly plan_required: string;
  /** Short call-to-action line for the model to relay. */
  readonly upgrade_cta: string;
  /** Status-row summary rendered by the chat transcript. */
  readonly summary: string;
}

export interface LockedToolPromptInfo {
  readonly name: LockableChatToolName;
  readonly label: string;
  readonly planRequired: string;
}

/**
 * Lowest paid plan whose registry entry grants the gate. Falls back to Pro
 * if no plan grants it (should not happen for lockable tools).
 */
export function resolveRequiredPlanForGate(gate: BooleanEntitlement): {
  readonly planId: PlanId;
  readonly displayName: string;
} {
  for (const planId of PAID_PLAN_UPGRADE_ORDER) {
    if (ENTITLEMENT_REGISTRY[planId].booleans[gate]) {
      return {
        planId,
        displayName: ENTITLEMENT_REGISTRY[planId].marketing.displayName,
      };
    }
  }
  return {
    planId: 'pro',
    displayName: ENTITLEMENT_REGISTRY.pro.marketing.displayName,
  };
}

/** Build the structured locked payload for a gated tool. */
export function buildLockedToolResult(
  toolName: LockableChatToolName
): LockedToolResult {
  const gate = LOCKABLE_CHAT_TOOL_GATES[toolName];
  const plan = resolveRequiredPlanForGate(gate);
  const label = getToolUiConfig(toolName).label;

  return {
    success: true,
    locked: true,
    gate,
    reason: `${label} is locked on this artist's current plan — it requires the ${plan.displayName} plan (entitlement gate: ${gate}).`,
    plan_required: plan.displayName,
    upgrade_cta: `Upgrade to ${plan.displayName} to unlock ${label.toLowerCase()}.`,
    summary: `${label} requires the ${plan.displayName} plan.`,
  };
}

/**
 * Locked stub: same description + input schema as the real tool (so the
 * model can call it naturally), but execute returns the locked payload
 * instead of doing the work.
 */
export function createLockedToolStub(toolName: LockableChatToolName) {
  const schema = TOOL_SCHEMAS[toolName];
  return tool({
    description: schema.description,
    inputSchema: schema.inputSchema,
    execute: async () => buildLockedToolResult(toolName),
  } as never);
}

/**
 * Names of lockable tools the given plan booleans deny. Boolean-driven so a
 * paid plan (or a billing-verification outage that preserves real plan
 * booleans) never sees a false "upgrade" lock.
 */
export function resolveLockedChatTools(
  booleans: Record<BooleanEntitlement, boolean>
): LockableChatToolName[] {
  return (
    Object.entries(LOCKABLE_CHAT_TOOL_GATES) as ReadonlyArray<
      [LockableChatToolName, BooleanEntitlement]
    >
  )
    .filter(([, gate]) => !booleans[gate])
    .map(([name]) => name);
}

/** Build the locked stub tool set for the denied tool names. */
export function buildLockedToolSet(names: readonly LockableChatToolName[]) {
  return Object.fromEntries(
    names.map(name => [name, createLockedToolStub(name)] as const)
  );
}

/** Prompt-facing summaries for the locked tools this turn. */
export function buildLockedToolPromptInfo(
  names: readonly LockableChatToolName[]
): LockedToolPromptInfo[] {
  return names.map(name => {
    const gate = LOCKABLE_CHAT_TOOL_GATES[name];
    return {
      name,
      label: getToolUiConfig(name).label,
      planRequired: resolveRequiredPlanForGate(gate).displayName,
    };
  });
}

/** Type guard the chat UI uses to detect a locked tool output. */
export function isLockedToolOutput(
  output: Record<string, unknown> | undefined
): output is Record<string, unknown> & {
  locked: true;
  reason?: string;
  plan_required?: string;
} {
  return output?.locked === true;
}
