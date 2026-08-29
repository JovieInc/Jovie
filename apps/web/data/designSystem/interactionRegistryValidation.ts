import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTERACTION_DISMISSAL_POLICIES,
  INTERACTION_FAMILY_IDS,
  INTERACTION_FOCUS_POLICIES,
  INTERACTION_GEOMETRY_MODES,
  INTERACTION_KEYBOARD_POLICIES,
  INTERACTION_MOTION_INTENTS,
  INTERACTION_REDUCED_MOTION_POLICIES,
  INTERACTION_REGISTRY,
  INTERACTION_ROLES,
  type InteractionRegistryEntry,
} from './interactionRegistry';

export type InteractionRegistryIssueCode =
  | 'duplicate-alias'
  | 'duplicate-interaction-owner'
  | 'duplicate-interaction-role'
  | 'invalid-dismissal-policy'
  | 'invalid-focus-policy'
  | 'invalid-geometry-mode'
  | 'invalid-interaction-id'
  | 'invalid-keyboard-policy'
  | 'invalid-motion-intent'
  | 'invalid-reduced-motion-policy'
  | 'missing-interaction-family'
  | 'missing-interaction-owner'
  | 'missing-story-evidence'
  | 'missing-test-evidence';

export interface InteractionRegistryIssue {
  readonly code: InteractionRegistryIssueCode;
  readonly id: string;
}

const has = (value?: string | null): value is string => Boolean(value?.trim());
const push = (
  issues: InteractionRegistryIssue[],
  code: InteractionRegistryIssueCode,
  id: string
) => issues.push({ code, id });
const isStory = (sourcePath: string) =>
  /\.stories\.[cm]?[jt]sx?$/.test(sourcePath);
const isTest = (sourcePath: string) =>
  /\.(?:test|spec|interaction\.test)\.[cm]?[jt]sx?$/.test(sourcePath);
const sourceExists = (repoRoot: string | null, sourcePath: string) =>
  repoRoot === null || existsSync(resolve(repoRoot, sourcePath));

export function validateInteractionRegistry({
  entries = INTERACTION_REGISTRY,
  repoRoot = null,
}: {
  readonly entries?: readonly InteractionRegistryEntry[];
  readonly repoRoot?: string | null;
} = {}): readonly InteractionRegistryIssue[] {
  const issues: InteractionRegistryIssue[] = [];
  const ids = new Set<string>();
  const roles = new Set<string>();
  const owners = new Set<string>();
  const aliases = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) push(issues, 'invalid-interaction-id', entry.id);
    ids.add(entry.id);

    if (
      !INTERACTION_ROLES.includes(entry.role) ||
      entry.id !== `interaction.${entry.role}`
    ) {
      push(issues, 'invalid-interaction-id', entry.id);
    }
    if (roles.has(entry.role)) {
      push(issues, 'duplicate-interaction-role', entry.role);
    }
    roles.add(entry.role);

    const ownerKey = `${entry.owner.sourcePath}::${entry.owner.exportName}`;
    if (
      !has(entry.owner.sourcePath) ||
      !has(entry.owner.exportName) ||
      !sourceExists(repoRoot, entry.owner.sourcePath)
    ) {
      push(issues, 'missing-interaction-owner', entry.id);
    } else if (owners.has(ownerKey)) {
      push(issues, 'duplicate-interaction-owner', entry.id);
    }
    owners.add(ownerKey);

    if (
      !has(entry.storySource) ||
      !isStory(entry.storySource) ||
      !sourceExists(repoRoot, entry.storySource)
    ) {
      push(issues, 'missing-story-evidence', entry.id);
    }
    if (
      !entry.testSources.length ||
      entry.testSources.some(
        sourcePath =>
          !has(sourcePath) ||
          !isTest(sourcePath) ||
          !sourceExists(repoRoot, sourcePath)
      )
    ) {
      push(issues, 'missing-test-evidence', entry.id);
    }

    if (!INTERACTION_GEOMETRY_MODES.includes(entry.geometry)) {
      push(issues, 'invalid-geometry-mode', entry.id);
    }
    if (!INTERACTION_FOCUS_POLICIES.includes(entry.focus)) {
      push(issues, 'invalid-focus-policy', entry.id);
    }
    if (!INTERACTION_KEYBOARD_POLICIES.includes(entry.keyboard)) {
      push(issues, 'invalid-keyboard-policy', entry.id);
    }
    if (!INTERACTION_DISMISSAL_POLICIES.includes(entry.dismissal)) {
      push(issues, 'invalid-dismissal-policy', entry.id);
    }
    if (!INTERACTION_MOTION_INTENTS.includes(entry.motion)) {
      push(issues, 'invalid-motion-intent', entry.id);
    }
    if (!INTERACTION_REDUCED_MOTION_POLICIES.includes(entry.reducedMotion)) {
      push(issues, 'invalid-reduced-motion-policy', entry.id);
    }

    for (const alias of entry.duplicateAliases) {
      if (!has(alias) || aliases.has(alias)) {
        push(issues, 'duplicate-alias', entry.id);
      }
      aliases.add(alias);
    }
  }

  for (const id of INTERACTION_FAMILY_IDS) {
    if (!ids.has(id)) push(issues, 'missing-interaction-family', id);
  }

  return issues;
}
