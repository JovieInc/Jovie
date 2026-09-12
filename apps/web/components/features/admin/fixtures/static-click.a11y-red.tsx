/**
 * Deliberate-red sibling of CreatorProfileTableRow.
 * A new static click on that production file must fail biome the same way.
 */
export function CreatorRowStaticClickDeliberateRed() {
  return (
    <div data-deliberate-red='' onClick={() => undefined}>
      planted static click
    </div>
  );
}
