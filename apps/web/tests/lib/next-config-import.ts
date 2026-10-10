import { vi } from 'vitest';

// workflow@5 `withWorkflow` eagerly loads esbuild when next.config.js is
// imported. esbuild asserts `new TextEncoder().encode("") instanceof
// Uint8Array`; jsdom replaces globalThis.Uint8Array with its own realm's
// constructor while TextEncoder stays on Node's, so the invariant fails.
// Align Uint8Array with TextEncoder's realm for the import.
export async function importNextConfig() {
  const realmUint8Array = new TextEncoder().encode('')
    .constructor as typeof Uint8Array;
  vi.stubGlobal('Uint8Array', realmUint8Array);
  try {
    return await import('../../next.config.js');
  } finally {
    vi.unstubAllGlobals();
  }
}

export function requireNextConfig() {
  const realmUint8Array = new TextEncoder().encode('')
    .constructor as typeof Uint8Array;
  vi.stubGlobal('Uint8Array', realmUint8Array);
  try {
    return require('../../next.config.js');
  } finally {
    vi.unstubAllGlobals();
  }
}
