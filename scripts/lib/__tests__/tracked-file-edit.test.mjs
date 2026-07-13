import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installTrackedEditSignalHandlers,
  withTrackedFileEdit,
} from '../tracked-file-edit.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'tracked-file-edit-'));
  temporaryDirectories.push(directory);
  const path = resolve(directory, 'fixture.ts');
  writeFileSync(path, 'export const value = 1;\n');
  return path;
}

function fakeProcess() {
  const handlers = new Map();
  return {
    handlers,
    once: (signal, handler) => handlers.set(signal, handler),
    exit: vi.fn(),
  };
}

describe('tracked benchmark edits', () => {
  it('restores the file when the benchmark callback throws', async () => {
    const path = fixture();
    await expect(
      withTrackedFileEdit(path, '// benchmark edit\n', () => {
        throw new Error('spawn failed');
      })
    ).rejects.toThrow('spawn failed');
    expect(readFileSync(path, 'utf8')).toBe('export const value = 1;\n');
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('restores the file on %s', async (signal, exitCode) => {
    const path = fixture();
    const processLike = fakeProcess();
    const onSignal = vi.fn();
    installTrackedEditSignalHandlers(processLike, { onSignal });

    await withTrackedFileEdit(path, '// benchmark edit\n', async () => {
      expect(readFileSync(path, 'utf8')).toContain('benchmark edit');
      await processLike.handlers.get(signal)();
      expect(readFileSync(path, 'utf8')).toBe('export const value = 1;\n');
    });

    expect(onSignal).toHaveBeenCalledWith(signal);
    expect(processLike.exit).toHaveBeenCalledWith(exitCode);
  });

  it('preserves concurrent edits while removing its own marker', async () => {
    const path = fixture();
    await withTrackedFileEdit(path, '// benchmark edit\n', () => {
      writeFileSync(
        path,
        `${readFileSync(path, 'utf8')}export const concurrent = true;\n`
      );
    });
    expect(readFileSync(path, 'utf8')).toBe(
      'export const value = 1;\nexport const concurrent = true;\n'
    );
  });
});
