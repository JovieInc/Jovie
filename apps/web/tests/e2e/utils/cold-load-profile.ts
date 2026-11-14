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
  readonly children?: readonly number[];
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

const APP_SOURCE = /^(apps\/web|packages)\//u;

interface BusyRun {
  readonly start: number;
  readonly end: number;
  readonly atMs: number;
  readonly ms: number;
}

/** Stretches of consecutive non-idle samples, longest first: long tasks. */
export function busyRuns(profile: CpuProfile): BusyRun[] {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const idle = new Set(
    profile.nodes
      .filter(node => node.callFrame.functionName === '(idle)')
      .map(node => node.id)
  );
  const runs: BusyRun[] = [];
  let start = 0;
  let startUs = 0;
  let elapsedUs = 0;
  let us = 0;
  for (let index = 1; index <= samples.length; index += 1) {
    const delta = deltas[index] ?? 0;
    const busy = index < samples.length && !idle.has(samples[index - 1]);
    if (busy) {
      us += delta;
    } else {
      if (us > 0) {
        runs.push({ start, end: index, atMs: startUs / 1000, ms: us / 1000 });
      }
      start = index;
      startUs = elapsedUs + delta;
      us = 0;
    }
    elapsedUs += delta;
  }
  return runs.sort((x, y) => y.ms - x.ms);
}

interface MapEntry {
  readonly generatedColumn?: number;
  readonly originalSource?: string;
  readonly originalLine?: number;
  readonly name?: string;
}

/**
 * A function's start often sits just before its first mapped segment (a
 * module factory's arrow, for one), where findEntry returns the segment
 * before it, which belongs to the previous module. Prefer the first segment
 * at or after the position on the same line.
 */
function entryAtOrAfter(
  map: SourceMap,
  line: number,
  column: number
): MapEntry | undefined {
  const at = map.findEntry(line, column) as MapEntry | undefined;
  if (at?.generatedColumn === column) return at;
  for (let step = 1; step <= 400; step += 1) {
    const next = map.findEntry(line, column + step) as MapEntry | undefined;
    if (next?.generatedColumn !== undefined && next.generatedColumn >= column) {
      if (next.generatedColumn !== at?.generatedColumn) return next;
    }
  }
  return at;
}

interface MappedFrame {
  readonly source: string;
  readonly label: string;
}

async function mapFrame(
  page: Page,
  origin: string,
  node: ProfileNode,
  chunks: Map<string, LoadedChunk>
): Promise<MappedFrame | null> {
  const { functionName, url, lineNumber, columnNumber } = node.callFrame;
  if (!url.startsWith(origin)) return null;
  const chunk = await loadChunk(page, url, chunks);
  const entry = chunk.map
    ? entryAtOrAfter(chunk.map, lineNumber, columnNumber)
    : undefined;
  if (!entry?.originalSource) return null;
  const source = shortSource(entry.originalSource);
  return {
    source,
    label: `${entry.name ?? (functionName || '(anonymous)')} ${source}:${(entry.originalLine ?? 0) + 1}`,
  };
}

const DESCRIBED_RUNS = 3;
const OWNERS_PER_RUN = 8;

/**
 * Splits each of the longest tasks' samples by the nearest app or package
 * frame on each sample's stack, so React's own frames are charged to the
 * component that called into them, and names the frame that entered the task.
 */
