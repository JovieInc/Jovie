import { z } from 'zod';

/**
 * Roles the closed-signup waitlist form asks for (canon/PRODUCT.md,
 * 2026-11-02). Stored on `waitlist_entries.qualification_inputs.role`, so no
 * schema change. Labels are UI copy and stay Title Case.
 *
 * Kept out of `data/` and marketing roots on purpose: the ICP-language guard
 * (MKT-D16) bans segment words on general routes; `/waitlist` is the only
 * surface that renders these labels.
 */
export const WAITLIST_ROLES = [
  { value: 'artist', label: 'Artist' },
  { value: 'manager', label: 'Manager' },
  { value: 'label', label: 'Label' },
  { value: 'producer_songwriter', label: 'Producer/Songwriter' },
  { value: 'other', label: 'Other' },
] as const;

export type WaitlistRole = (typeof WAITLIST_ROLES)[number]['value'];

export const WAITLIST_ROLE_VALUES = WAITLIST_ROLES.map(role => role.value) as [
  WaitlistRole,
  ...WaitlistRole[],
];

export const waitlistRoleSchema = z.enum(WAITLIST_ROLE_VALUES);

export function isWaitlistRole(value: unknown): value is WaitlistRole {
  return waitlistRoleSchema.safeParse(value).success;
}

export function getWaitlistRoleLabel(role: string): string {
  return WAITLIST_ROLES.find(entry => entry.value === role)?.label ?? 'Unknown';
}
