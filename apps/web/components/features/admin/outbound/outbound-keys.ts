/** Surface-scoped accelerators; any modifier passes through to the OS. */
export type OutboundKeyAction =
  | 'next'
  | 'previous'
  | 'nextFact'
  | 'previousFact'
  | 'yes'
  | 'no'
  | 'unsure'
  | 'approve'
  | 'hold'
  | 'reject'
  | 'toggleSelect';

const KEYMAP: Record<string, OutboundKeyAction> = {
  j: 'next',
  k: 'previous',
  ']': 'nextFact',
  '[': 'previousFact',
  y: 'yes',
  n: 'no',
  u: 'unsure',
  a: 'approve',
  h: 'hold',
  r: 'reject',
  x: 'toggleSelect',
};

export function resolveOutboundKey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>
): OutboundKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return KEYMAP[event.key] ?? null;
}

/** Never steal keys from text entry, menus, or other focused controls. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      'input, textarea, select, [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]'
    )
  );
}

/**
 * Approve and reject act on what the rail shows (the edited text, the chosen
 * reason), so the keyboard asks the rail to press its own button.
 */
export const OUTBOUND_RAIL_COMMAND_EVENT = 'ovie-outbound:rail-command';
export type OutboundRailCommand = 'approve' | 'reject';

export function sendOutboundRailCommand(command: OutboundRailCommand) {
  window.dispatchEvent(
    new CustomEvent<OutboundRailCommand>(OUTBOUND_RAIL_COMMAND_EVENT, {
      detail: command,
    })
  );
}
