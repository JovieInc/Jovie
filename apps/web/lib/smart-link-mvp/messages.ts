/** Human copy for a failed lookup. No prices and no vendor names. */

export function linkFailureMessage(code: string | undefined): string | null {
  switch (code) {
    case 'NOT_FOUND':
      return 'Jovie could not find that recording.';
    case 'UNSUPPORTED_INPUT':
      return 'Use a song link, an ISRC, or an artist and song name.';
    case 'RATE_LIMITED':
      return 'Too many requests. Wait a minute and try again.';
    case 'BUDGET_EXHAUSTED':
      return 'Jovie cannot look up more recordings right now. Try again later.';
    case 'UPSTREAM_FAILURE':
      return 'Jovie could not reach the music services. Nothing was saved. Try again.';
    case 'LIMIT_REACHED':
      return 'No more Jovie links can be created from this network this month.';
    default:
      return null;
  }
}
