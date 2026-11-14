// Same supported startup-options contract as content-publication-certification.
// Keep unrelated URL options and append our owned schema override last.
export function fixtureSchemaUrl(raw: string, schema: string) {
  const url = new URL(raw);
  const options = url.searchParams.get('options')?.trim();
  url.searchParams.delete('search_path');
  url.searchParams.set(
    'options',
    [options, `-c search_path=${schema}`].filter(Boolean).join(' ')
  );
  return url.toString();
}
