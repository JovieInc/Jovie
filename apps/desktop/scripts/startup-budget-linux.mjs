import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { descendantsOf } from './capture-memory-baseline.mjs';

// /proc stat's command may contain spaces and parentheses. Fields after its
// final ')' start at field 3; starttime identifies a PID across reuse.
export function parseStat(text, rss) {
  const end = text.lastIndexOf(')');
  const fields = text
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  if (end < 0 || fields.length < 20) throw new Error('Invalid /proc stat');
  return {
    pid: Number(text.slice(0, text.indexOf(' '))),
    ppid: Number(fields[1]),
    group: Number(fields[2]),
    state: fields[0],
    startTicks: Number(fields[19]),
    // Include reaped children, whose CPU otherwise disappears between samples.
    cpuTicks: fields.slice(11, 15).reduce((sum, n) => sum + Number(n), 0),
    rssBytes: Number(rss.match(/^VmRSS:\s+(\d+) kB$/m)?.[1] ?? 0) * 1024,
  };
}

export async function processSnapshot() {
  const names = (await readdir('/proc')).filter(name => /^\d+$/.test(name));
  const rows = await Promise.all(
    names.map(async name => {
      try {
        const [stat, status] = await Promise.all([
          readFile(`/proc/${name}/stat`, 'utf8'),
          readFile(`/proc/${name}/status`, 'utf8'),
        ]);
        return parseStat(stat, status);
      } catch (error) {
        if (['ENOENT', 'ESRCH'].includes(error.code)) return null;
        throw error;
      }
    })
  );
  return rows.filter(Boolean);
}

export function clockTicksPerSecond() {
  const ticks = Number(
    execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' })
  );
  if (!Number.isFinite(ticks) || ticks <= 0) throw new Error('Invalid CLK_TCK');
  return ticks;
}

export function summarizeSample(rows, launcherPid, elapsedMs, targetMs) {
  const tree = descendantsOf(rows, launcherPid);
  const main = tree.find(row => row.ppid === launcherPid);
  if (!main || main.state === 'Z')
    throw new Error('Electron exited before sample');
  const electronTree = descendantsOf(rows, main.pid);
  return {
    targetMs,
    elapsedMs,
    mainPid: main.pid,
    processCount: electronTree.length,
    mainRssMb: main.rssBytes / 1e6,
    treeRssMb: electronTree.reduce((sum, row) => sum + row.rssBytes, 0) / 1e6,
    cpuTicks: electronTree.reduce((sum, row) => sum + row.cpuTicks, 0),
    processes: electronTree,
  };
}

export function intervalCpuPercent(first, last, ticksPerSecond) {
  const elapsed = last.elapsedMs - first.elapsedMs;
  const ticks = last.cpuTicks - first.cpuTicks;
  if (elapsed <= 0 || ticks < 0 || first.mainPid !== last.mainPid)
    throw new Error('Invalid CPU sample interval');
  return (ticks / ticksPerSecond / (elapsed / 1000)) * 100;
}

export function remainingChildren(rows, launcherPid, known) {
  return rows.filter(
    row =>
      row.pid !== launcherPid &&
      (row.group === launcherPid ||
        known.some(
          old => old.pid === row.pid && old.startTicks === row.startTicks
        ))
  );
}

export async function quitAndInspect({
  launcherPid,
  mainPid,
  known,
  snapshot,
  signal,
  wait,
  now,
}) {
  const send = (pid, name) => {
    try {
      signal(pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  let remaining = [];
  try {
    const target = (await snapshot()).find(
      row => row.pid === (mainPid ?? launcherPid)
    );
    if (
      target &&
      known.some(
        old => old.pid === target.pid && old.startTicks === target.startTicks
      )
    )
      send(target.pid, 'SIGTERM');
    const deadline = now() + 5000;
    do {
      await wait(100);
      remaining = remainingChildren(await snapshot(), launcherPid, known);
    } while (remaining.length && now() < deadline);
  } finally {
    // Always tear down our process group, including when sampling fails.
    send(-launcherPid, 'SIGKILL');
    // A known descendant can escape the group. Recheck its start identity
    // immediately before signaling; never kill a recycled PID.
    for (const current of await snapshot()) {
      if (
        [...known, ...remaining].some(
          old =>
            old.pid === current.pid && old.startTicks === current.startTicks
        )
      )
        send(current.pid, 'SIGKILL');
    }
  }
  // Record leaks before bounded teardown. Reparented children retain the group.
  const afterQuit = remaining.map(row => ({
    pid: row.pid,
    startTicks: row.startTicks,
  }));
  await wait(100);
  const afterCleanup = remainingChildren(await snapshot(), launcherPid, known);
  return {
    method: 'SIGTERM',
    graceMs: 5000,
    afterQuit,
    forcedCleanup: afterQuit.length > 0,
    afterCleanup: afterCleanup.map(row => row.pid),
  };
}
