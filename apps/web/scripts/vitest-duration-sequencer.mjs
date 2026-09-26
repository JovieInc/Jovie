import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseSequencer } from 'vitest/node';

// Duration-weighted `--shard`: files go longest-first to the lightest shard
// instead of Vitest's equal-count path-hash slices. A file costs
// `overheadMs + (files[path] ?? defaultTestMs)` from
// tests/unit-shard-durations.json (only heavy files are listed). The result
// depends only on the resolved file list, so every shard runner agrees, and
// each file lands in exactly one shard. A stale or missing map only degrades
// balance toward equal counts; it never drops a file.

// Cost of non-Vitest CI work pinned to a shard (.github/workflows/ci.yml:
// packages/ui ~41s on 4/10, Ovie ~4s on 1/10) in map cost units (~1.3x wall),
// preloaded so LPT offsets it.
export const CI_RESERVED_MS = { '1/10': 5000, '4/10': 55_000 };

export const DEFAULT_DURATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/unit-shard-durations.json'
);

const positive = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

/** @returns {{ files: Map<string, number>, defaultMs: number }} costs in ms */
export function normalizeDurations(raw) {
  const map = raw && typeof raw === 'object' ? raw : {};
  const overhead = positive(map.overheadMs, 0);
  const defaultMs = overhead + positive(map.defaultTestMs, 0) || 1;
  const files = new Map();
  for (const [file, ms] of Object.entries(map.files ?? {})) {
    if (positive(ms, -1) >= 0) files.set(file, overhead + ms);
  }
  return { files, defaultMs };
}

export function loadDurations(file = DEFAULT_DURATIONS_PATH) {
  try {
    return normalizeDurations(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return normalizeDurations(null);
  }
}

/** Greedy LPT partition of unique keys into `count` buckets (shard i = [i-1]). */
export function partitionByDuration(keys, count, durations, reserved = {}) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`shard count must be a positive integer, got ${count}`);
  }
  const weighted = keys
    .map(key => ({
      key,
      weight: durations.files.get(key) ?? durations.defaultMs,
    }))
    .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
  const buckets = Array.from({ length: count }, () => []);
  const loads = buckets.map((_, i) => reserved[`${i + 1}/${count}`] ?? 0);
  for (const { key, weight } of weighted) {
    let target = 0;
    for (let i = 1; i < count; i++) if (loads[i] < loads[target]) target = i;
    buckets[target].push(key);
    loads[target] += weight;
  }
  return buckets;
}

export default class DurationShardSequencer extends BaseSequencer {
  get durations() {
    this._durations ??= loadDurations();
    return this._durations;
  }

  fileOf(spec) {
    return path
      .relative(this.ctx.config.root, spec.moduleId)
      .split(path.sep)
      .join('/');
  }

  async shard(files) {
    const { index, count } = this.ctx.config.shard;
    // Key by file + project so a file shared by two projects is placed once each.
    const specs = new Map(
      files.map(spec => [`${this.fileOf(spec)}\0${spec.project.name}`, spec])
    );
    const costs = new Map();
    for (const [key, spec] of specs) {
      const cost = this.durations.files.get(this.fileOf(spec));
      if (cost !== undefined) costs.set(key, cost);
    }
    const buckets = partitionByDuration(
      [...specs.keys()],
      count,
      { files: costs, defaultMs: this.durations.defaultMs },
      CI_RESERVED_MS
    );
    return buckets[index - 1].map(key => specs.get(key));
  }

  async sort(files) {
    if (!this.ctx.config.shard) return super.sort(files);
    // Heaviest first inside a shard so a long file never runs last on an
    // otherwise idle worker; project grouping matches BaseSequencer.
    const weight = spec =>
      this.durations.files.get(this.fileOf(spec)) ?? this.durations.defaultMs;
    return [...files].sort(
      (a, b) =>
        a.project.config.sequence.groupOrder -
          b.project.config.sequence.groupOrder ||
        (a.project.name === b.project.name
          ? weight(b) - weight(a) || (this.fileOf(a) < this.fileOf(b) ? -1 : 1)
          : a.project.name < b.project.name
            ? -1
            : 1)
    );
  }
}
