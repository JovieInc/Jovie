/**
 * Apple lanes are dropped from the merge queue so the hosted macOS pool cannot
 * hold check_response_timeout. Queue-proven main pushes previously skipped Path
 * Changes entirely, so iOS/Mac Fast Unit never ran on the normal PR→queue→main
 * path. This module selects only those deferred Apple lanes for a post-queue
 * main push without unlocking web duplicate work.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { macNativeRequired } from './product-lane-classifier.mjs';

/**
 * @param {{ selectedLanes?: string[] }} receipt
 * @param {{ macNativeRequired?: (receipt: object) => boolean }} [deps]
 */
export function selectAppleLanesFromReceipt(receipt, deps = {}) {
  const selected = new Set(receipt?.selectedLanes ?? []);
  const nativeRequired = deps.macNativeRequired ?? macNativeRequired;
  const runMac = selected.has('mac');
  return {
    run_ios: selected.has('ios'),
    run_macos: runMac,
    run_macos_native: runMac && Boolean(nativeRequired(receipt)),
  };
}

/**
 * Write GitHub Actions outputs for the Apple post-queue job.
 * @param {ReturnType<typeof selectAppleLanesFromReceipt>} selection
 * @param {string} outputPath
 */
export function writeApplePostQueueOutputs(selection, outputPath) {
  const lines = [
    `run_ios=${selection.run_ios}`,
    `run_macos=${selection.run_macos}`,
    `run_macos_native=${selection.run_macos_native}`,
  ];
  writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

export function runApplePostQueueSelection(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.receipt) {
    throw new Error('--receipt <path> is required');
  }
  const receipt = JSON.parse(readFileSync(path.resolve(args.receipt), 'utf8'));
  const selection = selectAppleLanesFromReceipt(receipt);
  if (args['github-output']) {
    writeApplePostQueueOutputs(selection, path.resolve(args['github-output']));
  }
  return selection;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const selection = runApplePostQueueSelection();
    process.stdout.write(`${JSON.stringify(selection)}\n`);
  } catch (error) {
    console.error(
      `::error::Apple post-queue selection failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}
