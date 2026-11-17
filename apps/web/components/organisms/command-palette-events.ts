export const OPEN_COMMAND_PALETTE_EVENT = 'jovie:open-command-palette';

export function openCommandPalette(target: EventTarget = globalThis) {
  target.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/**
 * Warm the palette chunk at idle so the first Cmd+K does not wait on a cold
 * dynamic import. Importing the same module the dynamic() wrapper loads is
 * deduped by the bundler — this only primes the cache.
 *
 * The warm-up is best-effort and must never surface an unhandled rejection:
 * outside the Next bundler (Vitest) the raw ./CmdKPalette graph statically
 * reaches server-only modules ('use server' release-matrix-loader via
 * useReleasesQuery), so the import rejects there. The fire-and-forget
 * `void preloadCommandPaletteChunk()` warm-up turned that into vitest
 * "Errors N" with every test green, failing whole runs (JOV-7650). Swallow
 * warm-up failures; the dynamic() open path still owns real load errors.
 */
export function preloadCommandPaletteChunk(): Promise<unknown> {
  return import('./CmdKPalette').catch(() => undefined);
}
