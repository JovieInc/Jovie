import { z } from 'zod';

import type { ActionDescriptor } from '../descriptor';

/**
 * `chat.start` — begin a new conversation handoff.
 *
 * Navigation action: no required input, no mutation. The result is a
 * `handoff` to the semantic destination `chat.new`; adapters map that to
 * `/app/chat`, the native Chat tab, or a client link. An empty conversation
 * is never persisted — a conversation is reserved only when the first
 * message is submitted and acknowledged. Opening chat consumes no message
 * quota.
 */

/** Semantic handoff destination every adapter maps natively. */
export const CHAT_START_HANDOFF_TARGET = 'chat.new' as const;

export const chatStartInputSchema = z.object({});

export const chatStartOutputSchema = z.object({});

export type ChatStartInput = z.infer<typeof chatStartInputSchema>;
export type ChatStartOutput = z.infer<typeof chatStartOutputSchema>;

export const chatStartAction: ActionDescriptor<
  typeof chatStartInputSchema,
  typeof chatStartOutputSchema
> = {
  id: 'chat.start',
  schemaVersion: 1,
  titleKey: 'actions.chat.start.title',
  descriptionKey: 'actions.chat.start.description',
  effect: 'navigation',
  confirmation: 'none',
  supportedChannels: ['web', 'ios', 'electron', 'app_intent', 'widget'],
  requirements: [{ type: 'auth' }, { type: 'profile_ownership' }],
  inputSchema: chatStartInputSchema,
  outputSchema: chatStartOutputSchema,
};
