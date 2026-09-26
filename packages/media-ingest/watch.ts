import { type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';
import { type IngestOptions, ingest } from './ingest';
import type { IngestReport } from './types';

/** Today's stack dir: <libraryDir>/today/. iPhone shots land here without a Finder dance. */
export function todayStackDir(libraryDir: string, now = new Date()): string {
  return join(libraryDir, now.toISOString().slice(0, 10));
}

export interface WatchHandle {
  close(): void;
}

const DEBOUNCE_MS = 1500;

/**
 * Watch a drop folder (iPhone AirDrop/Photo Stream landing dir). New or
 * changed files debounce, then run the full ingest pass so the Mac library
 * stays current while the owner keeps shooting.
 */
export function watchSource(
  sourceDir: string,
  options: Omit<IngestOptions, 'sources'>,
  onReport: (report: IngestReport) => void
): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;

  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void run();
    }, DEBOUNCE_MS);
  };

  const run = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const report = await ingest({ ...options, sources: [sourceDir] });
      if (report.ingested > 0 || report.verifyFailed > 0) onReport(report);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        trigger();
      }
    }
  };

  const watcher: FSWatcher = watch(sourceDir, { recursive: true }, trigger);
  void run();
  return {
    close() {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
