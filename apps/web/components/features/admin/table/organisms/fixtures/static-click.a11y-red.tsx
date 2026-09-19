/**
 * Deliberate-red sibling of KanbanBoard.
 * A new static click / non-interactive handler on that file must fail biome.
 */
export function KanbanBoardStaticClickDeliberateRed() {
  return (
    <div data-deliberate-red='' onClick={() => undefined}>
      planted static click
    </div>
  );
}
