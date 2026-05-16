/**
 * Agent Skill Registry
 *
 * Code-side source of truth for all deployed skills. The DB mirror
 * (skills_catalog) is kept in sync at deploy time by
 * scripts/sync-skills-catalog.ts via the postbuild hook.
 *
 * To add a new skill:
 * 1. Add an entry here.
 * 2. Add the corresponding entitlement to lib/entitlements/registry.ts.
 * 3. Create the style/prompt markdown at promptPath (if applicable).
 * 4. Run `pnpm --filter web drizzle:generate` if new enum values are needed.
 * 5. The postbuild hook will sync the catalog on next deploy.
 */

import type { SkillDefinition } from './types';

export const SKILL_REGISTRY = {
  retouch: {
    id: 'retouch',
    name: 'Retouch image',
    description:
      'AI retouching using the White Space style (Kodak Portra cinematic editorial). Hard identity-preservation guardrails.',
    kind: 'vertical_agent',
    version: '1.0.0',
    entitlement: 'ai_retouching',
    model: 'google/gemini-2.5-flash-image',
    promptPath: 'apps/web/lib/services/retouching/styles/white-space.md',
    metadata: {
      surface: 'image',
      action: 'retouch_image',
      style: 'white-space',
    },
  },
} as const satisfies Record<string, SkillDefinition>;

export type SkillId = keyof typeof SKILL_REGISTRY;
