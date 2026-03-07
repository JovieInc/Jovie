import 'server-only';

import { eq } from 'drizzle-orm';
import { getAppUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { generateClaimTokenPair } from '@/lib/security/claim-token';
import { filterEmail } from './email-filter';
import { detectRepresentation } from './management-filter';

export interface RouteLeadResult {
  route: 'email' | 'dm' | 'both' | 'manual_review';
  claimUrl: string;
  dmCopy: string | null;
}

export async function routeLead(leadId: string): Promise<RouteLeadResult> {
  // 1. Fetch lead
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // 2. Email filter
  const emailResult = lead.contactEmail
    ? filterEmail(lead.contactEmail)
    : { invalid: true, suspicious: false, reason: 'No email' };

  // 3. Management filter
  const repResult = detectRepresentation(lead.contactEmail, lead.bio);

  // 4. High-profile check
  const isHighProfile =
    (lead.spotifyFollowers !== null && lead.spotifyFollowers > 50000) ||
    (lead.spotifyPopularity !== null && lead.spotifyPopularity > 72);

  // 5. Determine route
  let route: 'email' | 'dm' | 'both' | 'manual_review';

  if (isHighProfile || repResult.hasRepresentation) {
    route = 'manual_review';
  } else if (!emailResult.invalid && lead.hasInstagram) {
    route = 'both';
  } else if (!emailResult.invalid) {
    route = 'email';
  } else if (lead.hasInstagram) {
    route = 'dm';
  } else {
    route = 'manual_review';
  }

  // 6. Generate claim token
  const { token, tokenHash, expiresAt } = await generateClaimTokenPair();
  const claimUrl = getAppUrl(`/claim/${token}`);

  // 7. Build DM copy if needed
  let dmCopy: string | null = null;
  if (route === 'dm' || route === 'both') {
    const [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1));

    const template =
      settings?.dmTemplate ??
      "Hey {displayName}! I found your Linktree and love your music on Spotify. I built Jovie to help artists like you create a better link-in-bio. Here's your free page: {claimLink}";

    dmCopy = template
      .replace(/{displayName}/g, lead.displayName ?? lead.linktreeHandle)
      .replace(/{claimLink}/g, claimUrl);
  }

  // 8. Update lead row
  await db
    .update(leads)
    .set({
      outreachRoute: route,
      outreachStatus: 'pending',
      claimToken: token,
      claimTokenHash: tokenHash,
      claimTokenExpiresAt: expiresAt,
      emailInvalid: emailResult.invalid,
      emailSuspicious: emailResult.suspicious,
      emailInvalidReason: emailResult.reason,
      hasRepresentation: repResult.hasRepresentation,
      representationSignal: repResult.signal,
      dmCopy,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  return { route, claimUrl, dmCopy };
}
