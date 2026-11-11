import { SourceMap, type SourceMapPayload } from 'node:module';
import type { CDPSession, Page } from '@playwright/test';

/**
 * Names the code behind a cold load's main-thread time (JOV-10150).
 *
 * The production cert sees one ~265 ms React render on cold loads of
 * /app/chat, but production serves no source maps, so its long-animation-frame
 * attribution stops at react-dom's scheduler. CI builds outside Vercel do
 * serve .map files, so this samples the CPU during one cold load there and
 * prints self time by original source file and function. It only prints;
 * no budget reads it.
 */

interface ProfileNode {
  readonly id: number;
  readonly callFrame: {
    readonly functionName: string;
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  };
}

interface CpuProfile {
  readonly nodes: readonly ProfileNode[];
  readonly samples?: readonly number[];
  readonly timeDeltas?: readonly number[];
}

interface FrameSelf {
  readonly node: ProfileNode;
  readonly ms: number;
}

const SKIPPED_FRAMES = new Set(['(idle)', '(root)']);
const TOP_FUNCTIONS = 15;
const TOP_SOURCES = 12;
const MAPPED_CANDIDATES = 80;

export function selfTimeByNode(profile: CpuProfile): FrameSelf[] {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const selfUs = new Map<number, number>();
  for (let index = 1; index < samples.length; index += 1) {
    const nodeId = samples[index - 1];
    selfUs.set(nodeId, (selfUs.get(nodeId) ?? 0) + (deltas[index] ?? 0));
  }
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const frames: FrameSelf[] = [];
  for (const [id, us] of selfUs) {
    const node = byId.get(id);
    if (!node || SKIPPED_FRAMES.has(node.callFrame.functionName)) continue;
    frames.push({ node, ms: us / 1000 });
  }
  return frames.sort((a, b) => b.ms - a.ms);
}

function shortSource(source: string): string {
  return source
    .replace(/^webpack:\/\/[^/]*\//u, '')
    .replace(/^turbopack:\/\/\/?(\[project\]\/)?/u, '')
    .replace(/^.*\/node_modules\/\.pnpm\/[^/]+\/node_modules\//u, '')
    .replace(/^\.\//u, '');
}

async function loadSourceMap(
  page: Page,
  url: string,
  cache: Map<string, SourceMap | null>
): Promise<SourceMap | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  let map: SourceMap | null = null;
  try {
    const response = await page.request.get(`${url.split('?')[0]}.map`);
    if (response.ok()) {
      map = new SourceMap((await response.json()) as SourceMapPayload);
    }
  } catch {
    map = null;
  }
  cache.set(url, map);
  return map;
}

function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/**
 * Runs `load` under the CPU sampler and prints where the main thread spent
 * its time, mapped through the served source maps when they exist.
 */
export async function printColdLoadProfile(
  page: Page,
  label: string,
  load: () => Promise<void>
): Promise<void> {
  let cdp: CDPSession | undefined;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  } catch {
    cdp = undefined;
  }
  await load();
  if (!cdp) {
    process.stdout.write(`[cold-load-profile] ${label}: no CPU profiler\n`);
    return;
  }

  try {
    const { profile } = (await cdp.send('Profiler.stop')) as {
      profile: CpuProfile;
    };
    const frames = selfTimeByNode(profile);
    const totalMs = frames.reduce((sum, frame) => sum + frame.ms, 0);
    const origin = new URL(page.url()).origin;
    const maps = new Map<string, SourceMap | null>();
    const bySource = new Map<string, number>();
    const byFunction = new Map<string, number>();
    let mapped = 0;

    for (const { node, ms } of frames.slice(0, MAPPED_CANDIDATES)) {
      const { functionName, url, lineNumber, columnNumber } = node.callFrame;
      let source = url ? url.replace(origin, '') : functionName;
      let name = functionName || '(anonymous)';
      if (url.startsWith(origin)) {
        const map = await loadSourceMap(page, url, maps);
        const entry = map?.findEntry(lineNumber, columnNumber) as
          | { originalSource?: string; originalLine?: number; name?: string }
          | undefined;
        if (entry?.originalSource) {
          mapped += 1;
          source = shortSource(entry.originalSource);
          name = `${entry.name ?? name} ${source}:${(entry.originalLine ?? 0) + 1}`;
        }
      }
      bySource.set(source, (bySource.get(source) ?? 0) + ms);
      byFunction.set(name, (byFunction.get(name) ?? 0) + ms);
    }

    const top = (entries: Map<string, number>, count: number) =>
      [...entries]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([key, ms]) => `  ${formatMs(ms)} ${key}`)
        .join('\n');

    process.stdout.write(
      `[cold-load-profile] ${label}: ${formatMs(totalMs)} busy main thread; ` +
        `${mapped} of ${Math.min(frames.length, MAPPED_CANDIDATES)} hot frames source-mapped\n` +
        `[cold-load-profile] ${label} by source:\n${top(bySource, TOP_SOURCES)}\n` +
        `[cold-load-profile] ${label} by function:\n${top(byFunction, TOP_FUNCTIONS)}\n`
    );
  } catch (error) {
    process.stdout.write(
      `[cold-load-profile] ${label}: profile failed (${String(error).slice(0, 120)})\n`
    );
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}
