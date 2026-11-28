import { Kbd } from '@jovie/ui';

export interface AccountMenuShortcutProps {
  /** One entry per key, in press order: ['G', 'S'] or ['⌥', '⇧', 'Q']. */
  readonly keys: readonly string[];
}

/**
 * The one shortcut hint for the account menu: each key is the design-system
 * keycap at its small size, so letter chords ("G S") and modifier chords read
 * the same. The quiet 16px chip stays secondary to the row label (Tim,
 * 2026-11-14: the keycaps were too big).
 * Rendered in the row's trailing slot, which right-aligns and mutes it.
 */
export function AccountMenuShortcut({ keys }: AccountMenuShortcutProps) {
  return (
    <span
      data-account-menu-shortcut=''
      className='inline-flex items-center gap-0.5'
    >
      {keys.map(key => (
        <Kbd key={key} size='sm'>
          {key}
        </Kbd>
      ))}
    </span>
  );
}
