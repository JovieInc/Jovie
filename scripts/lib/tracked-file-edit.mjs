import { readFileSync, writeFileSync } from 'node:fs';

let activeEdit = null;

export function restoreActiveTrackedEdit() {
  if (!activeEdit) return;
  const current = readFileSync(activeEdit.absolutePath, 'utf8');
  if (current === activeEdit.mutated) {
    writeFileSync(activeEdit.absolutePath, activeEdit.original);
  } else {
    const markerIndex = current.lastIndexOf(activeEdit.suffix);
    if (markerIndex !== -1) {
      writeFileSync(
        activeEdit.absolutePath,
        `${current.slice(0, markerIndex)}${current.slice(markerIndex + activeEdit.suffix.length)}`
      );
    }
  }
  activeEdit = null;
}

export async function withTrackedFileEdit(absolutePath, suffix, callback) {
  const original = readFileSync(absolutePath, 'utf8');
  const mutated = `${original}${suffix}`;
  activeEdit = { absolutePath, original, mutated, suffix };
  try {
    writeFileSync(absolutePath, mutated);
    return await callback();
  } finally {
    restoreActiveTrackedEdit();
  }
}

export function installTrackedEditSignalHandlers(
  processLike,
  { onSignal = async () => {} } = {}
) {
  for (const [signal, exitCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    processLike.once(signal, async () => {
      restoreActiveTrackedEdit();
      try {
        await onSignal(signal);
      } finally {
        processLike.exit(exitCode);
      }
    });
  }
}
