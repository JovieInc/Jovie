/**
 * Playbook → Skill compiler (JOV-3945).
 *
 * Turns a validated PlaybookDefinition into a typed SkillDefinition suitable
 * for skills_catalog registration at lifecycle=`draft`. Tool references are
 * resolved against SKILL_REGISTRY (kind=tool) — unresolved tools are compile
 * errors, never runtime surprises.
 */

import { SKILL_REGISTRY } from '@/lib/agents/registry';
import type { SkillDefinition, ToolDefinition } from '@/lib/agents/types';
import type { BooleanEntitlement } from '@/lib/entitlements/registry';
import type { PlaybookDefinition } from './schema';

export type PlaybookCompileRule =
  | 'unresolved-tool'
  | 'invalid-playbook'
  | 'duplicate-version';

export interface PlaybookCompileError {
  readonly rule: PlaybookCompileRule;
  readonly message: string;
  readonly path?: string;
}

export type PlaybookCompileResult =
  | { readonly ok: true; readonly skill: SkillDefinition }
  | { readonly ok: false; readonly errors: PlaybookCompileError[] };

const DEFAULT_PLAYBOOK_MODEL = 'anthropic/claude-haiku-4-5-20251001';
const DEFAULT_PLAYBOOK_ENTITLEMENT: BooleanEntitlement = 'aiCanUseTools';

const BOOLEAN_ENTITLEMENTS = new Set<string>([
  'canExportContacts',
  'canAccessAdvancedAnalytics',
  'canFilterSelfFromAnalytics',
  'canAccessAdPixels',
  'canBeVerified',
  'aiCanUseTools',
  'canGenerateAlbumArt',
  'canCreateManualReleases',
  'canAccessTasksWorkspace',
  'canGenerateReleasePlans',
  'canAccessMetadataSubmissionAgent',
  'canAccessFutureReleases',
  'canSendNotifications',
  'canEditSmartLinks',
  'canAccessInbox',
  'canAccessPreSave',
  'canAccessTipping',
  'canAccessUrlEncryption',
  'canAccessStripeConnect',
  'canAccessFanSubscriptions',
  'canAccessEmailCampaigns',
  'canAccessApiKeys',
  'canAccessTeamManagement',
  'canAccessWebhooks',
  'canAccessWhiteLabel',
  'canAccessAbTesting',
  'canAccessMerchCreation',
  'canAccessAiRetouching',
]);

/**
 * Tool ids known to the agent registry. Only `kind: 'tool'` entries count —
 * vertical agents are not valid playbook tool_call targets.
 */
export function getRegistryToolIds(
  registry: Record<string, { id: string; kind: string }> = SKILL_REGISTRY
): ReadonlySet<string> {
  return new Set(
    Object.values(registry)
      .filter(entry => entry.kind === 'tool')
      .map(entry => entry.id)
  );
}

function resolveEntitlement(required: readonly string[]): BooleanEntitlement {
  for (const key of required) {
    if (BOOLEAN_ENTITLEMENTS.has(key)) {
      return key as BooleanEntitlement;
    }
  }
  return DEFAULT_PLAYBOOK_ENTITLEMENT;
}

function buildSkillMetadata(
  playbook: PlaybookDefinition
): Record<string, string> {
  return {
    surface: 'playbook',
    action: 'run_playbook',
    playbookId: playbook.id,
    playbookVersion: playbook.version,
    successMetricName: playbook.successMetric.name,
    successMetricSource: playbook.successMetric.source,
    successMetricDirection: playbook.successMetric.direction,
    successMetricWindow: playbook.successMetric.window,
    ...(playbook.successMetric.eventName
      ? { successMetricEventName: playbook.successMetric.eventName }
      : {}),
    evalSeedCount: String(playbook.evalSeeds.length),
    // Compact seed names for admin/eval discovery (not full fixtures).
    evalSeedNames: playbook.evalSeeds.map(seed => seed.name).join(','),
    requiredTools: playbook.requiredTools.join(','),
    requiredConnectors: playbook.requiredConnectors.join(','),
    costCredits:
      playbook.costEstimate.credits !== undefined
        ? String(playbook.costEstimate.credits)
        : '',
    costUsd:
      playbook.costEstimate.usd !== undefined
        ? String(playbook.costEstimate.usd)
        : '',
  };
}

/**
 * Compile a validated playbook into a draft SkillDefinition.
 * Does not write to the database — use registerCompiledSkill for that.
 */
export function compilePlaybookToSkill(
  playbook: PlaybookDefinition,
  options?: {
    readonly knownTools?: ReadonlySet<string>;
    readonly model?: string;
  }
): PlaybookCompileResult {
  const knownTools = options?.knownTools ?? getRegistryToolIds();
  const errors: PlaybookCompileError[] = [];

  for (const toolId of playbook.requiredTools) {
    if (!knownTools.has(toolId)) {
      errors.push({
        rule: 'unresolved-tool',
        path: 'requiredTools',
        message: `Unresolved tool reference "${toolId}" — not present in SKILL_REGISTRY tools`,
      });
    }
  }

  playbook.steps.forEach((step, index) => {
    if (step.kind === 'tool_call' && !knownTools.has(step.tool)) {
      errors.push({
        rule: 'unresolved-tool',
        path: `steps[${index}].tool`,
        message: `Step ${index + 1} references unresolved tool "${step.tool}"`,
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const skill: SkillDefinition = {
    id: playbook.id,
    name: playbook.title,
    description: playbook.problemStatement,
    kind: 'vertical_agent',
    version: playbook.version,
    lifecycle: 'draft',
    activeVersion: playbook.version,
    entitlement: resolveEntitlement(playbook.requiredEntitlements),
    model: options?.model ?? DEFAULT_PLAYBOOK_MODEL,
    promptPath: `docs/playbooks/${playbook.id}.playbook.md`,
    metadata: buildSkillMetadata(playbook),
  };

  return { ok: true, skill };
}

/** Type guard helper for tests / callers working with registry tools. */
export function isToolDefinition(
  entry: SkillDefinition | ToolDefinition
): entry is ToolDefinition {
  return entry.kind === 'tool';
}
