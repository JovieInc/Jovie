/**
 * Extract a JSON payload from a model response.
 * Supports raw JSON responses and fenced markdown blocks (```json ... ```).
 */
export function extractJsonPayload(responseText: string): string {
  const trimmed = responseText.trim();
  const openingFenceIndex = trimmed.indexOf('```');

  if (openingFenceIndex === -1) {
    return trimmed;
  }

  const fenceHeaderEnd = trimmed.indexOf('\n', openingFenceIndex + 3);
  if (fenceHeaderEnd === -1) {
    return trimmed;
  }

  const fenceHeader = trimmed
    .slice(openingFenceIndex + 3, fenceHeaderEnd)
    .trim()
    .toLowerCase();

  if (fenceHeader !== '' && fenceHeader !== 'json') {
    return trimmed;
  }

  const closingFenceIndex = trimmed.indexOf('```', fenceHeaderEnd + 1);
  if (closingFenceIndex === -1) {
    return trimmed;
  }

  const fencedContent = trimmed
    .slice(fenceHeaderEnd + 1, closingFenceIndex)
    .trim();
  return fencedContent || trimmed;
}
