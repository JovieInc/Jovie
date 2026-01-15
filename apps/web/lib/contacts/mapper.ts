import type { CreatorContact } from '@/lib/db/schema';
import type { PublicContact } from '@/types/contacts';
import {
  buildRoleSubject,
  getContactRoleLabel,
  summarizeTerritories,
} from './constants';

/**
 * Build a mailto: URL for email contact.
 * Constructs the URL server-side so no decoding is needed on the client.
 */
function buildEmailActionUrl(email: string, subject?: string): string {
  const subjectParam = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${subjectParam}`;
}

/**
 * Build a tel: URL for phone contact.
 * Normalizes the phone number and constructs the URL server-side.
 */
function buildPhoneActionUrl(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return `tel:${normalized}`;
}

export function toPublicContacts(
  contacts: CreatorContact[],
  artistName: string
): PublicContact[] {
  const sorted = [...contacts].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );

  return sorted
    .filter(contact => contact.isActive !== false)
    .map(contact => {
      const channels: PublicContact['channels'] = [];

      if (contact.email) {
        const subject = buildRoleSubject(contact.role, artistName);
        channels.push({
          type: 'email',
          actionUrl: buildEmailActionUrl(contact.email, subject),
          preferred: contact.preferredChannel === 'email',
        });
      }

      if (contact.phone) {
        channels.push({
          type: 'phone',
          actionUrl: buildPhoneActionUrl(contact.phone),
          preferred: contact.preferredChannel === 'phone',
        });
      }

      if (
        !channels.some(channel => channel.preferred) &&
        channels.length === 1
      ) {
        channels[0].preferred = true;
      }

      const { summary, count } = summarizeTerritories(
        contact.territories ?? []
      );
      const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);

      const secondary = [contact.personName, contact.companyName]
        .filter(Boolean)
        .join(' @ ');

      return {
        id: contact.id,
        role: contact.role,
        roleLabel,
        territorySummary: summary,
        territoryCount: count,
        secondaryLabel: secondary || undefined,
        channels,
      };
    })
    .filter(contact => contact.channels.length > 0);
}
