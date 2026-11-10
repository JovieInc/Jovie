import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { getOutboundClaimUrl } from '@/lib/outbound/claim-url';
import { DEFAULT_DM_TEMPLATE } from './constants';
import { filterEmail } from './email-filter';
import {
  ensureLeadClaimToken,
  persistLeadClaimToken,
} from './lead-claim-token';
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

  // 6. One canonical token per lead, stored hashed. The plaintext is derived
  // on demand (lead-claim-token.ts), never persisted. The profile holds the
  // same hash, so the link we send resolves on the claim route.
  const tokenPair = await ensureLeadClaimToken({
    id: leadId,
    claimTokenHash: lead.claimTokenHash,
    claimTokenExpiresAt: lead.claimTokenExpiresAt,
  });
  const claimUrl = getOutboundClaimUrl(tokenPair.token);
  await persistLeadClaimToken(leadId, lead.creatorProfileId, tokenPair);

  // 7. Build DM copy if needed
  let dmCopy: string | null = null;
  if (route === 'dm' || route === 'both') {
    const [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1));

    const template = settings?.dmTemplate ?? DEFAULT_DM_TEMPLATE;

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
