/**
 * Green neighbor for KanbanBoard: HTML5 drop target with an explained suppression.
 */
export function KanbanDropZoneGreen({
  onItemMove,
}: {
  readonly onItemMove?: () => void;
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: HTML5 drop target; fieldset+legend names the column for AT.
    <fieldset
      className='m-0 border-0 p-0'
      onDrop={event => {
        event.preventDefault();
        onItemMove?.();
      }}
      onDragOver={event => event.preventDefault()}
    >
      <legend className='sr-only'>Column items</legend>
      <p>Drop here</p>
    </fieldset>
  );
}
