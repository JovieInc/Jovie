// Browser fixtures for overlay-walk.test.mjs. They simulate interactions and
// cleanup locally; no browser, production origin or elapsed-time sleep is used.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOrphanedOverlays } from '../orphaned-overlays.mjs';
import { RAIL } from '../overlay-walk.mjs';

export const row = (url, identity, overlaySurface, more = {}) => ({
  route: url,
  url,
  identity,
  viewport: 'desktop',
  status: 200,
  overlaySurface,
  ...more,
});

/**
 * A scripted stand-in for a Playwright page with an unpinned sidebar holding
 * two hover triggers. `sticky` is the bug: the tooltip outlives the sidebar.
 */
export function fakePage({ sticky }) {
  const state = { rail: false, layers: 0, path: '/app', log: [] };
  const leave = () => {
    state.rail = false;
    if (!sticky) state.layers = 0;
  };
  const railLocator = {
    first: () => railLocator,
    isVisible: async () => true,
    getAttribute: async () => 'false',
    hover: async () => {
      state.rail = true;
    },
  };
  const triggers = {
    count: async () => (state.rail ? 2 : 0),
    nth: i => ({
      hover: async () => {
        state.log.push(`hover trigger ${i}`);
        state.layers = 1;
      },
    }),
  };
  return {
    state,
    mouse: { move: async () => leave() },
    keyboard: {
      press: async () => {
        state.layers = 0;
      },
    },
    waitForTimeout: async () => {},
    setViewportSize: async () => leave(),
    locator: sel => (sel === RAIL ? railLocator : triggers),
    waitForSelector: async () => {
      if (!state.rail) throw new Error('timeout');
    },
    waitForFunction: async (_fn, [, before]) => {
      if (!(state.layers > before)) throw new Error('timeout');
    },
    waitForURL: async () => {},
    evaluate: async (fn, arg) => {
      if (fn === findOrphanedOverlays)
        return state.layers && !state.rail
          ? [
              {
                kind: 'tooltip',
                overlay: 'div',
                text: "What's new",
                reason: 'anchor-missing',
                anchor: null,
                box: [0, 0, 90, 28],
              },
            ]
          : [];
      if (typeof arg === 'string') return state.layers;
      state.path = '/app/releases';
      return state.path;
    },
  };
}

export async function withWalkDir(run) {
  const out = await mkdtemp(join(tmpdir(), 'overlay-deadline-'));
  try {
    return await run(out);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** A browser fixture whose navigation rejects only when its context closes. */
export function stalledContext({ started, closed }) {
  let rejectLoad;
  return {
    addCookies: async () => {},
    newPage: async () => ({
      setDefaultTimeout: () => {},
      goto: () => {
        started();
        return new Promise((_, reject) => {
          rejectLoad = reject;
        });
      },
    }),
    close: async () => {
      closed();
      rejectLoad?.(new Error('Target closed'));
    },
  };
}
