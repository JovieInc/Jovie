export function normalizeTicketUrl(
  ticketUrl: string | undefined | null
): string | null {
  if (!ticketUrl) return null;

  const trimmed = ticketUrl.trim();
  if (trimmed.length === 0) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function assertValidTicketUrl(
  ticketUrl: string | undefined | null
): void {
  if (!ticketUrl) return;
  if (!normalizeTicketUrl(ticketUrl)) {
    throw new TypeError('Invalid ticket URL');
  }
}
