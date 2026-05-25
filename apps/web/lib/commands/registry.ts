/**
 * Shared Command registry — the source of truth for user-facing actions
 * exposed to the chat `/` menu and (later) the cmd+k palette.
 *
 * Distinct from `apps/web/lib/chat/tool-schemas.ts` (machine-facing, LLM tool
 * definitions) and from `apps/web/lib/chat/command-registry.ts` (keyword-matched
 * nav shortcuts, to be migrated when cmd+k lands in JOV-1792).
 *
 * Surfaces filter the same Command[] array via `surfaces.includes(currentSurface)`.
 * Adding a new skill here makes it appear in every enabled surface with zero
 * additional wiring.
 */

import { APP_ROUTES } from '@/constants/routes';
import type { EntityKind } from '@/lib/chat/tokens';
import type { ToolSchemaKey } from '@/lib/chat/tool-schemas';

/**
 * Backend chat tools that are deliberately NOT exposed as user-visible
 * commands. Each entry must include a non-empty reason. The parity test
 * (`registry.parity.test.ts`) asserts that every tool present in
 * `apps/web/lib/chat/tool-ui-registry.ts` is either in `COMMANDS` (visible)
 * or here (intentionally hidden) — no orphans.
 */
export const HIDDEN_TOOLS: Readonly<Record<string, string>> = {
  checkHandle:
    'Onboarding-only follow-up after Spotify identity; not useful as a standalone slash command.',
  checkCanvasStatus:
    'Diagnostic; results surface inside writeWorldClassBio / createPromoStrategy.',
  confirmSpotifyArtist:
    'Onboarding-only continuation from the Spotify picker; requires a selected candidate.',
  createMerch:
    'Conversational merch creation is gated by plan and rollout flags before broader slash exposure.',
  createPromoStrategy: 'Pro-only; surfaced via the release detail surface.',
  createRelease: 'Surfaced in the releases dashboard; chat tool is a fallback.',
  deleteOrArchiveMerchCard:
    'Merch lifecycle action shown from merch cards, not the root slash menu.',
  formatLyrics: 'Pro-only; surfaced via the lyrics surface, not slash.',
  generateCanvasPlan: 'Pro-only; surfaced via the release detail surface.',
  generateReleasePitch: 'Pro-only; surfaced via the release detail surface.',
  importBioFromUrl:
    'Triggered conversationally from an explicit URL import request before profile-edit preview.',
  markCanvasUploaded:
    'CRUD-style follow-up; surfaced inside the checkCanvasStatus card.',
  openBillingPortal:
    'Account handoff exposed from billing/account surfaces rather than chat slash.',
  optimizeMerchCards:
    'Merch optimization is an advanced card-level action, not a root slash command.',
  pauseMerchCard:
    'Merch lifecycle action shown from merch cards, not the root slash menu.',
  previewMerchOptions:
    'Conversational merch preview is gated by plan and rollout flags before broader slash exposure.',
  proposeCheckout:
    'Onboarding-only output from proposeNextStep; direct slash access would skip qualification.',
  proposeNextStep:
    'Onboarding evaluator trigger; direct slash access would bypass required intake signal.',
  proposeProfileEdit:
    'Triggered conversationally; surfacing as a slash command would duplicate proposeAvatarUpload + proposeSocialLink.',
  publishMerchCard:
    'Merch lifecycle action shown from merch cards, not the root slash menu.',
  recordInterviewSignal:
    'Silent onboarding telemetry; never user-visible as a command.',
  reorderMerchCards:
    'Merch ordering requires concrete card IDs from the merch UI, not a root slash command.',
  searchSpotifyArtist:
    'Onboarding-first identity picker; the authenticated chat slash menu should not expose it.',
  selectMerchDesign:
    'Follow-up after generated merch options; direct slash access would lack generation context.',
  showAccountStatus:
    'Account summary is triggered conversationally or from settings surfaces, not slash.',
  showArtistPayouts:
    'Internal merch payout liability is advanced/account-adjacent and not a root slash command.',
  showMerchSales:
    'Merch reporting belongs with merch/account cards rather than the root slash menu.',
  showTopInsights: 'Surfaced as a home-screen card, not a slash command.',
  showUsage:
    'Usage details are triggered conversationally or from settings surfaces, not slash.',
  suggestRelatedArtists:
    'Always part of createPromoStrategy; never a standalone user action.',
  unpauseMerchCard:
    'Merch lifecycle action shown from merch cards, not the root slash menu.',
  writeWorldClassBio:
    'Pro-only; chat surfaces it conversationally rather than via slash.',
} as const;

export type CommandSurface = 'chat-slash' | 'cmdk';

export interface EntitySlot {
  readonly kind: EntityKind;
  readonly required: boolean;
}

