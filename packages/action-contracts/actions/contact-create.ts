import { z } from 'zod';

import type { ActionDescriptor } from '../descriptor';

/**
 * `contact.create` — create an internal artist contact.
 *
 * Internal write on the authenticated creator profile. Canonical
 * validation policy: at least one usable contact channel (email or phone)
 * is required; incomplete surfaces receive `requires_input` with field
 * issues before any mutation. Enforces `contactsLimit` from the canonical
 * entitlements registry at invoke time.
 */

export const CONTACT_ROLES = [
  'bookings',
  'management',
  'press_pr',
  'brand_partnerships',
  'music_collaboration',
  'fan_general',
  'other',
] as const;

export const contactRoleSchema = z.enum(CONTACT_ROLES);

export const contactCreateInputSchema = z.object({
  role: contactRoleSchema,
  customLabel: z.string().trim().min(1).max(80).optional(),
  personName: z.string().trim().min(1).max(120).optional(),
  companyName: z.string().trim().min(1).max(160).optional(),
  territories: z.array(z.string().trim().min(1)).max(8).optional(),
  email: z.email().max(254).optional(),
  /** E.164. */
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Expected E.164 phone')
    .optional(),
  preferredChannel: z.enum(['email', 'phone']).optional(),
});

export const contactCreateOutputSchema = z.object({
  contactId: z.uuid(),
  role: contactRoleSchema,
  /** Safe, non-PII-minimized display summary. */
  displayName: z.string().min(1).optional(),
});

export type ContactCreateInput = z.infer<typeof contactCreateInputSchema>;
export type ContactCreateOutput = z.infer<typeof contactCreateOutputSchema>;

export const contactCreateAction: ActionDescriptor<
  typeof contactCreateInputSchema,
  typeof contactCreateOutputSchema
> = {
  id: 'contact.create',
  schemaVersion: 1,
  titleKey: 'actions.contact.create.title',
  descriptionKey: 'actions.contact.create.description',
  effect: 'internal_write',
  confirmation: 'none',
  supportedChannels: ['web', 'ios', 'app_intent', 'chat_tool', 'mcp', 'cli'],
  requirements: [
    { type: 'auth' },
    { type: 'profile_ownership' },
    { type: 'entitlement', key: 'contactsLimit' },
  ],
  inputSchema: contactCreateInputSchema,
  outputSchema: contactCreateOutputSchema,
};
