export const OPEN_COMMAND_PALETTE_EVENT = 'jovie:open-command-palette';

export function openCommandPalette(target: EventTarget = globalThis) {
  target.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}
