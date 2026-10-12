export interface LeadQualificationDecision {
  status: 'qualified' | 'disqualified';
  disqualificationReason: string | null;
}

export interface LeadQualificationInput {
  displayName: string | null;
  links: ReadonlyArray<{ url: string }>;
}

/**
 * Identity-only qualification: a public display name plus at least one public
 * link qualifies. Spotify and music-tool presence are recorded as fit
 * observations, never prerequisites. Public badges, branding, and tool links
 * are observations, not proof of paid access or commercial intent.
 */
export function decideLeadQualification(
  input: LeadQualificationInput
): LeadQualificationDecision {
  const hasName = (input.displayName ?? '').trim().length > 0;
  const hasPublicLink = input.links.some(link => link.url.trim().length > 0);
  if (hasName && hasPublicLink) {
    return { status: 'qualified', disqualificationReason: null };
  }

  return {
    status: 'disqualified',
    disqualificationReason: 'insufficient_identity',
  };
}
