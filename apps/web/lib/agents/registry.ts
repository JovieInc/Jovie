/**
 * Public Skill Registry (partial catalog by design — JOV-3013)
 *
 * Code-side source of truth for **cataloged product skills** that are
 * mirrored into `skills_catalog` / `tools_catalog` at deploy time by
 * `scripts/sync-skills-catalog.ts` (postbuild). Admin system map, playbook
 * compile resolution, and skill lifecycle tooling read this registry.
 *
 * ## Partial catalog intent
 *
 * This registry is **NOT** the exhaustive list of tools the chat model can
 * call. Live chat tools are assembled in `app/api/chat/route.ts`
 * (`buildFreeChatTools` / `buildChatTools`), gated by plan + entitlements
 * (`lib/chat/tool-access.ts`, `lib/chat/locked-tools.ts`), and UI-labeled in
 * `lib/chat/tool-ui-registry.ts` (`TOOL_UI_REGISTRY`).
 *
 * Do **not** treat `skills_catalog` / this registry as "what the model has."
 * Only product skills that need admin visibility, playbook compile
 * resolution, or DB lifecycle tracking belong here.
 *
 * To add a **cataloged** skill:
 * 1. Add an entry here (`PUBLIC_SKILL_REGISTRY`).
 * 2. Add the corresponding entitlement to lib/entitlements/registry.ts.
 * 3. Create the style/prompt markdown at promptPath (if applicable).
 * 4. Run `pnpm --filter web drizzle:generate` if new enum values are needed.
 * 5. The postbuild hook will sync the catalog on next deploy.
 *
 * To add a **live chat tool** only: register it in the chat route builders +
 * `TOOL_UI_REGISTRY` (+ `TOOL_SCHEMAS` when eval coverage is needed). Catalog
 * it here only when it is a product skill surface.
 */

import type { SkillDefinition, ToolDefinition } from './types';

type RegistryDefinition = SkillDefinition | ToolDefinition;

/**
 * Cataloged product skills/tools for admin, playbook compile, and postbuild
 * DB sync. Intentionally a **partial** subset of live chat capabilities.
 */
export const PUBLIC_SKILL_REGISTRY = {
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
      /** Live chat tool name when this skill is exposed on chat (id may differ). */
      chatToolId: 'retouchImage',
    },
  },
} as const satisfies Record<string, RegistryDefinition>;

/**
 * Back-compat alias for `PUBLIC_SKILL_REGISTRY`. Prefer the public name in
 * new code so partial-catalog intent stays obvious (JOV-3013).
 */
export const SKILL_REGISTRY = PUBLIC_SKILL_REGISTRY;

export type SkillId = keyof typeof PUBLIC_SKILL_REGISTRY;

/**
 * Catalog skill id → live chat tool name when the skill is (or maps onto) a
 * chat tool. Skills without a chat mapping are catalog/playbook-only.
 *
 * Used by drift tests: catalog entries that claim a chat surface must stay
 * aligned with `TOOL_UI_REGISTRY`.
 */
export const PUBLIC_SKILL_CHAT_TOOL_IDS = {
  generateReleasePitch: 'generateReleasePitch',
  retouch: 'retouchImage',
} as const satisfies Partial<Record<SkillId, string>>;
