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
  const name = contact.contactName ?? contact.primaryContactLabel;
  const company = contact.companyLabel ?? contact.secondaryLabel;
  // "Jovie · Jovie Technology Inc" says one thing twice: when one side
  // starts with the other as a whole word, keep only the longer.
  if (name && company) {
    const [shorter, longer] =
      name.length <= company.length ? [name, company] : [company, name];
    if (startsWithWord(longer, shorter)) return longer;
  }
  return [name, company].filter(Boolean).join(' · ');
}

function startsWithWord(value: string, prefix: string): boolean {
  const head = value.trim().toLowerCase();
  const word = prefix.trim().toLowerCase();
  if (!word || !head.startsWith(word)) return false;
  return head.length === word.length || /[\s,.]/.test(head[word.length]);
}
