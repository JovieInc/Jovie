/**
 * Returns `value` as this DOM serializes it for an inline declaration of the
 * kebab-case CSS `property`.
 *
 * CSS serialization is normative but engine-specific: jsdom 30 simplifies
 * `calc()` inside `min()` and adds units to zero lengths, as browsers do.
 * Comparing an element's inline declaration against this value asserts the
 * same authored style without hard-coding one engine's serialization.
 */
export function serializedDeclaration(property: string, value: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  const serialized = probe.style.getPropertyValue(property);
  if (serialized === '') {
    // An unparsed value would make the comparison pass vacuously.
    throw new Error(`Invalid CSS declaration: ${property}: ${value}`);
  }
  return serialized;
}
