export interface NamespaceGroup {
  namespace: string;
  pages: {
    slug: string;
    title: string;
    updated_at?: string;
    tags?: string[];
  }[];
}

export function groupByNamespace(
  pages: { slug: string; title: string; updated_at?: string; tags?: string[] }[]
): NamespaceGroup[] {
  const groups = new Map<string, NamespaceGroup>();

  for (const page of pages) {
    const lastSlash = page.slug.lastIndexOf('/');
    const namespace = lastSlash > 0 ? page.slug.slice(0, lastSlash) : 'other';
    if (!groups.has(namespace)) {
      groups.set(namespace, { namespace, pages: [] });
    }
    groups.get(namespace)!.pages.push(page);
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.namespace.localeCompare(b.namespace)
  );
}
