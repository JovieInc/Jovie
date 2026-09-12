/**
 * Deliberate-red sibling of AudienceRowSelectionCell / TableCheckboxCell.
 * A new static click on those production files must fail biome the same way.
 */
export function TableCellStaticClickDeliberateRed() {
  return (
    <div data-deliberate-red='' onClick={() => undefined}>
      planted static click
    </div>
  );
}
