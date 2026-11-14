import type { AppUpdater } from 'electron-updater';
import type { DesktopUpdateEvent } from './desktop-auto-update';

/** Register once, when the updater is first loaded, before starting a check. */
export function bindDesktopAutoUpdaterEvents(
  updater: AppUpdater,
  emit: (event: DesktopUpdateEvent) => void
): void {
  updater.on('checking-for-update', () =>
    emit({ type: 'checking-for-update' })
  );
  updater.on('update-available', info =>
    emit({
      type: 'update-available',
      version: info.version,
      releaseDate: info.releaseDate ?? null,
    })
  );
  updater.on('download-progress', progress =>
    emit({
      type: 'download-progress',
      percent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  );
  updater.on('update-downloaded', info =>
    emit({
      type: 'update-downloaded',
      version: info.version,
    })
  );
  updater.on('update-not-available', () =>
    emit({ type: 'update-not-available' })
  );
  updater.on('error', error =>
    emit({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  );
}
