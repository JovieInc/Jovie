import { z } from 'zod';

import { actionErrorSchemaFor, COMMON_ERROR_CODES } from '../envelope';
import type { ActionDefinition } from '../metadata';
import {
  CANONICAL_AUTH,
  CANONICAL_EVOLUTION,
  CANONICAL_IDEMPOTENCY,
  mutationBaseSchema,
} from '../shared';

export const CONTACT_CREATE_DOMAIN_ERROR_CODES = [
  'CONTACT_LIMIT_EXCEEDED',
] as const;

const contactIdentity = {
  name: z.string().min(1).max(200).optional(),
  source: z.string().min(1).max(100).optional(),
};

export const contactCreateInputSchema = z.discriminatedUnion('channel', [
  mutationBaseSchema.extend({
    channel: z.literal('email'),
    value: z.email().max(320),
    ...contactIdentity,
  }),
  mutationBaseSchema.extend({
    channel: z.literal('phone'),
    /** E.164. */
    value: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Expected E.164 phone'),
    ...contactIdentity,
  }),
]);

export const contactCreateOutputSchema = z.object({
  contactId: z.uuid(),
  /** False when the idempotency key replayed an existing contact. */
  created: z.boolean(),
});

const errorCodes = [
  ...COMMON_ERROR_CODES,
  ...CONTACT_CREATE_DOMAIN_ERROR_CODES,
];

export const contactCreateErrorSchema = actionErrorSchemaFor(
  errorCodes as [string, ...string[]]
);

export type ContactCreateInput = z.infer<typeof contactCreateInputSchema>;
export type ContactCreateOutput = z.infer<typeof contactCreateOutputSchema>;

export const contactCreateAction: ActionDefinition<
  typeof contactCreateInputSchema,
  typeof contactCreateOutputSchema,
  typeof contactCreateErrorSchema
> = {
  id: 'contact.create',
  version: '1',
  kind: 'mutation',
  discovery: {
    title: 'Create contact',
    summary:
      'Create an audience contact (email or SMS subscriber) on the authenticated creator profile.',
    category: 'audience',
    bindings: [
      {
        kind: 'web-api',
        status: 'existing',
        note: 'Legacy paths: POST /api/notifications/subscribe, promo-download OTP routes, Twilio SMS webhook, saveContact server action.',
      },
      {
        kind: 'chat-tool',
        status: 'contract-only',
      },
      {
        kind: 'mcp',
        status: 'contract-only',
        note: 'Authenticated owner-workspace MCP only. The public per-artist MCP endpoint never accepts this action.',
      },
      {
        kind: 'cli',
        status: 'contract-only',
      },
    ],
  },
  auth: CANONICAL_AUTH,
  idempotency: CANONICAL_IDEMPOTENCY,
  evolution: CANONICAL_EVOLUTION,
  domainErrorCodes: CONTACT_CREATE_DOMAIN_ERROR_CODES,
  entitlementKeys: ['contactsLimit'],
  input: contactCreateInputSchema,
  output: contactCreateOutputSchema,
  error: contactCreateErrorSchema,
};
