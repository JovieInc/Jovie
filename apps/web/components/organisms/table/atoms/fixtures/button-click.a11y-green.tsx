/**
 * Green neighbor: a real control may take click handlers without a suppression.
 */
export function TableCellButtonClickGreen() {
  return (
    <button type='button' onClick={() => undefined}>
      Select row
    </button>
  );
}
