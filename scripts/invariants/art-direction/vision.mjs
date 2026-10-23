/**
 * Vision and judgment judges (polish, hierarchy, mockup quality) stay in
 * shadow until a calibration receipt meets the Hamel floors in
 * vision.config.json. `promoteToBlocking` is the only promote switch.
 * Flipping it before a calibrated judge replaces this module fails closed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './paths.mjs';

export const VISION_CONFIG = 'scripts/invariants/art-direction/vision.config.json';

export function readVisionConfig(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(join(repoRoot, VISION_CONFIG), 'utf8'));
}

export function judgeVision(config) {
  /** @type {string[]} */
  const failures = [];
  if (config.mode !== 'shadow' && config.mode !== 'blocking') {
    failures.push('vision config mode must be shadow or blocking');
  }
  if (typeof config.promoteToBlocking !== 'boolean') {
    failures.push('vision config promoteToBlocking must be boolean');
  }
  if (
    config.hamelFloors?.precisionMin !== 0.9 ||
    config.hamelFloors?.recallMin !== 0.8
  ) {
    failures.push('Hamel floors are precisionMin 0.9 and recallMin 0.8');
  }
  const shadow = [
    'shadow: polish, hierarchy, and mockup-quality judges are uncalibrated',
  ];
  if (config.promoteToBlocking || config.mode === 'blocking') {
    failures.push(
      'vision judges are not calibrated; keep promoteToBlocking false until precision and recall meet the Hamel floors'
    );
  }
  return { failures, shadow };
}

export const check = checkVision;

export function checkVision(repoRoot = REPO_ROOT) {
  return judgeVision(readVisionConfig(repoRoot));
}
