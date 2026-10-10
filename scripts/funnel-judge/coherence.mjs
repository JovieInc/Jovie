#!/usr/bin/env node
// Coherence judge CLI (JOV-7753; consumed by uiassure JOV-7713 and designgate).
//
//   node scripts/funnel-judge/coherence.mjs --input screens.json [--out result.json]
//   node scripts/funnel-judge/coherence.mjs --calibrate --fixtures-dir <dir>
//
// --input JSON: { "screens": [{ "id", "label", "context", "images": [abs png],
//   "neighbors"?: [{ "id", "label", "context"?, "images": [abs png] }] }] }
// Prints { result, evaluation } as JSON on stdout.
// Exit 0 = no located blocker, 1 = blocked, 2 = judge error or calibration miss.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  evaluateScreenCoherence,
  screenCalibrationMisses,
} from './coherence-screen.mjs';
import { judgeCoherence } from './judge.mjs';

const HERE = dirname(new URL(import.meta.url).pathname);

/** Resolve image paths and collect the directories the judge may read. */
export function resolveScreens(screens, baseDir) {
  const dirs = new Set();
  const abs = path => {
    const full = isAbsolute(path) ? path : resolve(baseDir, path);
    if (!existsSync(full)) throw new Error(`missing screenshot ${full}`);
    dirs.add(dirname(full));
    return full;
  };
  const resolved = screens.map(screen => ({
    ...screen,
    images: screen.images.map(abs),
    neighbors: (screen.neighbors ?? []).map(neighbor => ({
      ...neighbor,
      images: neighbor.images.map(abs),
    })),
  }));
  return { screens: resolved, imageDirs: [...dirs] };
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      out: { type: 'string' },
      calibrate: { type: 'boolean', default: false },
      'fixtures-dir': { type: 'string' },
    },
  });
  let screens;
  let baseDir;
  let fixtures = null;
  if (values.calibrate) {
    const manifest = JSON.parse(
      readFileSync(join(HERE, 'coherence-calibration.json'), 'utf8')
    );
    if (!values['fixtures-dir']) {
      throw new Error(
        '--calibrate needs --fixtures-dir with the escape captures'
      );
    }
    baseDir = resolve(values['fixtures-dir']);
    fixtures = manifest.fixtures;
    screens = fixtures.map(
      ({ expect: _expect, why: _why, ...screen }) => screen
    );
  } else {
    if (!values.input) throw new Error('--input <screens.json> is required');
    const input = JSON.parse(readFileSync(values.input, 'utf8'));
    baseDir = dirname(resolve(values.input));
    screens = input.screens;
  }

  const resolved = resolveScreens(screens, baseDir);
  const result = await judgeCoherence({
    mode: 'screen',
    screens: resolved.screens,
    imageDir: resolved.imageDirs,
  });
  const evaluation = evaluateScreenCoherence(
    'screens' in result ? result : null
  );
  const misses = fixtures ? screenCalibrationMisses(fixtures, evaluation) : [];
  const output = {
    result,
    evaluation,
    calibrationMisses: fixtures ? misses : null,
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  if (values.out) writeFileSync(values.out, json);
  process.stdout.write(json);

  if (misses.length > 0) {
    console.error(`[coherence] calibration FAILED: ${misses.join('; ')}`);
    return 2;
  }
  return evaluation.pass || fixtures ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(HERE, 'coherence.mjs')
) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(
        `[coherence] ${error instanceof Error ? error.message : error}`
      );
      process.exit(2);
    }
  );
}
