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

import type { EntityKind } from '@/lib/chat/tokens';
import type { ToolSchemaKey } from '@/lib/chat/tool-schemas';

export type CommandSurface = 'chat-slash' | 'cmdk';

export interface EntitySlot {
  readonly kind: EntityKind;
  readonly required: boolean;
}

/** A user-facing skill that wraps a single LLM tool. */
export interface SkillCommand {
  readonly kind: 'skill';
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Lucide icon name (resolved at render time). */
  readonly iconName: string;
  readonly surfaces: readonly CommandSurface[];
  readonly toolId: ToolSchemaKey;
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
 * Scope for JOV-1791: chat-slash only. Nav and cmdk entries arrive with JOV-1792.
 */
export const COMMANDS: readonly Command[] = [
  {
    kind: 'skill',
    id: 'generateAlbumArt',
    label: 'Generate album art',
    description: 'Generate three album art options for a release.',
    iconName: 'Image',
    surfaces: ['chat-slash'],
    toolId: 'generateAlbumArt',
    entitySlots: [{ kind: 'release', required: true }],
  },
  {
    kind: 'skill',
    id: 'proposeAvatarUpload',
    label: 'Change profile photo',
    description: 'Open the profile photo upload widget in chat.',
    iconName: 'UserCircle',
    surfaces: ['chat-slash'],
    toolId: 'proposeAvatarUpload',
    entitySlots: [],
  },
  {
    kind: 'skill',
    id: 'proposeSocialLink',
    label: 'Add social link',
    description: 'Add a social profile URL to your artist profile.',
    iconName: 'Link',
    surfaces: ['chat-slash'],
    toolId: 'proposeSocialLink',
    entitySlots: [],
  },
  {
    kind: 'skill',
    id: 'proposeSocialLinkRemoval',
    label: 'Remove social link',
    description: 'Remove a social link from your artist profile.',
    iconName: 'Link2Off',
    surfaces: ['chat-slash'],
    toolId: 'proposeSocialLinkRemoval',
    entitySlots: [],
  },
  {
    kind: 'skill',
    id: 'submitFeedback',
    label: 'Send feedback',
    description: 'Share feedback, report a bug, or request a feature.',
    iconName: 'MessageSquare',
    surfaces: ['chat-slash'],
    toolId: 'submitFeedback',
    entitySlots: [],
  },
] as const;

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
