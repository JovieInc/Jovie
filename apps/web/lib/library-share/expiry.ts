export type LibraryShareExpiryPreset = 'never' | '7d' | '30d' | '90d';

export function resolveLibraryShareExpiryIso(
  preset: LibraryShareExpiryPreset,
  now = Date.now()
): string | null {
  if (preset === 'never') return null;
  let days = 90;
  if (preset === '7d') days = 7;
  else if (preset === '30d') days = 30;
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