/**
 * A user-facing skill that wraps a single LLM tool.
 *
 * `id` is typed as `ToolSchemaKey` today so the registry can't declare a skill
 * whose id doesn't correspond to a real tool. When composite skills land
 * (one user action fanning out to multiple tools), widen this to a union.
 */
export interface SkillCommand {
  readonly kind: 'skill';
  readonly id: ToolSchemaKey;
  readonly label: string;
  readonly description: string;
  /** Lucide icon name (resolved at render time). */
  readonly iconName: string;
  readonly surfaces: readonly CommandSurface[];
  readonly entitySlots: readonly EntitySlot[];
}

/** A direct-navigation entry (cmd+k only for now). */
export interface NavCommand {
  readonly kind: 'nav';
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly iconName: string;
  readonly surfaces: readonly CommandSurface[];
  readonly href: string;
}

export type Command = SkillCommand | NavCommand;

/**
 * Registry entries. Seeded from `tool-schemas.ts` keys — one skill per tool.
 * Add new user-facing actions here, not in separate UI files.
 *
 * Skills are cross-listed on both surfaces (chat slash inserts a chip;
 * cmd+k navigates to chat with the skill chip pre-filled via `?skill=`).
 * Nav entries are cmd+k-only — chat is for skills + entity references, not
 * navigation.
 */

const BOTH_SURFACES: readonly CommandSurface[] = ['chat-slash', 'cmdk'];
const CMDK_ONLY: readonly CommandSurface[] = ['cmdk'];

function skill(
  id: ToolSchemaKey,
  label: string,
  description: string,
  iconName: string,
  entitySlots: readonly EntitySlot[] = []
): SkillCommand {
  return {
    kind: 'skill',
    id,
    label,
    description,
    iconName,
    surfaces: BOTH_SURFACES,
    entitySlots,
  };
}

function nav(
  id: string,
  label: string,
  description: string,
  iconName: string,
  href: string
): NavCommand {
  return {
    kind: 'nav',
    id,
    label,
    description,
    iconName,
    surfaces: CMDK_ONLY,
    href,
  };
}

// Nav entries mirror the primary dashboard sidebar (`dashboard-nav/config.ts`)
// so cmd+k stays in lockstep with the visible chrome — when the sidebar adds
// a route, this list should follow.
export const COMMANDS: readonly Command[] = [
  skill(
    'generateAlbumArt',
    'Generate album art',
    'Generate three album art options for a release.',
    'Image',
    [{ kind: 'release', required: true }]
  ),
  skill(
    'proposeAvatarUpload',
    'Change profile photo',
    'Open the profile photo upload widget in chat.',
    'UserCircle'
  ),
  skill(
    'proposeSocialLink',
    'Add social link',
    'Add a social profile URL to your artist profile.',
    'Link'
  ),
  skill(
    'proposeSocialLinkRemoval',
    'Remove social link',
    'Remove a social link from your artist profile.',
    'Link2Off'
  ),
  skill(
    'submitFeedback',
    'Send feedback',
    'Share feedback, report a bug, or request a feature.',
    'MessageSquare'
  ),
  nav(
    'go-profile',
    'Profile',
    'Open your profile in the chat workspace.',
    'UserCircle',
    APP_ROUTES.CHAT_PROFILE_PANEL
  ),
  nav(
    'go-chats',
    'Chats',
    'Open the all-chats workspace.',
    'MessageSquare',
    APP_ROUTES.CHATS
  ),
  nav(
    'go-releases',
    'Releases',
    'Manage your release catalog and smart links.',
    'Music',
    APP_ROUTES.RELEASES
  ),
  nav(
    'go-calendar',
    'Calendar',
    'Plan release dates and campaign moments.',
    'Calendar',
    APP_ROUTES.CALENDAR
  ),
  nav(
    'go-audience',
    'Audience',
    'Understand your audience demographics.',
    'Users',
    APP_ROUTES.AUDIENCE
  ),
  nav(
    'go-tasks',
    'Tasks',
    'Track release work and operations.',
    'CheckSquare',
    APP_ROUTES.TASKS
  ),
  nav(
    'go-settings',
    'Settings',
    'Account, billing, and artist settings.',
    'Settings',
    APP_ROUTES.SETTINGS
  ),
];

export function commandsForSurface(surface: CommandSurface): Command[] {
  return COMMANDS.filter(c => c.surfaces.includes(surface));
}

export function skillById(id: string): SkillCommand | undefined {
  return COMMANDS.find(
    (c): c is SkillCommand => c.kind === 'skill' && c.id === id
  );
}

/** Skills that accept (or require) the given entity kind in any slot. */
export function skillsApplicableTo(kind: EntityKind): SkillCommand[] {
  return COMMANDS.filter(
    (c): c is SkillCommand =>
      c.kind === 'skill' && c.entitySlots.some(s => s.kind === kind)
  );
}
