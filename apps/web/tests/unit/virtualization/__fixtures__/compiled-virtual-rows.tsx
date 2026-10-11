import type { Virtualizer } from '@tanstack/react-virtual';

/** Deliberately compiled: proves the invariant catches a stale-window reader. */
export function CompiledRows({
  virtualizer,
}: {
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}) {
  return (
    <div>
      {virtualizer.getVirtualItems().map(item => (
        <div key={item.key}>{item.index}</div>
      ))}
    </div>
  );
}
