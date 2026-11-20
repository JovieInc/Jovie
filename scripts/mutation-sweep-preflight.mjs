#!/usr/bin/env node
// Spare-compute gate for the rolling mutation sweep. Builtins only, so it runs
// before dependencies are installed. Exit 0: host has capacity. Exit 75: gem is
// busy (RAM, disk or CPU), skip this run without failing the workflow.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Spare-compute gate: refuse to start when gem is busy. Exit 75 = skip. */
export function preflight(repoRoot) {
  const minMemGb = Number(process.env.MUTATION_MIN_MEM_GB ?? 8);
  const maxLoad = Number(process.env.MUTATION_MAX_LOAD ?? 8);
  const minDiskGb = Number(process.env.MUTATION_MIN_DISK_GB ?? 15);
  const problems = [];
  if (existsSync('/proc/meminfo')) {
    const kb = Number(
      /MemAvailable:\s+(\d+)/u.exec(
        readFileSync('/proc/meminfo', 'utf8')
      )?.[1] ?? 0
    );
    if (kb / 1048576 < minMemGb)
      problems.push(
        `MemAvailable ${(kb / 1048576).toFixed(1)}GB < ${minMemGb}GB`
      );
  }
  if (existsSync('/proc/loadavg')) {
    // Off-peak gate (2026-10-29): the 5-minute load average, not the instantaneous one.
    const load = Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[1]);
    if (load > maxLoad) problems.push(`5-min load ${load} > ${maxLoad}`);
  }
  const df = spawnSync('df', ['-Pk', repoRoot], { encoding: 'utf8' });
  const avail = Number(
    df.stdout?.split('\n')[1]?.split(/\s+/u)[3] ?? Number.NaN
  );
  if (Number.isFinite(avail) && avail / 1048576 < minDiskGb) {
    problems.push(
      `disk ${(avail / 1048576).toFixed(0)}GB free < ${minDiskGb}GB`
    );
  }
  return problems;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = preflight(repoRoot);
  if (problems.length > 0) {
    console.log(`Skipping mutation sweep, host busy: ${problems.join('; ')}`);
    process.exit(75);
  }
  console.log('Host has spare capacity.');
}
