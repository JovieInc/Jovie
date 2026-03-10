import 'server-only';

import { eq } from 'drizzle-orm';
import { getAppUrl } from '@/constants/domains';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { generateClaimTokenPair } from '@/lib/security/claim-token';
import { filterEmail } from './email-filter';
import { detectRepresentation } from './management-filter';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

export interface RouteLeadResult {
  route: 'email' | 'dm' | 'both' | 'manual_review' | 'skipped';
  claimUrl: string;
  dmCopy: string | null;
}

export async function routeLead(leadId: string): Promise<RouteLeadResult> {
  pipelineLog('routing', 'Starting lead routing', { leadId });

  // 1. Fetch lead
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) {
    pipelineWarn('routing', 'Lead not found', { leadId });
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
  let route: 'email' | 'dm' | 'both' | 'manual_review' | 'skipped';

  if (isHighProfile || repResult.hasRepresentation) {
    route = 'manual_review';
  } else if (!emailResult.invalid && lead.hasInstagram) {
    route = 'both';
  } else if (!emailResult.invalid) {
    route = 'email';
  } else if (lead.hasInstagram) {
    route = 'dm';
  } else {
    route = 'skipped';
  }

  pipelineLog('routing', 'Route determined', {
    leadId,
    route,
    isHighProfile,
    hasRepresentation: repResult.hasRepresentation,
    emailInvalid: emailResult.invalid,
    hasInstagram: lead.hasInstagram,
  });

  // 6. Reuse token if present, otherwise generate claim token
  const token = lead.claimToken;
  const tokenHash = lead.claimTokenHash;
  const expiresAt = lead.claimTokenExpiresAt;

  const tokenPair =
    token && tokenHash && expiresAt
      ? { token, tokenHash, expiresAt }
      : await generateClaimTokenPair();
  const claimUrl = getAppUrl(`/claim/${tokenPair.token}`);

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
      .replaceAll('{displayName}', lead.displayName ?? lead.linktreeHandle)
      .replaceAll('{claimLink}', claimUrl);
  }

  // 8. Update lead row
  await db
    .update(leads)
    .set({
      outreachRoute: route,
      outreachStatus: 'pending',
      claimToken: tokenPair.token,
      claimTokenHash: tokenPair.tokenHash,
      claimTokenExpiresAt: tokenPair.expiresAt,
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
