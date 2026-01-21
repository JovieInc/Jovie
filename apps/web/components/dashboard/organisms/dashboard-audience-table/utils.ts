/**
 * Copy text to clipboard using the Clipboard API.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface VCardContact {
  displayName: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Generate vCard content and trigger download.
 */
export function downloadVCard(contact: VCardContact): void {
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.displayName ?? 'Unknown'}`,
    contact.email ? `EMAIL:${contact.email}` : '',
    contact.phone ? `TEL:${contact.phone}` : '',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\n');

  const blob = new Blob([vcard], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(contact.displayName ?? 'contact').replaceAll(/[^a-z0-9]/gi, '_')}.vcf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
