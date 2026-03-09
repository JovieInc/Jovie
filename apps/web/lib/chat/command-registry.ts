import { toast } from 'sonner';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Deterministic chat commands that bypass AI processing.
 * Each command defines keyword patterns and a direct action to execute.
 */

interface CommandMatch {
  /** Confirmation message shown in chat as an assistant response */
  readonly confirmationMessage: string;
  /** Action to execute — receives context about the current user */
  readonly execute: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandContext {
  readonly username?: string;
  readonly router: { push: (path: string) => void };
}

interface CommandDefinition {
  /** Keywords that ALL must be present (case-insensitive) for a match */
  readonly keywords: readonly string[];
  /** Action and confirmation message */
  readonly result: (ctx: CommandContext) => CommandMatch;
}

const COMMANDS: readonly CommandDefinition[] = [
  {
    keywords: ['preview', 'profile'],
    result: ctx => ({
      confirmationMessage: ctx.username
        ? `Opening your profile in a new tab.`
        : `I couldn't determine your username. Please check your profile settings.`,
      execute: () => {
        if (ctx.username) {
          window.open(`/${ctx.username}`, '_blank');
        }
      },
    }),
  },
  {
    keywords: ['show', 'profile'],
    result: ctx => ({
      confirmationMessage: ctx.username
        ? `Opening your profile in a new tab.`
        : `I couldn't determine your username. Please check your profile settings.`,
      execute: () => {
        if (ctx.username) {
          window.open(`/${ctx.username}`, '_blank');
        }
      },
    }),
  },
  {
    keywords: ['open', 'settings'],
    result: ctx => ({
      confirmationMessage: 'Navigating to settings.',
      execute: () => {
        ctx.router.push(APP_ROUTES.SETTINGS);
      },
    }),
  },
  {
    keywords: ['copy', 'link'],
    result: ctx => ({
      confirmationMessage: ctx.username
        ? `Copied jov.ie/${ctx.username} to your clipboard.`
        : `I couldn't determine your username. Please check your profile settings.`,
      execute: async () => {
        if (!ctx.username) return;
        const url = `https://jov.ie/${ctx.username}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Link copied to clipboard');
        } catch {
          toast.error('Failed to copy link');
        }
      },
    }),
  },
  {
    keywords: ['show', 'releases'],
    result: ctx => ({
      confirmationMessage: 'Navigating to your releases.',
      execute: () => {
        ctx.router.push(APP_ROUTES.RELEASES);
      },
    }),
  },
  {
    keywords: ['share', 'profile'],
    result: ctx => ({
      confirmationMessage: ctx.username
        ? `Sharing your profile link.`
        : `I couldn't determine your username. Please check your profile settings.`,
      execute: async () => {
        if (!ctx.username) return;
        const url = `https://jov.ie/${ctx.username}`;
        try {
          await navigator.clipboard.writeText(url);
          if (navigator.share) {
            await navigator.share({ title: 'My Jovie Profile', url });
          } else {
            toast.success('Link copied to clipboard');
          }
        } catch {
          // User cancelled share sheet or clipboard failed — toast as fallback
          toast.success('Link copied to clipboard');
        }
      },
    }),
  },
];

/**
 * Normalizes input text for keyword matching:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Attempts to match user input against deterministic commands.
 * Returns the command match if found, or null to pass through to AI.
 */
export function matchCommand(
  input: string,
  ctx: CommandContext
): CommandMatch | null {
  const normalized = normalize(input);
  // Short inputs (< 2 words) are unlikely to be commands
  if (normalized.split(' ').length < 2) return null;
  // Long inputs (> 8 words) are likely freeform questions for AI
  if (normalized.split(' ').length > 8) return null;

  for (const cmd of COMMANDS) {
    if (cmd.keywords.every(kw => normalized.includes(kw))) {
      return cmd.result(ctx);
    }
  }

  return null;
}
