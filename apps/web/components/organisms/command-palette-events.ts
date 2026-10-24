export const OPEN_COMMAND_PALETTE_EVENT = 'jovie:open-command-palette';

export function openCommandPalette(target: EventTarget = globalThis) {
  target.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/**
 * Warm the palette chunk at idle so the first Cmd+K does not wait on a cold
 * dynamic import. Importing the same module the dynamic() wrapper loads is
 * deduped by the bundler — this only primes the cache.
 */
export function preloadCommandPaletteChunk(): Promise<unknown> {
  return import('./CmdKPalette');
}
