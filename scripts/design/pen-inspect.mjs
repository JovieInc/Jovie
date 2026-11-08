#!/usr/bin/env node
/**
 * Read-only look into the Pen workspace from CI, for agents that cannot open
 * Pen on Tim's Mac. Finds frames whose name matches a query in every .pen of
 * PEN_GOLDEN_PATH_FILE_URL, exports each one to PNG and dumps its node tree
 * (size, fill, type, spacing, radius, text) as JSON, so a screen can be built
 * to match its Pen design.
 *
 *   node scripts/design/pen-inspect.mjs --out DIR --query "sign ?in|auth"
 *
 * It never writes a .pen file: each headless session's --out is a throwaway.
 * Without PEN_CLI_KEY or the file URL it inspects nothing and says so.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const PEN_CLI_VERSION = '0.3.14';
export const HIT_PREFIX = 'PEN_INSPECT_HIT ';
export const TREE_PREFIX = 'PEN_INSPECT_TREE ';
export const LIST_PREFIX = 'PEN_INSPECT_TOP ';

const ROUND = 'const r = v => (typeof v === "number" ? Math.round(v) : v);';

/** First `execute`: list top frames and find the matching ones (cheap). */
export function findProgram(query, { maxHits = 24 } = {}) {
  // The query becomes a RegExp inside Pen; JSON keeps it a safe literal.
  const q = JSON.stringify(String(query));
  // Each program is a block, in case executes share one global scope.
  return `{
const re = new RegExp(${q}, 'i');
let hits = 0;
${ROUND}
Get((n, c) => {
  if (c.depth <= 1 && n.type === 'frame')
    Print(${JSON.stringify(LIST_PREFIX)} + JSON.stringify({ id: n.id, name: n.name, depth: c.depth, w: r(c.bounds.width), h: r(c.bounds.height) }));
  if (hits < ${Number(maxHits)} && n.type === 'frame' && (re.test(n.name || '') || re.test(n.id)) && c.bounds.width >= 280) {
    hits += 1;
    Print(${JSON.stringify(HIT_PREFIX)} + JSON.stringify({ id: n.id, name: n.name, depth: c.depth, w: r(c.bounds.width), h: r(c.bounds.height) }));
    c.skipChildren();
  }
});
}`;
}

/**
 * One `execute` per frame: dump its tree and export it. Pen gives each
 * execute about 55 s, so a big workspace can't do every frame in one call.
 */
export function frameProgram(id, pngDir, { maxRows = 1500 } = {}) {
  const fid = JSON.stringify(String(id));
  return `{
const rows = [];
${ROUND}
Get(${fid}, (n, c) => {
  if (rows.length >= ${Number(maxRows)}) return c.skipChildren();
  rows.push({
    d: c.depth, id: n.id, type: n.type, name: n.name,
    x: r(c.bounds.x), y: r(c.bounds.y), w: r(c.bounds.width), h: r(c.bounds.height),
    content: n.content, fill: n.fill, stroke: n.stroke, opacity: n.opacity,
    cornerRadius: n.cornerRadius, padding: n.padding, gap: n.gap,
    layout: n.layout, justifyContent: n.justifyContent, alignItems: n.alignItems,
    fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight,
    letterSpacing: n.letterSpacing, lineHeight: n.lineHeight, textAlign: n.textAlign,
    effect: n.effect, enabled: n.enabled, ref: n.ref,
  });
}, { resolveInstances: true });
Print(${JSON.stringify(TREE_PREFIX)} + JSON.stringify({ id: ${fid}, rows }));
Export([${fid}], 'png', ${JSON.stringify(pngDir)});
}`;
}

/** One interactive-shell script: run each program in turn, then exit. */
export function shellScript(...programs) {
  return `${programs
    .map(program => `execute(${JSON.stringify({ input: program })})\n`)
    .join('')}exit()\n`;
}

/** Pull the tagged lines out of the shell's stdout. */
export function parseOutput(stdout) {
  const out = { top: [], hits: [], trees: [] };
  for (const line of String(stdout).split('\n')) {
    for (const [prefix, key] of [
      [LIST_PREFIX, 'top'],
      [HIT_PREFIX, 'hits'],
      [TREE_PREFIX, 'trees'],
    ]) {
      const at = line.indexOf(prefix);
      if (at < 0) continue;
      try {
        out[key].push(JSON.parse(line.slice(at + prefix.length)));
      } catch {
        // A line Pen cut short is skipped, not fatal.
      }
    }
  }
  return out;
}

function penFiles(dir) {
  const all = [];
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.pen') && !entry.name.startsWith('._'))
        all.push(path);
    }
  };
  walk(dir);
  return all.sort();
}

/**
 * @param {{ out: string, query: string, logPng?: string | null, maxHits?: number, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, run?: (cmd: string, args: string[], opts?: object) => Buffer | string, log?: (line: string) => void }} options
 */
