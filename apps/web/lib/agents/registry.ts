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

import type { SkillDefinition, ToolDefinition } from './types';

type RegistryDefinition = SkillDefinition | ToolDefinition;

export const SKILL_REGISTRY = {
  generateReleasePitch: {
    id: 'generateReleasePitch',
    name: 'Generate pitch',
    description:
      'Draft a destination-aware release pitch for playlists, radio, Sirius XM, installs, playback, editorial posts, record labels, or collaborators.',
    kind: 'tool',
    version: '1.0.0',
    lifecycle: 'ga',
    activeVersion: '1.0.0',
    entitlement: 'aiCanUseTools',
    model: 'anthropic/claude-haiku-4-5-20251001',
    inputSchemaZodPath: 'apps/web/lib/chat/tool-schemas.ts',
    outputSchemaZodPath: 'apps/web/components/jovie/tool-ui.tsx',
    metadata: {
      surface: 'chat',
      action: 'generate_release_pitch',
      connector: 'gmail_optional',
    },
  },
  analyzePackaging: {
    id: 'analyzePackaging',
    name: 'Analyze packaging',
    description:
      'Extract transcript summary, title/thumbnail promise, first-30s hook, and niche priors for a YouTube video.',
    kind: 'tool',
    version: '1.0.0',
    lifecycle: 'ga',
    activeVersion: '1.0.0',
    entitlement: 'aiCanUseTools',
    model: 'anthropic/claude-haiku-4-5-20251001',
    inputSchemaZodPath: 'apps/web/lib/services/packaging-intelligence/types.ts',
    outputSchemaZodPath:
      'apps/web/lib/services/packaging-intelligence/types.ts',
    metadata: {
      surface: 'youtube',
      action: 'analyze_packaging',
      connector: 'youtube',
    },
  },
  // Playbook-facing tool stubs (catalog + compile resolution). Executors may
  // land in follow-up PRs; unresolved references must fail at compile time.
  smart_link_switch_live: {
    id: 'smart_link_switch_live',
    name: 'Switch smart link live',
    description:
      'Flip a release smart link from pre-save/countdown mode to live DSP links.',
    kind: 'tool',
    version: '1.0.0',
    lifecycle: 'ga',
    activeVersion: '1.0.0',
    entitlement: 'canEditSmartLinks',
    model: 'anthropic/claude-haiku-4-5-20251001',
    metadata: {
      surface: 'smart_link',
      action: 'switch_live',
    },
  },
  fan_email_send: {
    id: 'fan_email_send',
    name: 'Send fan email',
    description:
      'Queue a fan-list email for a release announcement with the live smart link.',
    kind: 'tool',
    version: '1.0.0',
    lifecycle: 'ga',
    activeVersion: '1.0.0',
    entitlement: 'canAccessEmailCampaigns',
    model: 'anthropic/claude-haiku-4-5-20251001',
    metadata: {
      surface: 'email',
      action: 'fan_send',
    },
  },
  retouch: {
    id: 'retouch',
    name: 'Retouch image',
    description:
      'AI retouching using the White Space style (Kodak Portra cinematic editorial). Hard identity-preservation guardrails.',
    kind: 'vertical_agent',
    version: '1.0.0',
    lifecycle: 'ga',
    activeVersion: '1.0.0',
    entitlement: 'canAccessAiRetouching',
    model: 'google/gemini-2.5-flash-image',
    promptPath: 'apps/web/lib/services/retouching/styles/white-space.md',
    metadata: {
      surface: 'image',
      action: 'retouch_image',
      style: 'white-space',
    },
  },
} as const satisfies Record<string, RegistryDefinition>;

export type SkillId = keyof typeof SKILL_REGISTRY;
