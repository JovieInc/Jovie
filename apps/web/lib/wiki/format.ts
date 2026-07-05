export function titleFromSlug(slug: string): string {
  const parts = slug.split('/');
  return parts[parts.length - 1]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function slugToHref(slug: string): string {
  return `/hud/wiki/${encodeURIComponent(slug)}`;
}
