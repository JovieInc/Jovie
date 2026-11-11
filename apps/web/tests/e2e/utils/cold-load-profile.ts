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

interface LoadedChunk {
  readonly lines: readonly string[];
  readonly map: SourceMap | null;
  readonly mapStatus: string;
}

async function loadChunk(
  page: Page,
  url: string,
  cache: Map<string, LoadedChunk>
): Promise<LoadedChunk> {
  const cached = cache.get(url);
  if (cached) return cached;
  let lines: string[] = [];
  let map: SourceMap | null = null;
  let mapStatus = 'chunk unreadable';
  try {
    const chunk = await page.request.get(url);
    const text = chunk.ok() ? await chunk.text() : '';
    lines = text.split('\n');
    const comment = [...text.matchAll(/\/\/# sourceMappingURL=(\S+)/gu)].at(
      -1
    )?.[1];
    const mapUrl = new URL(comment ?? `${url.split('?')[0]}.map`, url).href;
    const response = await page.request.get(mapUrl);
    mapStatus = `${comment ? 'comment' : 'guessed'} map HTTP ${response.status()}`;
    if (response.ok()) {
      map = new SourceMap((await response.json()) as SourceMapPayload);
    }
  } catch (error) {
    mapStatus = `map failed (${String(error).slice(0, 80)})`;
  }
  const loaded = { lines, map, mapStatus };
  cache.set(url, loaded);
  return loaded;
}

/** The minified code around a hot position, so an unmapped frame is findable. */
function snippetAt(lines: readonly string[], line: number, column: number) {
  const text = lines[line] ?? '';
  return text
    .slice(Math.max(0, column - 30), column + 90)
    .replace(/\s+/gu, ' ');
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
    const chunks = new Map<string, LoadedChunk>();
    const bySource = new Map<string, number>();
    const byFunction = new Map<string, number>();
    let mapped = 0;

    for (const { node, ms } of frames.slice(0, MAPPED_CANDIDATES)) {
      const { functionName, url, lineNumber, columnNumber } = node.callFrame;
      let source = url ? url.replace(origin, '') : functionName;
      let name = functionName || '(anonymous)';
      if (url.startsWith(origin)) {
        const chunk = await loadChunk(page, url, chunks);
        const entry = chunk.map?.findEntry(lineNumber, columnNumber) as
          | { originalSource?: string; originalLine?: number; name?: string }
          | undefined;
        if (entry?.originalSource) {
          mapped += 1;
          source = shortSource(entry.originalSource);
          name = `${entry.name ?? name} ${source}:${(entry.originalLine ?? 0) + 1}`;
        } else {
          name = `${name} ${source} \`${snippetAt(chunk.lines, lineNumber, columnNumber)}\``;
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
        `${mapped} of ${Math.min(frames.length, MAPPED_CANDIDATES)} hot frames source-mapped ` +
        `(${[...new Set([...chunks.values()].map(chunk => chunk.mapStatus))].join(', ')})\n` +
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
