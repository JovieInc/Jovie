export function parseBatchUrls(rawInput: string): string[] {
  return rawInput
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean);
}
