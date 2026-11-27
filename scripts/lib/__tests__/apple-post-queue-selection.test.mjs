import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  runApplePostQueueSelection,
  selectAppleLanesFromReceipt,
  writeApplePostQueueOutputs,
} from '../apple-post-queue-selection.mjs';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('selectAppleLanesFromReceipt', () => {
  it('selects only deferred Apple lanes from a full product receipt', () => {
    const selection = selectAppleLanesFromReceipt(
      { selectedLanes: ['ios', 'mac', 'web', 'operations'] },
      { macNativeRequired: () => true }
    );
    expect(selection).toEqual({
      run_ios: true,
      run_macos: true,
      run_macos_native: true,
    });
  });

  it('keeps mac native false for node-only Mac selections', () => {
    const selection = selectAppleLanesFromReceipt(
      { selectedLanes: ['mac'] },
      { macNativeRequired: () => false }
    );
    expect(selection).toEqual({
      run_ios: false,
      run_macos: true,
      run_macos_native: false,
    });
  });

  it('emits all-false when the queue head did not touch Apple paths', () => {
    expect(
      selectAppleLanesFromReceipt(
        { selectedLanes: ['web'] },
        { macNativeRequired: () => true }
      )
    ).toEqual({
      run_ios: false,
      run_macos: false,
      run_macos_native: false,
    });
  });
});

describe('writeApplePostQueueOutputs', () => {
  it('appends exact GitHub Actions outputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apple-post-queue-'));
    tempDirs.push(dir);
    const outputPath = join(dir, 'github-output');
    writeFileSync(outputPath, 'seed=1\n');
    writeApplePostQueueOutputs(
      { run_ios: true, run_macos: false, run_macos_native: false },
      outputPath
    );
    expect(readFileSync(outputPath, 'utf8')).toBe(
      [
        'seed=1',
        'run_ios=true',
        'run_macos=false',
        'run_macos_native=false',
        '',
      ].join('\n')
    );
  });
});

describe('runApplePostQueueSelection', () => {
  it('reads a receipt and writes Apple-only outputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apple-post-queue-cli-'));
    tempDirs.push(dir);
    const receiptPath = join(dir, 'receipt.json');
    const outputPath = join(dir, 'github-output');
    writeFileSync(
      receiptPath,
      JSON.stringify({ selectedLanes: ['ios', 'web'] })
    );
    const selection = runApplePostQueueSelection([
      '--receipt',
      receiptPath,
      '--github-output',
      outputPath,
    ]);
    expect(selection.run_ios).toBe(true);
    expect(selection.run_macos).toBe(false);
    expect(readFileSync(outputPath, 'utf8')).toContain('run_ios=true');
  });
});
