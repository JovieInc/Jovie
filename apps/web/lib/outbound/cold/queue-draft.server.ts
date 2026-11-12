import 'server-only';

import { eq } from 'drizzle-orm';
import { getContactCertificationInspection } from '@/lib/admin/contact-certification';
import {
  type CanonicalContactListRow,
  getCanonicalContactByKey,
  getCanonicalContactsByKeys,
} from '@/lib/admin/contacts';
import { contactDedupeKey } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { emailSuppressions } from '@/lib/db/schema/suppression';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { normalizePlatformKey, STREAMING_DSP_KEYS } from '@/lib/dsp-registry';
import {
  EMAIL_STREAM_REGISTRY,
  getStreamDomain,
  isCoreDomain,
  streamFromEmail,
  streamPolicy,
} from '@/lib/email/streams';
import { buildClaimInviteUnsubscribeUrl } from '@/lib/email/unsubscribe-token';
import { hashEmail } from '@/lib/notifications/suppression';
import {
  getProfileByUsername,
  getProfileSocialLinks,
} from '@/lib/services/profile/queries';
import { getOutboundClaimUrl } from '../claim-url';
import type { OutboundLeadFacts } from '../queue';
import { isPlausibleMailingAddress } from './compliance';
import type { ColdQueueDraftContext } from './queue-draft';

/** One lazy canonical CRM read per queue request, never a process-wide cache. */
export function createColdQueueDraftContextReader(keys: readonly string[]) {
  let contacts: Promise<Map<string, CanonicalContactListRow>> | undefined;
  return (facts: OutboundLeadFacts, now: Date) =>
    readColdQueueDraftContext(facts, now, async key => {
      contacts ??= getCanonicalContactsByKeys(keys);
      return (await contacts).get(key) ?? null;
    });
}

/** No providers, writes, token persistence or send authority. Missing inputs close drafting. */
export async function readColdQueueDraftContext(
  facts: OutboundLeadFacts,
  now: Date,
  lookupContact: (
    key: string
  ) => Promise<CanonicalContactListRow | null> = getCanonicalContactByKey
): Promise<ColdQueueDraftContext | null> {
  if (
    !facts.certified ||
    !facts.creatorProfileId ||
    !facts.profileUsername ||
    !facts.claimToken ||
    !facts.contactEmail?.trim()
  )
    return null;
  const policy = streamPolicy('cold');
  const domain = getStreamDomain('cold');
  const fromAddress = streamFromEmail('cold');
  const mailingAddress =
    process.env[EMAIL_STREAM_REGISTRY.mailingAddressEnv]?.trim() || null;
  // The registry is currently closed/unconfigured. Never substitute the target
  // domain, transactional sender, a sample address or an invented unsubscribe URL.
  if (
    policy.status !== 'open' ||
    !domain ||
    isCoreDomain(domain) ||
    !fromAddress ||
    !isPlausibleMailingAddress(mailingAddress)
  )
    return null;
  const recipientEmail = facts.contactEmail.trim().toLowerCase();
  try {
    const unsubscribeUrl = buildClaimInviteUnsubscribeUrl(recipientEmail);
    if (!unsubscribeUrl) return null;
    const key = contactDedupeKey({
      email: facts.contactEmail,
      handle: facts.linktreeHandle,
    });
    const contact = key ? await lookupContact(key) : null;
    if (
      !contact ||
      contact.creatorProfileId !== facts.creatorProfileId ||
      contact.email?.trim().toLowerCase() !== recipientEmail
    )
      return null;
    const inspection = await getContactCertificationInspection(contact, now);
    if (
      inspection.status !== 'certified_for_outreach' ||
      !inspection.canCertify
    )
      return null;
    const [profile, releases, links, suppression] = await Promise.all([
      getProfileByUsername(facts.profileUsername),
      getReleasesForProfileLite(facts.creatorProfileId),
      getProfileSocialLinks(facts.creatorProfileId),
      // The cold contract covers any opt-out, bounce or complaint, ever.
      db.query.emailSuppressions.findFirst({
        where: eq(emailSuppressions.emailHash, hashEmail(recipientEmail)),
      }),
    ]);
    if (
      !profile ||
      profile.id !== facts.creatorProfileId ||
      !profile.displayName?.trim()
    )
      return null;
    if (profile.displayName !== contact.displayName) return null;
    const accepted = inspection.items.filter(item => item.decision !== 'no');
    if (
      !accepted.some(
        item =>
          item.key === 'canonical:email' &&
          item.value.trim().toLowerCase() === recipientEmail
      )
    )
      return null;
    if (
      !accepted.some(
        item =>
          item.key === 'canonical:display-name' &&
          item.value === profile.displayName
      )
    )
      return null;
    if (
      releases.some(
        release =>
          !accepted.some(
            item =>
              item.key === `release:${release.id}` &&
              (item.value === release.title ||
                item.value.startsWith(`${release.title} · `))
          )
      )
    )
      return null;
    const streamingLinks = links.filter(link => {
      const platform = normalizePlatformKey(link.platform);
      return platform && STREAMING_DSP_KEYS.includes(platform);
    });
    if (
      streamingLinks.some(
        link =>
          !link.url ||
          !accepted.some(
            item => item.category === 'dsp' && item.url === link.url
          )
      )
    )
      return null;
    const platforms = new Set(
      links.flatMap(link => {
        const key = normalizePlatformKey(link.platform);
        return key && STREAMING_DSP_KEYS.includes(key) && link.url ? [key] : [];
      })
    );
    const latest = releases[0];
    return {
      profileId: profile.id,
      recipientEmail,
      artifact: {
        artistName: profile.displayName,
        firstName: null,
        claimUrl: getOutboundClaimUrl(facts.claimToken, { tracked: true }),
        artifact: 'profile',
        releaseCount: releases.length,
        platformCount: platforms.size,
        latestRelease:
          latest?.releaseDate && latest.title
            ? {
                title: latest.title,
                releasedOn: latest.releaseDate.slice(0, 10),
              }
            : null,
      },
      fromName: policy.defaultFromName,
      fromAddress,
      compliance: {
        mailingAddress,
        unsubscribeUrl,
        coldStream: { domain, onCoreDomain: isCoreDomain(domain) },
        suppressed: Boolean(suppression),
        isFollowUp: false,
      },
    };
  } catch {
    // Missing keys, unavailable catalog/suppression stores, and unreadable facts
    // must never turn into plausible-looking drafts.
    return null;
  }
}
