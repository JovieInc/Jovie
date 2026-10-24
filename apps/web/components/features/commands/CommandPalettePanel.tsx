'use client';

// SharedCommandPalette stays outside this file's import walk. That module
// already uses arbitrary Tailwind values, and the marketing source baseline
// can only shrink.
import { CommandPaletteSurface } from '@/lib/marketing/CommandPaletteSurface';

/** Live command palette mounted on the product page. */
export function CommandPalettePanel() {
  return <CommandPaletteSurface />;
}
