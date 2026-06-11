export type LibraryShareExpiryPreset = 'never' | '7d' | '30d' | '90d';

export function resolveLibraryShareExpiryIso(
  preset: LibraryShareExpiryPreset,
  now = Date.now()
): string | null {
  if (preset === 'never') return null;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