/** Where artifacts can't be downloaded, print chosen frames into the log. */
export function echoFrames({ parsed, pngDir, pattern, log, chunk = 6000 }) {
  const re = new RegExp(pattern, 'i');
  const names = existsSync(pngDir) ? readdirSync(pngDir) : [];
  const emit = (tag, id, text) => {
    const parts = Math.ceil(text.length / chunk) || 1;
    for (let i = 0; i < parts; i += 1)
      log(
        `${tag} ${id} ${i + 1}/${parts} ${text.slice(i * chunk, (i + 1) * chunk)}`
      );
  };
  for (const hit of parsed.hits.filter(h => re.test(h.name ?? ''))) {
    const tree = parsed.trees.find(t => t.id === hit.id);
    if (tree) emit('PEN_TREE_JSON', hit.id, JSON.stringify(tree));
    const png = names.find(n => n.endsWith('.png') && n.includes(hit.id));
    if (png)
      emit(
        'PEN_PNG_B64',
        hit.id,
        readFileSync(join(pngDir, png)).toString('base64')
      );
  }
}

export async function runInspect({
  out,
  query,
  logPng = null,
  maxHits = 8,
  env = process.env,
  fetchImpl = fetch,
  run = (cmd, args, opts) =>
    execFileSync(cmd, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
      ...opts,
    }),
  log = line => {
    process.stdout.write(`${line}\n`);
  },
}) {
  mkdirSync(out, { recursive: true });
  const missing = ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL'].filter(
    name => !env[name]
  );
  if (missing.length) {
    log(`Pen inspect skipped: ${missing.join(' and ')} not set`);
    writeFileSync(
      join(out, 'inspect.json'),
      JSON.stringify({ query, skipped: missing, files: [] }, null, 2)
    );
    return { skipped: missing, files: [] };
  }
  const work = join(out, 'workspace');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const response = await fetchImpl(env.PEN_GOLDEN_PATH_FILE_URL);
  if (!response.ok)
    throw new Error(`Pen file download: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const isArchive = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const download = join(work, isArchive ? 'workspace.tar.gz' : 'src.pen');
  writeFileSync(download, bytes);
  if (isArchive) run('tar', ['-xzf', download, '-C', work]);
  const pens = isArchive ? penFiles(work) : [download];
  const files = [];
  for (const [i, pen] of pens.entries()) {
    const pngDir = join(out, 'png', String(i));
    mkdirSync(pngDir, { recursive: true });
    const throwaway = join(out, `throwaway-${i}.pen`);
    const session = (label, script) => {
      try {
        return String(
          run(
            'npx',
            [
              '-y',
              `@pen.dev/cli@${PEN_CLI_VERSION}`,
              'interactive',
              '--in',
              pen,
              '--out',
              throwaway,
            ],
            { cwd: dirname(pen), input: script, env }
          )
        );
      } catch (error) {
        log(
          `Pen inspect ${label} failed on ${basename(pen)}: ${error?.message ?? error}`
        );
        return String(error?.stdout ?? '');
      } finally {
        rmSync(throwaway, { force: true });
      }
    };
    const findOut = session(
      'find',
      shellScript(findProgram(query, { maxHits }))
    );
    const found = parseOutput(findOut);
    // One session per frame: a frame that runs out of time costs only itself.
    const frames = found.hits.map(h =>
      session(`export ${h.id}`, shellScript(frameProgram(h.id, pngDir)))
    );
    const stdout = [findOut, ...frames].join('\n');
    writeFileSync(join(out, `stdout-${i}.log`), stdout);
    const parsed = { ...found, trees: parseOutput(stdout).trees };
    files.push({ index: i, name: basename(pen), ...parsed });
    log(
      `${basename(pen)}: ${parsed.top.length} top frames, ${parsed.hits.length} matches`
    );
    for (const f of parsed.top.filter(t => t.depth === 0))
      log(`top ${f.id} ${f.w}x${f.h} ${f.name}`);
    for (const h of parsed.hits) log(`match ${h.id} ${h.w}x${h.h} ${h.name}`);
    if (logPng) echoFrames({ parsed, pngDir, pattern: logPng, log });
  }
  rmSync(work, { recursive: true, force: true });
  writeFileSync(
    join(out, 'inspect.json'),
    JSON.stringify({ query, files }, null, 2)
  );
  return { skipped: [], files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      query: { type: 'string' },
      'log-png': { type: 'string' },
    },
  });
  if (!values.out || !values.query) {
    process.stderr.write('usage: pen-inspect.mjs --out DIR --query REGEX\n');
    process.exit(64);
  }
  try {
    await runInspect({
      out: resolve(values.out),
      query: values.query,
      logPng: values['log-png'] ?? null,
    });
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exit(1);
  }
}
