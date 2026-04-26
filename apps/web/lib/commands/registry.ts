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
    'go-releases',
    'Releases',
    'Manage your release catalog and smart links.',
    'Music',
    APP_ROUTES.DASHBOARD_RELEASES
  ),
  nav(
    'go-audience',
    'Audience',
    'Understand your audience demographics.',
    'Users',
    APP_ROUTES.DASHBOARD_AUDIENCE
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
