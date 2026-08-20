import type { PublicContact } from '@/types/contacts';

/**
 * Compact + dedicated contact rows share this subtitle: person name, then
 * company. Either side may be absent.
 */
export function formatPublicContactSubtitle(
  contact: Pick<
    PublicContact,
    'contactName' | 'primaryContactLabel' | 'companyLabel' | 'secondaryLabel'
  >
): string {
  return [
    contact.contactName ?? contact.primaryContactLabel,
    contact.companyLabel ?? contact.secondaryLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}
