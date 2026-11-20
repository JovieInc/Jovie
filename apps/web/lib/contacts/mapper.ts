import type { CreatorContact } from '@/lib/db/schema/profiles';
import type { PublicContact } from '@/types/contacts';
import {
  buildRoleSubject,
  getContactRoleLabel,
  summarizeTerritories,
} from './constants';
import { encodeContactPayload } from './obfuscation';
import { isPlaceholderValue, realValueOrUndefined } from './placeholder';

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

      if (!isPlaceholderValue(contact.email) && contact.email) {
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

      if (!isPlaceholderValue(contact.phone) && contact.phone) {
        const encodedPhone = encodeContactPayload({
          type: 'phone',
          value: contact.phone,
          contactId: contact.id,
        });

        channels.push(
          {
            type: 'phone',
            encoded: encodedPhone,
            preferred: contact.preferredChannel === 'phone',
          },
          {
            type: 'sms',
            encoded: encodeContactPayload({
              type: 'sms',
              value: contact.phone,
              contactId: contact.id,
            }),
            preferred: false,
          }
        );
      }

      if (
        !channels.some(channel => channel.preferred) &&
        channels.length === 1
      ) {
        channels[0].preferred = true;
      }

      const territories = (contact.territories ?? []).filter(Boolean);
      const { summary, count } = summarizeTerritories(territories);
      const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
      const companyName = realValueOrUndefined(contact.companyName);
      const personName = realValueOrUndefined(contact.personName);

      return {
        id: contact.id,
        role: contact.role,
        roleLabel,
        territorySummary: summary,
        territoryCount: count,
        territories,
        companyLabel: companyName,
        contactName: personName,
        secondaryLabel: companyName,
        primaryContactLabel: personName,
        channels,
      };
    })
    .filter(contact => contact.channels.length > 0);
}
