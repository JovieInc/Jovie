/**
 * Canonical inventory of tool ids the main authenticated chat route may
 * expose (free + paid + plan-locked stubs).
 *
 * Runtime plan gating can hide or lock tools, so this is the **union** of
 * possible ids — not the always-on set.
 *
 * ## Boundary with PUBLIC_SKILL_REGISTRY / SKILL_REGISTRY
 *
 * `PUBLIC_SKILL_REGISTRY` (`apps/web/lib/agents/registry.ts`) is a
 * **productized skill catalog** synced to `skills_catalog` / `tools_catalog`
 * for admin, playbook compile, and lifecycle. It is intentionally a subset
 * and must **not** be treated as the source of truth for which tools the
 * chat model can call.
 *
 * Chat tool access is plan-driven (`tool-access.ts`, `locked-tools.ts`).
 * When adding a chat tool:
 * 1. Register it here (`CHAT_ROUTE_TOOL_IDS`).
 * 2. Wire it in `app/api/chat/route.ts` (or account/onboarding builders).
 * 3. Add UI copy in `tool-ui-registry.ts` when the tool needs a status row.
 * 4. Only add to `PUBLIC_SKILL_REGISTRY` if productizing (lifecycle, admin,
 *    playbook compile, catalog sync).
 */

export const CHAT_ROUTE_TOOL_IDS = [
  // Free-tier profile / feedback
  'proposeAvatarUpload',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
  'submitFeedback',
  // Account (all plans)
  'showAccountStatus',
  'showUsage',
  'openBillingPortal',
  // Paid-tier creative / profile tools
  'showTopInsights',
  'showChannelIntelligence',
  'proposeProfileEdit',
  'importBioFromUrl',
  'checkCanvasStatus',
  'suggestRelatedArtists',
  'writeWorldClassBio',
  'generateCanvasPlan',
  'generateAlbumArt',
  'retouchImage',
  'createPromoStrategy',
  'voicePromo',
  'markCanvasUploaded',
  'formatLyrics',
  'createRelease',
  'generateReleasePitch',
  // Merch suite
  'findMerchSources',
  'createMerch',
  'previewMerchOptions',
  'selectMerchDesign',
  'createMerchAlternativeItem',
  'updateMerchCard',
  'publishMerchCard',
  'pauseMerchCard',
  'unpauseMerchCard',
  'deleteOrArchiveMerchCard',
  'reorderMerchCards',
  'optimizeMerchCards',
  'showMerchSales',
  'showArtistPayouts',
  // Feature-flagged / locked stubs
  'proposeVideoRecording',
  'manageTasks',
] as const;

export type ChatRouteToolId = (typeof CHAT_ROUTE_TOOL_IDS)[number];

export const CHAT_ROUTE_TOOL_ID_SET: ReadonlySet<string> = new Set(
  CHAT_ROUTE_TOOL_IDS
);

/**
 * Assert every assembled chat tool id is in the inventory.
 * Call after free + paid + locked tool sets are merged.
 *
 * Fails closed so unregistered tools cannot ship silently.
 */
export function assertChatToolsRegistered(
  tools: Readonly<Record<string, unknown>>,
  inventory: ReadonlySet<string> = CHAT_ROUTE_TOOL_ID_SET
): void {
  const unregistered = Object.keys(tools).filter(name => !inventory.has(name));
  if (unregistered.length === 0) {
    return;
  }

  throw new Error(
    `Chat tools missing from CHAT_ROUTE_TOOL_IDS: ${unregistered.sort().join(', ')}. ` +
      'Add them to apps/web/lib/chat/chat-tool-inventory.ts. ' +
      'Do not use PUBLIC_SKILL_REGISTRY/SKILL_REGISTRY as the chat tool inventory ' +
      '(that catalog is productized skills only).'
  );
}
