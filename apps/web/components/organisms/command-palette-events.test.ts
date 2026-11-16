import { describe, expect, it } from 'vitest';
import { preloadCommandPaletteChunk } from './command-palette-events';

/**
 * JOV-7650: the CommandPalette mount effect warms the Cmd+K chunk with a
 * fire-and-forget `void preloadCommandPaletteChunk()`. Outside the Next
 * bundler this raw import statically reaches server-only modules (CmdKPalette
 * → useReleasesQuery → the 'use server' release-matrix-loader), so it rejects
 * under Vitest. An unhandled rejection fails the whole vitest run ("Errors N")
 * while every test stays green — that took down the nightly Test Coverage
 * Audit with zero failing tests. The warm-up must settle quietly instead.
 */
describe('preloadCommandPaletteChunk', () => {
  it('settles instead of surfacing an unhandled rejection when the palette graph cannot load outside the bundler', async () => {
    const outcome = await preloadCommandPaletteChunk().then(
      () => 'settled' as const,
      (error: unknown) => `rejected: ${String(error)}` as const
    );

    expect(outcome).toBe('settled');
  });
});
