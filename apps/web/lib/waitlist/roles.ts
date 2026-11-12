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

/**
 * The one list of artist-side role choices a visitor picks from, on the
 * homepage chips and the /waitlist radios alike. Producer and Songwriter are
 * separate choices that store the one `producer_songwriter` role.
 */
export const WAITLIST_ROLE_CHOICES = [
  { key: 'artist', label: 'Artist', role: 'artist' },
  { key: 'manager', label: 'Manager', role: 'manager' },
  { key: 'label', label: 'Label', role: 'label' },
  { key: 'producer', label: 'Producer', role: 'producer_songwriter' },
  { key: 'songwriter', label: 'Songwriter', role: 'producer_songwriter' },
  { key: 'other', label: 'Other', role: 'other' },
] as const satisfies ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly role: (typeof WAITLIST_ROLES)[number]['value'];
}>;

/** The company homepage asks for context without assuming a particular industry. */
export const GENERAL_WAITLIST_ROLES = [
  { value: 'individual', label: 'Myself' },
  { value: 'team', label: 'A team' },
  { value: 'organization', label: 'An organization' },
  { value: 'other', label: 'Other' },
] as const;

const ALL_WAITLIST_ROLES = [...WAITLIST_ROLES, ...GENERAL_WAITLIST_ROLES];
export type WaitlistRole = (typeof ALL_WAITLIST_ROLES)[number]['value'];

export const WAITLIST_ROLE_VALUES = [
  ...new Set(ALL_WAITLIST_ROLES.map(role => role.value)),
] as [WaitlistRole, ...WaitlistRole[]];

export function getWaitlistRoleLabel(role: string): string {
  return (
    ALL_WAITLIST_ROLES.find(entry => entry.value === role)?.label ?? 'Unknown'
  );
}
