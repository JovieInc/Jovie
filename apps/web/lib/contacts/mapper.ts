import type { CreatorContact } from '@/lib/db/schema/profiles';
import type { PublicContact } from '@/types/contacts';
import {
  buildRoleSubject,
  getContactRoleLabel,
  summarizeTerritories,
} from './constants';
import { encodeContactPayload } from './obfuscation';

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
        channels.push({
          type: 'email',
          encoded: encodeContactPayload({
            type: 'email',
            value: contact.email,
            subject: buildRoleSubject(contact.role, artistName),
            contactId: contact.id,
          }),
          preferred: contact.preferredChannel === 'email',
        });
      }

      if (contact.phone) {
        const encodedPhone = encodeContactPayload({
          type: 'phone',
          value: contact.phone,
          contactId: contact.id,
        });

        channels.push({
          type: 'phone',
          encoded: encodedPhone,
          preferred: contact.preferredChannel === 'phone',
        });

        channels.push({
          type: 'sms',
          encoded: encodeContactPayload({
            type: 'sms',
            value: contact.phone,
            contactId: contact.id,
          }),
          preferred: false,
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

      const primaryContactLabel = contact.email ?? contact.phone ?? undefined;

      return {
        id: contact.id,
        role: contact.role,
        roleLabel,
        territorySummary: summary,
        territoryCount: count,
        secondaryLabel: secondary || undefined,
        primaryContactLabel,
        channels,
      };
    })
    .filter(contact => contact.channels.length > 0);
}
