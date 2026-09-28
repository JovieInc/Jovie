function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Matches an accessible name built from visually separated text runs, such as
 * a heading split by `<br>` or a row whose label and meta sit in flex items.
 *
 * Browsers separate those runs with whitespace because layout makes them
 * block-level or line-broken. jsdom never loads the app's CSS and, since
 * jsdom 30, reports the spec default `display: inline` for spans, so
 * dom-accessibility-api concatenates the runs. Matching every segment in order,
 * anchored at both ends, keeps the assertion exact about the name's text
 * without depending on layout the test environment cannot see.
 */
export function segmentedAccessibleName(
  ...segments: readonly string[]
): RegExp {
  if (segments.length === 0) {
    throw new Error('segmentedAccessibleName needs at least one segment');
  }
  return new RegExp(`^${segments.map(escapeRegExp).join(String.raw`\s*`)}$`);
}
