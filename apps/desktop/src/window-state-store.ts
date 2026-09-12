import { promises as fs } from 'node:fs';
import type { DesktopSecurityReporter } from './desktop-security-reporting';
import {
  DEFAULT_WINDOW_STATE,
  type DisplayBounds,
  sanitizeWindowState,
  type WindowState,
} from './window-state';

export const WINDOW_STATE_SHUTDOWN_FLUSH_MS = 250;

export type WindowStateFileIo = {
  readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  writeFile(filePath: string, data: string, encoding: 'utf8'): Promise<void>;
};

export type WindowStateStore = {
  load(input: {
    displayBounds: DisplayBounds;
    connectedDisplays?: readonly DisplayBounds[];
    report?: DesktopSecurityReporter;
  }): Promise<WindowState>;
  peek(): WindowState;
  scheduleSave(state: WindowState): void;
  needsFlush(): boolean;
  flushOnShutdown(timeoutMs?: number): Promise<void>;
};

const defaultIo: WindowStateFileIo = {
  readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
  writeFile: (filePath, data, encoding) =>
    fs.writeFile(filePath, data, encoding),
};

export function createWindowStateStore(options: {
  readonly filePath: string;
  readonly io?: WindowStateFileIo;
}): WindowStateStore {
  const io = options.io ?? defaultIo;
  let latest: WindowState = { ...DEFAULT_WINDOW_STATE };
  let seq = 0;
  let queued: { readonly state: WindowState; readonly seq: number } | null =
    null;
  let inFlight: Promise<void> | null = null;

  async function writeQueued(): Promise<void> {
    while (queued) {
      const job = queued;
      queued = null;
      try {
        await io.writeFile(options.filePath, JSON.stringify(job.state), 'utf8');
      } catch {
        // Non-fatal — window state loss is acceptable
      }
    }
  }

  function kickDrain(): void {
    if (inFlight) return;
    inFlight = writeQueued().finally(() => {
      inFlight = null;
      if (queued) kickDrain();
    });
  }

  return {
    async load(input) {
      try {
        const raw = await io.readFile(options.filePath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        latest = sanitizeWindowState(
          parsed,
          input.displayBounds,
          input.report,
          input.connectedDisplays
        );
      } catch {
        latest = sanitizeWindowState(undefined, input.displayBounds);
      }
      return latest;
    },
    peek() {
      return latest;
    },
    scheduleSave(state) {
      latest = state;
      queued = { state, seq: ++seq };
      kickDrain();
    },
    needsFlush() {
      return queued !== null || inFlight !== null;
    },
    async flushOnShutdown(timeoutMs = WINDOW_STATE_SHUTDOWN_FLUSH_MS) {
      const pending = inFlight ?? writeQueued();
      inFlight = pending;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          pending.then(() => writeQueued()),
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeoutMs);
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        if (inFlight === pending) inFlight = null;
      }
    },
  };
}