async function describeLongestTasks(
  page: Page,
  origin: string,
  profile: CpuProfile,
  chunks: Map<string, LoadedChunk>
): Promise<string> {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  const owner = new Map<number, string>();
  const stackOf = (leaf: number): ProfileNode[] => {
    const stack: ProfileNode[] = [];
    for (
      let id: number | undefined = leaf;
      id !== undefined;
      id = parent.get(id)
    ) {
      const node = byId.get(id);
      if (!node || node.callFrame.functionName === '(root)') break;
      stack.push(node);
    }
    return stack;
  };
  const describeFrame = async (node: ProfileNode | undefined) => {
    if (!node) return '(none)';
    const frame = await mapFrame(page, origin, node, chunks);
    return frame?.label ?? (node.callFrame.functionName || '(anonymous)');
  };

  const sections: string[] = [];
  for (const run of busyRuns(profile).slice(0, DESCRIBED_RUNS)) {
    const byOwner = new Map<string, number>();
    const entries = new Map<string, number>();
    for (let index = run.start + 1; index < run.end; index += 1) {
      const leaf = samples[index - 1];
      const ms = (deltas[index] ?? 0) / 1000;
      const stack = stackOf(leaf);
      const entry = await describeFrame(stack.at(-1));
      entries.set(entry, (entries.get(entry) ?? 0) + ms);
      let label = owner.get(leaf);
      if (label === undefined) {
        label = '(no app frame on stack)';
        for (const node of stack) {
          const frame = await mapFrame(page, origin, node, chunks);
          if (frame && APP_SOURCE.test(frame.source)) {
            label = frame.label;
            break;
          }
        }
        owner.set(leaf, label);
      }
      byOwner.set(label, (byOwner.get(label) ?? 0) + ms);
    }
    const top = (map: Map<string, number>, count: number) =>
      [...map]
        .sort((x, y) => y[1] - x[1])
        .slice(0, count)
        .map(([key, ms]) => `    ${formatMs(ms)} ${key}`)
        .join('\n');
    sections.push(
      `  task ${formatMs(run.ms)} at +${formatMs(run.atMs)}; entered by:\n${top(entries, 2)}\n` +
        `  by nearest app frame:\n${top(byOwner, OWNERS_PER_RUN)}`
    );
  }
  return `longest tasks:\n${sections.join('\n')}`;
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
        `[cold-load-profile] ${label} by function:\n${top(byFunction, TOP_FUNCTIONS)}\n` +
        `[cold-load-profile] ${label} ${await describeLongestTasks(page, origin, profile, chunks)}\n`
    );
  } catch (error) {
    process.stdout.write(
      `[cold-load-profile] ${label}: profile failed (${String(error).slice(0, 120)})\n`
    );
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

/**
 * Prints which regions of the server HTML hold the most elements. Hydration
 * cost grows with the server-rendered tree, and React's own frames (beginWork,
 * getNextHydratable) carry the time without naming the component, so this
 * names the subtrees that the first render has to walk.
 */
export async function printServerDomWeight(
  page: Page,
  label: string
): Promise<void> {
  try {
    const weight = await page.evaluate(async () => {
      const html = await (await fetch(location.href)).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const all = doc.body.getElementsByTagName('*');
      const named = doc.body.querySelectorAll(
        '[data-testid], main, nav, aside, header, footer, [role="dialog"], [hidden], template'
      );
      const rows = [...named].map(el => {
        const testId = el.getAttribute('data-testid');
        const tag = el.tagName.toLowerCase();
        const hidden =
          el.hasAttribute('hidden') ||
          el.getAttribute('aria-hidden') === 'true' ||
          /\b(hidden|invisible|sr-only)\b/u.test(
            el.getAttribute('class') ?? ''
          );
        return {
          name: `${testId ? `[${testId}]` : tag}${hidden ? ' (hidden)' : ''}`,
          count: el.getElementsByTagName('*').length,
        };
      });
      rows.sort((a, b) => b.count - a.count);
      return { total: all.length, top: rows.slice(0, 25) };
    });
    process.stdout.write(
      `[cold-load-profile] ${label} server DOM: ${weight.total} elements in body\n` +
        weight.top.map(row => `  ${row.count} ${row.name}`).join('\n') +
        '\n'
    );
  } catch (error) {
    process.stdout.write(
      `[cold-load-profile] ${label} server DOM failed (${String(error).slice(0, 120)})\n`
    );
  }
}
