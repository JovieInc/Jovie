import type { PublicContact, PublicContactChannel } from '@/types/contacts';

const CHANNEL_ACTION_LABELS: Record<PublicContactChannel['type'], string> = {
  email: 'Email',
  sms: 'Text',
  phone: 'Call',
};

export function formatPublicContactChannelAriaLabel(
  channelType: PublicContactChannel['type'],
  contact: Pick<
    PublicContact,
    'roleLabel' | 'contactName' | 'primaryContactLabel'
  >
): string {
  const action = CHANNEL_ACTION_LABELS[channelType];
  const personName =
    contact.contactName?.trim() || contact.primaryContactLabel?.trim() || '';
  if (personName) {
    return `${action} ${contact.roleLabel}, ${personName}`;
  }
  return `${action} ${contact.roleLabel}`;
}
