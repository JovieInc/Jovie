import { type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';
import { type IngestOptions, ingest } from './ingest';
import type { IngestReport } from './types';

export interface WatchCallbacks {
  readonly onReport: (report: IngestReport) => void;
  readonly onError: (error: unknown) => void;
}

export interface WatchHandle {
  close(): void;
}

export function todayStackDir(libraryDir: string, now = new Date()): string {
  return join(libraryDir, now.toISOString().slice(0, 10));
}

export function watchSources(
  options: IngestOptions,
  callbacks: WatchCallbacks,
  debounceMs = 1_500
): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  let closed = false;

  const run = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const report = await ingest(options);
      if (report.ingested > 0 || report.verifyFailed > 0) {
        callbacks.onReport(report);
      }
    } catch (error) {
      callbacks.onError(error);
    } finally {
      running = false;
      if (pending && !closed) {
        pending = false;
        schedule();
      }
    }
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  };

  const watchers: FSWatcher[] = options.sources.map(source =>
    watch(source.root, { recursive: true }, schedule)
  );
  void run();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
