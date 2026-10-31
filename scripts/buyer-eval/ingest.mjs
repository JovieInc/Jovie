// Turn a recorded walk into judge steps: one entry per step with its own
// timestamp (from the walk, never the model), the step screenshot, one video
// keyframe from the middle of the step window and the visible DOM text.
//
// Input is the dogfood-judge run contract written by the golden-path walker
// (steps.json + walk.webm + NN.png + dom/NN.txt). A bare video with no
// steps.json is sampled every SAMPLE_EVERY_SEC seconds.
//
// Frames are copied into a fresh, otherwise empty directory: the strong judge
// runs with that directory as its only readable path and cwd, so it can never
// read repo docs, the rubric or user memory (adversarial review #7).

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

export const SAMPLE_EVERY_SEC = 6;
const MAX_TEXT_CHARS = 1500;
const MAX_STEPS = 24;

export function probeDuration(video) {
  const out = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      video,
    ],
    { encoding: 'utf8' }
  );
  const seconds = Number(String(out.stdout).trim());
  return Number.isFinite(seconds) ? seconds : null;
}

export function extractFrame(video, tSec, outPath) {
  const out = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-ss',
      String(Math.max(0, tSec)),
      '-i',
      video,
      '-frames:v',
      '1',
      '-vf',
      'scale=1280:-2',
      outPath,
    ],
    { encoding: 'utf8' }
  );
  return out.status === 0 && existsSync(outPath);
}

/** Step windows: [start, next start) on the walk's own clock. */
export function withWindows(steps, durationSec) {
  const sorted = [...steps].sort((a, b) => a.tSec - b.tSec);
  return sorted.map((step, index) => ({
    ...step,
    endSec: sorted[index + 1]?.tSec ?? durationSec ?? step.tSec + 3,
  }));
}

/** Evenly thin a long walk so one judge call stays bounded. */
export function thin(steps, max = MAX_STEPS) {
  if (steps.length <= max) return steps;
  const out = [];
  for (let i = 0; i < max; i++) {
    out.push(steps[Math.round((i * (steps.length - 1)) / (max - 1))]);
  }
  return [...new Map(out.map(step => [step.stepId, step])).values()];
}

/**
 * @param {string} source run directory (steps.json contract) or a video file
 * @returns {{ frameDir: string, steps: Array<{stepId: string, title: string, tSec: number, endSec: number, images: string[], text: string, url?: string}>, source: string }}
 */
export function ingestWalk(source) {
  const frameDir = mkdtempSync(join(tmpdir(), 'buyer-eval-frames-'));
  let steps;
  let video = null;
  if (existsSync(join(source, 'steps.json'))) {
    const raw = JSON.parse(readFileSync(join(source, 'steps.json'), 'utf8'));
    const ref = raw.find(step => step.video)?.video;
    video = ref && existsSync(join(source, ref)) ? join(source, ref) : null;
    steps = raw.map(step => {
      const domPath = join(source, 'dom', `${step.step}.txt`);
      return {
        stepId: String(step.step),
        title: String(step.title ?? ''),
        url: step.url,
        tSec: Number(step.videoOffsetSec ?? 0),
        shot: step.screenshot ? join(source, step.screenshot) : null,
        text: existsSync(domPath)
          ? readFileSync(domPath, 'utf8').slice(0, MAX_TEXT_CHARS)
          : String(step.text ?? '').slice(0, MAX_TEXT_CHARS),
      };
    });
  } else if (['.mp4', '.webm', '.mov'].includes(extname(source))) {
    video = source;
    const duration = probeDuration(source) ?? 0;
    steps = [];
    for (let t = 1, n = 1; t < duration; t += SAMPLE_EVERY_SEC, n++) {
      steps.push({
        stepId: String(n).padStart(2, '0'),
        title: `${basename(source)} at ${t.toFixed(0)}s`,
        tSec: t,
        shot: null,
        text: '',
      });
    }
  } else {
    throw new Error(`not a walk run dir or video: ${source}`);
  }
  const duration = video ? probeDuration(video) : null;
  const windowed = thin(withWindows(steps, duration));
  const out = windowed.map(step => {
    const images = [];
    if (step.shot && existsSync(step.shot)) {
      const name = `${step.stepId}-shot${extname(step.shot)}`;
      copyFileSync(step.shot, join(frameDir, name));
      images.push(join(frameDir, name));
    }
    if (video) {
      const mid = step.shot
        ? (step.tSec + Math.min(step.endSec, step.tSec + 20)) / 2
        : step.tSec;
      const name = `${step.stepId}-video.jpg`;
      if (extractFrame(video, mid, join(frameDir, name))) {
        images.push(join(frameDir, name));
      }
    }
    return {
      stepId: step.stepId,
      title: step.title,
      url: step.url,
      tSec: Math.round(step.tSec * 10) / 10,
      endSec: step.endSec,
      images,
      text: step.text,
    };
  });
  mkdirSync(frameDir, { recursive: true });
  return { frameDir, steps: out.filter(step => step.images.length), source };
}
