// Ingest one recorded agent run into a judge manifest: per step, the step
// screenshot plus video keyframes from that step's time window, the visible
// text (DOM/AX excerpt) and console/network notes.
//
// Run directory contract (what dogfood recorders write):
//   steps.json        [{ step, title, url?, screenshot?, video?, videoOffsetSec?, text?, console? }]
//   <videos>.mp4|webm referenced by steps[].video
//   <screenshots>.png referenced by steps[].screenshot
//   dom/<step>.txt    optional visible text / AX snapshot per step
//   console.json      optional { [step]: "notes" } of console errors and failed requests

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

export const MANIFEST_SCHEMA = 'jovie.dogfood-judge-manifest/v1';
const SCENE_THRESHOLD = 0.18;
const MAX_KEYFRAMES_PER_STEP = 3;
const MAX_TEXT_CHARS = 1800;

/** Parse ffmpeg showinfo stderr into frame timestamps (seconds). */
export function parseShowinfoTimes(stderr) {
  const times = [];
  for (const match of String(stderr).matchAll(/pts_time:\s*([\d.]+)/gu)) {
    times.push(Number(match[1]));
  }
  return times;
}

/** Steps sorted by video offset get [start, end) windows on their own video. */
export function stepWindows(steps) {
  const byVideo = new Map();
  for (const step of steps) {
    if (!step.video || typeof step.videoOffsetSec !== 'number') continue;
    if (!byVideo.has(step.video)) byVideo.set(step.video, []);
    byVideo.get(step.video).push(step);
  }
  const windows = new Map();
  for (const list of byVideo.values()) {
    list.sort((a, b) => a.videoOffsetSec - b.videoOffsetSec);
    list.forEach((step, index) => {
      const next = list[index + 1];
      windows.set(step.step, {
        video: step.video,
        start: step.videoOffsetSec,
        end: next ? next.videoOffsetSec : Number.POSITIVE_INFINITY,
      });
    });
  }
  return windows;
}

/** Pick up to `max` keyframe times inside a window, spread across it. */
export function pickKeyframes(times, window, max = MAX_KEYFRAMES_PER_STEP) {
  const inside = times.filter(t => t >= window.start && t < window.end);
  if (inside.length <= max) return inside;
  const picked = [];
  for (let i = 0; i < max; i += 1) {
    picked.push(inside[Math.round((i * (inside.length - 1)) / (max - 1))]);
  }
  return [...new Set(picked)];
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

export function videoDuration(path) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' }
  );
  const value = Number(String(result.stdout).trim());
  return Number.isFinite(value) ? value : null;
}

/** Scene-change keyframe times for a video (plus t=0). */
export function sceneTimes(videoPath) {
  const result = ffmpeg([
    '-i',
    videoPath,
    '-vf',
    `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
    '-f',
    'null',
    '-',
  ]);
  return [0, ...parseShowinfoTimes(result.stderr)];
}

export function extractFrame(videoPath, t, outPath) {
  const result = ffmpeg([
    '-ss',
    String(t),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    outPath,
  ]);
  if (!existsSync(outPath)) {
    throw new Error(
      `ffmpeg could not extract ${t}s from ${videoPath}: ${result.stderr.slice(-300)}`
    );
  }
  return outPath;
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * @param {{ runDir: string, outDir: string, surface: string, includeNotRun?: boolean }} args
 */
export function ingestRun({ runDir, outDir, surface }) {
  const root = resolve(runDir);
  const stepsPath = join(root, 'steps.json');
  if (!existsSync(stepsPath)) throw new Error(`no steps.json in ${root}`);
  const rawSteps = JSON.parse(readFileSync(stepsPath, 'utf8'));
  // A step with no screenshot and no video was never recorded: it cannot pass.
  const recorded = rawSteps.filter(step => step.screenshot || step.video);
  const notRecorded = rawSteps
    .filter(step => !step.screenshot && !step.video)
    .map(step => ({
      id: String(step.step),
      title: step.title,
      note: step.note ?? '',
    }));

  const framesDir = join(outDir, 'frames');
  mkdirSync(framesDir, { recursive: true });
  const windows = stepWindows(recorded);
  const sceneCache = new Map();
  const consoleNotes = existsSync(join(root, 'console.json'))
    ? JSON.parse(readFileSync(join(root, 'console.json'), 'utf8'))
    : {};
  const videos = new Map();

  const steps = recorded.map(step => {
    const id = String(step.step).replace(/[^\w.-]+/gu, '_');
    const images = [];
    if (step.screenshot) {
      const path = join(root, step.screenshot);
      if (existsSync(path)) {
        images.push({
          name: `${id}-shot`,
          path,
          t: step.videoOffsetSec ?? null,
          source: 'step-screenshot',
        });
      }
    }
    const window = windows.get(step.step);
    if (window) {
      const videoPath = join(root, window.video);
      if (existsSync(videoPath)) {
        if (!videos.has(window.video)) {
          videos.set(window.video, {
            file: window.video,
            path: videoPath,
            durationSec: videoDuration(videoPath),
          });
        }
        if (!sceneCache.has(videoPath))
          sceneCache.set(videoPath, sceneTimes(videoPath));
        const end = Math.min(
          window.end,
          videos.get(window.video).durationSec ?? window.end
        );
        for (const [k, t] of pickKeyframes(sceneCache.get(videoPath), {
          start: window.start,
          end,
        }).entries()) {
          const out = join(
            framesDir,
            `${id}-${basename(window.video, extname(window.video))}-${t.toFixed(2)}s.png`
          );
          extractFrame(videoPath, t, out);
          images.push({
            name: `${id}-kf${k + 1}`,
            path: out,
            t,
            video: window.video,
            source: 'video-keyframe',
          });
        }
      }
    }
    const domText =
      readOptional(join(root, 'dom', `${step.step}.txt`)) ?? step.text ?? null;
    return {
      id,
      title: step.title,
      url: step.url ?? null,
      video: step.video ?? null,
      videoOffsetSec: step.videoOffsetSec ?? null,
      recorderVerdict: step.verdict ?? null,
      recorderNote: step.note ?? null,
      images,
      text: domText ? domText.slice(0, MAX_TEXT_CHARS) : undefined,
      console: consoleNotes[step.step] ?? undefined,
    };
  });

  return {
    schema: MANIFEST_SCHEMA,
    surface,
    runDir: root,
    videos: [...videos.values()],
    steps: steps.filter(step => step.images.length > 0),
    unjudgeable: [
      ...notRecorded,
      ...steps
        .filter(step => step.images.length === 0)
        .map(step => ({
          id: step.id,
          title: step.title,
          note: 'no readable image',
        })),
    ],
  };
}
