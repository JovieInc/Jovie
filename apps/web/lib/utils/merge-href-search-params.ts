type SearchParamPrimitive = string | number | boolean | null | undefined;

export function mergeHrefSearchParams(
  href: string,
  entries: Record<string, SearchParamPrimitive>
): string {
  const [pathname, search = ''] = href.split('?');
  const params = new URLSearchParams(search);

  Object.entries(entries).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}
