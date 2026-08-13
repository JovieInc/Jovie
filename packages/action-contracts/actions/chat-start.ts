import { z } from 'zod';

import { actionErrorSchemaFor, COMMON_ERROR_CODES } from '../envelope';
import type { ActionDefinition } from '../metadata';
import {
  CANONICAL_AUTH,
  CANONICAL_EVOLUTION,
  CANONICAL_IDEMPOTENCY,
  mutationBaseSchema,
} from '../shared';

export const CHAT_START_DOMAIN_ERROR_CODES = [
  'CHAT_DISABLED',
  'TURN_IN_PROGRESS',
] as const;

export const chatStartInputSchema = mutationBaseSchema.extend({
  /** Resume an existing conversation instead of creating one. */
  conversationId: z.uuid().optional(),
  /** First user message. Omitted = create the conversation shell only. */
  message: z
    .object({
      text: z.string().min(1).max(4000),
    })
    .optional(),
  /**
   * Client-generated turn id. Anchors turn-level dedupe on top of the
   * action-level idempotency key (mirrors reserveChatTurn semantics).
   */
  clientTurnId: z.uuid().optional(),
  /** Originating surface, for telemetry and adapter-specific presentation. */
  source: z.enum(['web', 'onboarding', 'mobile', 'desktop', 'extension']),
});

export const chatStartOutputSchema = z.object({
  conversationId: z.uuid(),
  /** Present when a turn was reserved (a message was supplied). */
  turnId: z.uuid().optional(),
  status: z.enum(['created', 'resumed', 'replayed']),
});

const errorCodes = [...COMMON_ERROR_CODES, ...CHAT_START_DOMAIN_ERROR_CODES];

export const chatStartErrorSchema = actionErrorSchemaFor(
  errorCodes as [string, ...string[]]
);

export type ChatStartInput = z.infer<typeof chatStartInputSchema>;
export type ChatStartOutput = z.infer<typeof chatStartOutputSchema>;

export const chatStartAction: ActionDefinition<
  typeof chatStartInputSchema,
  typeof chatStartOutputSchema,
  typeof chatStartErrorSchema
> = {
  id: 'chat.start',
  version: '1',
  kind: 'mutation',
  discovery: {
    title: 'Start chat',
    summary:
      'Create or resume an authenticated AI chat conversation, optionally reserving the first turn.',
    category: 'chat',
    bindings: [
      {
        kind: 'web-api',
        status: 'existing',
        note: 'Legacy paths: POST /api/chat, /api/chat/conversations, /api/onboarding/welcome-chat, /api/mobile/v1/chat/turns.',
      },
      {
        kind: 'chat-tool',
        status: 'contract-only',
        note: 'Dispatcher-owned in a later phase; tools never own policy.',
      },
      {
        kind: 'swift',
        status: 'contract-only',
        note: 'App Intent binding contract only; no runtime claim.',
      },
    ],
  },
  auth: CANONICAL_AUTH,
  idempotency: CANONICAL_IDEMPOTENCY,
  evolution: CANONICAL_EVOLUTION,
  domainErrorCodes: CHAT_START_DOMAIN_ERROR_CODES,
  entitlementKeys: [],
  input: chatStartInputSchema,
  output: chatStartOutputSchema,
  error: chatStartErrorSchema,
};
