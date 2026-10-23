/**
 * Test-only handshake for the Better Auth browser client.
 *
 * The session atom's unmount is delayed 1s by nanostores. Vitest deletes
 * the jsdom `window` binding before that timer fires, and Better Auth's
 * broadcast cleanup then throws `ReferenceError: window is not defined`.
 * The client module registers itself here when Vitest loads it. Setup
 * flushes idle atoms while `window` still exists, so the deferred timer
 * does not touch the DOM.
 */

const authClientSlot = Symbol.for('jovie.vitest.authClient');

// Only the session atom mounts the broadcast/focus/online listeners whose
// deferred unmount reads `window`. `$sessionSignal` stays subscribed for the
// life of the client; passkey atoms do not touch `window` on cleanup.
const IDLE_ATOMS = ['session'] as const;

interface IdleAtom {
  readonly lc: number;
}

function isIdleAtom(value: unknown): value is IdleAtom {
  return (
    typeof value === 'object' &&
    value !== null &&
    'lc' in value &&
    typeof value.lc === 'number'
  );
}

function isRecord(value: unknown): value is object {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null
  );
}

function readAtom(client: unknown, name: string): unknown {
  if (!isRecord(client)) return undefined;
  const store = (client as { readonly $store?: unknown }).$store;
  if (!isRecord(store)) return undefined;
  const atoms = (store as { readonly atoms?: unknown }).atoms;
  if (!isRecord(atoms)) return undefined;
  return (atoms as Record<string, unknown>)[name];
}

function flushIdleAtom(store: object): void {
  const lc = (store as IdleAtom).lc;
  if (lc > 0) return;
  for (const key of Object.getOwnPropertySymbols(store)) {
    if (key.description !== 'clean') continue;
    const clean = (store as Record<symbol, unknown>)[key];
    if (typeof clean === 'function') clean();
  }
}

export function rememberAuthClientForTests(client: unknown): void {
  if (process.env.VITEST !== 'true') return;
  (globalThis as Record<symbol, unknown>)[authClientSlot] = client;
}

/** Flush Better Auth atoms whose listeners already dropped. */
export function releaseIdleAuthClient(): void {
  const client = (globalThis as Record<symbol, unknown>)[authClientSlot];
  if (!client) return;
  for (const name of IDLE_ATOMS) {
    const atom = readAtom(client, name);
    if (isIdleAtom(atom)) flushIdleAtom(atom);
  }
}
