/**
 * Live Pen canvas bridge for the review loop.
 *
 * Drives the running Pen desktop app through `pen interactive -a desktop`
 * (the live-canvas attach in .claude/rules/pen.md): one shell per call, the
 * snippet passed as a JS string literal, Print output parsed back. Never opens,
 * copies or saves a second document. Headless rendering (`--in/--out`) is used
 * only for reading the on-disk state in the save guard.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** ANSI colour codes in CLI output (ESC built at runtime: no control char in source). */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
export const CANONICAL_PEN =
  process.env.PEN_REVIEW_FILE ||
  join(
    process.env.HOME ?? '',
    'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen'
  );

/** Parses the `{ "message": "..." }` block a `pen interactive` call prints. */
export function parseShellOutput(stdout) {
  const text = String(stdout).replace(ANSI, '');
  const results = [];
  // The message literal is one JSON line; headless runs interleave [WARN]
  // lines (missing optional assets) around it, so do not anchor on braces.
  const re = /"message":\s*("(?:[^"\\\n]|\\.)*")/g;
  for (const m of text.matchAll(re)) results.push(JSON.parse(m[1]));
  if (results.length === 0) results.push(...plainMessages(text));
  if (results.length === 0) {
    const err = text.match(/(?:Error|error)[^\n]*/)?.[0];
    const tail = text
      .split('\n')
      .filter(l => l.trim() && !/unwatch-file|^\s+at /.test(l))
      .slice(-6)
      .join(' | ');
    throw new Error(
      `pen shell returned no result${err ? `: ${err}` : ''} [${tail.slice(-600)}]`
    );
  }
  return results.map(message => {
    const print = message.split('## Print output\n')[1] ?? '';
    return {
      message,
      ok: message.startsWith('OK'),
      lines: print
        .split('\n')
        .map(l => l.replace(/\s+$/, ''))
        .filter(Boolean),
    };
  });
}

/**
 * Headless `pen interactive --in` prints each result as raw text ("OK", blank,
 * "## Print output", lines) between [WARN] noise, not as a JSON literal.
 */
function plainMessages(text) {
  const clean = text
    .split('\n')
    .map(l => l.replace(/^(?:pen\s*>\s*)+/, ''))
    .filter(
      l =>
        !/^\[(WARN|ERROR|INFO)\]|^\s+at |^\s+code: |^\}$|unwatch-file|Goodbye\.|^pen\.dev Interactive|^File: |^Type /.test(
          l
        )
    )
    .join('\n');
  const starts = [
    ...clean.matchAll(/^(OK|Error[^\n]*|### Failure[^\n]*)$/gm),
  ].map(m => m.index);
  return starts.map((at, i) =>
    clean.slice(at, starts[i + 1] ?? clean.length).trim()
  );
}

/**
 * Runs snippets on the live canvas (or a headless file with `inFile`).
 * @param {string[]} snippets
 * @param {{app?: string, inFile?: string, outFile?: string, timeoutMs?: number, spawn?: Function}} [opts]
 */
export function runPen(snippets, opts = {}) {
  // The live attach can fail transiently while another client (the MCP, a
  // fixer) holds the app's IPC ("Cannot destructure property 'context'").
  // Retry those only; a real execute error fails at once.
  for (let attempt = 0; ; attempt++) {
    try {
      return runPenOnce(snippets, opts);
    } catch (error) {
      if (
        opts.inFile ||
        attempt >= 2 ||
        !/IPC|context' of|Connection|ECONNRESET|no result/.test(
          String(error.message)
        )
      )
        throw error;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        3000 * (attempt + 1)
      );
    }
  }
}

function runPenOnce(
  snippets,
  {
    app = 'desktop',
    inFile,
    outFile,
    timeoutMs = 180_000,
    spawn = spawnSync,
  } = {}
) {
  const args = inFile
    ? ['interactive', '--in', inFile, '--out', outFile]
    : ['interactive', '-a', app];
  const input = `${snippets.map(s => `execute({ input: ${JSON.stringify(s)} })`).join('\n')}\nexit()\n`;
  // stdout goes to a file, not a pipe: the CLI exits before a piped stdout
  // drains, which cut every result at 64 KiB (2026-11-01: facts for a 1348x900
  // frame came back truncated and the loop died with "no result"). File writes
  // in Node are synchronous, so nothing is lost.
  const dir = mkdtempSync(join(tmpdir(), 'pen-shell-'));
  const outPath = join(dir, 'out.txt');
  const fd = openSync(outPath, 'w');
  let res;
  try {
    res = spawn('pen', args, {
      input,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  if (res.error) throw res.error;
  const text = readFileSync(outPath, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  // Headless mode prints results on stderr, the live attach on stdout.
  const parsed = parseShellOutput(
    `${text}\n${res.stdout ?? ''}\n${res.stderr ?? ''}`
  );
  const failed = parsed.find(p => !p.ok);
  if (failed)
    throw new Error(`pen execute failed: ${failed.message.slice(0, 300)}`);
  return parsed;
}

const tagged = (lines, tag) =>
  lines
    .filter(l => l.startsWith(tag))
    .map(l => JSON.parse(l.slice(tag.length)));

/** Pen-side: every visible node with absolute bounds, raw + resolved props. */
export function factsSnippet(id) {
  return `const F=${JSON.stringify(id)};const raw={};const refs={};Get(F,n=>{if(n.ref)refs[n.id]=n.ref});const out=[];const root=Get(F,{depth:0});
Get(F,(n,c)=>{if(n.enabled===false){c.skipChildren();return}raw[n.id]={fill:n.fill,stroke:n.stroke,fontSize:n.fontSize,fontFamily:n.fontFamily,gap:n.gap,padding:n.padding}},{resolveInstances:true});
Get(F,(n,c)=>{if(n.enabled===false){c.skipChildren();return}let x=0,y=0,p=c;while(p&&p.depth>0){x+=p.bounds.x;y+=p.bounds.y;p=p.parentCtx}
const seg=n.id.split("/")[0];if(!(seg in refs)){try{refs[seg]=Get(seg,{depth:0}).ref||null}catch(e){refs[seg]=null}}const ref=n.ref||refs[n.id];let refName,segRefName;const nm=r=>{try{return Get(r,{depth:0}).name}catch(e){return undefined}};if(ref)refName=nm(ref);if(refs[seg])segRefName=nm(refs[seg]);
out.push({id:n.id,t:n.type,nm:n.name,p:c.parentCtx?c.parentCtx.node.id:null,d:c.depth,x,y,w:c.bounds.width,h:c.bounds.height,r:raw[n.id],fill:n.fill,fs:n.fontSize,ff:n.fontFamily,fw:n.fontWeight,tx:n.type==="text"?n.content:undefined,op:n.opacity,ref,refName,segRefName,ic:n.iconFontName,cr:n.cornerRadius,prob:c.problems})},{resolveInstances:true,resolveVariables:true});
const V=GetVariables().variables;const res=(v,k)=>{for(let i=0;i<8&&typeof v==="string"&&v.startsWith("$");i++){const d=V[v.slice(1)];if(!d)break;v=Array.isArray(d.value)?(d.value.find(e=>Object.values(e.theme||{}).includes("dark"))||d.value[0]).value:d.value}return v};
const scale=[...new Set(Object.keys(V).filter(k=>/^(type-size|text-|display-)/.test(k)).map(k=>res("$"+k)).filter(v=>typeof v==="number"))].sort((a,b)=>a-b);
Print("FACTS"+JSON.stringify({id:F,name:root.name,w:root.width,h:root.height,theme:root.theme||null,typeScale:scale,nodes:out}))`;
}

export function readFacts(id, opts) {
  const [res] = runPen([factsSnippet(id)], opts);
  const facts = tagged(res.lines, 'FACTS')[0];
  if (!facts) throw new Error(`no facts for ${id}`);
  return facts;
}

/** Top-level PROPOSAL candidates plus a content digest per frame. */
export function listFrames(opts) {
  const snippet = `Get((n,c)=>{if(c.depth>1){c.skipChildren();return}if(n.name)Print("NODE"+JSON.stringify({id:n.id,name:n.name,d:c.depth,w:c.bounds.width,h:c.bounds.height}))})`;
  const [res] = runPen([snippet], opts);
  return tagged(res.lines, 'NODE');
}

export function frameTrees(ids, opts) {
  const snippet = `for(const id of ${JSON.stringify(ids)}){try{Print("TREE"+JSON.stringify(Get(id)))}catch(e){Print("TREE"+JSON.stringify({id,missing:true}))}}`;
  const [res] = runPen([snippet], opts);
  return tagged(res.lines, 'TREE');
}

/**
 * Exports frames to `dir/<id>.png`. Pen exports can race web-font and image
 * loading; callers re-run this after a wait when the render guard reports
 * missing glyphs (see run.mjs renderWithRetry).
 */
/**
 * @param {string[]} ids
 * @param {string} dir
 * @param {{scale?: number, app?: string, inFile?: string, outFile?: string, timeoutMs?: number}} [opts]
 */
export function exportFrames(ids, dir, { scale = 1, ...opts } = {}) {
  mkdirSync(dir, { recursive: true });
  runPen(
    [
      `Export(${JSON.stringify(ids)},"png",${JSON.stringify(dir)},{scale:${Number(scale)}})`,
    ],
    opts
  );
  return ids.map(id => {
    const path = join(dir, `${id}.png`);
    const buf = readFileSync(path);
    return { id, path, buf, md5: createHash('md5').update(buf).digest('hex') };
  });
}

/**
 * Out-of-process render (root fix, 2026-11-01): the desktop app's raster
 * export degrades into a mis-strided readback for frames wider than ~1000px
 * once its GPU state goes bad (identical garbled bytes on every retry; 0.5x
 * stays clean), and a fresh headless renderer does not. So the live frame's
 * current tree (unsaved edits included) is read from the app, grafted into a
 * private snapshot copy of the canonical file, and exported by a fresh
 * headless `pen` process. The snapshot is never saved; the canonical file is
 * only ever read. Each frame is exported twice in that process and the second
 * export is used, so web fonts (Material Symbols, Inter) have loaded.
 */
/**
 * @param {string[]} ids
 * @param {string} dir
 * @param {{scale?: number, snapshot?: string, live?: object, run?: typeof runPen}} [opts]
 */
export function exportFramesHeadless(
  ids,
  dir,
  { scale = 1, snapshot, live = {}, run = runPen } = {}
) {
  mkdirSync(dir, { recursive: true });
  const trees = frameTrees(ids, live).filter(t => !t.missing);
  const source = snapshot ?? CANONICAL_PEN;
  // A hidden sibling of the workspace folder, at the same depth, so asset
  // paths that climb out of the workspace ("../../Codex/…/x.glsl") resolve.
  const work = mkdtempSync(join(dirname(dirname(source)), '.pen-render-'));
  const inFile = join(work, 'snapshot.pen');
  copyFileSync(source, inFile);
  // Fonts and image fills resolve relative to the .pen file: mirror the
  // workspace folder's assets (never its .pen files) next to the snapshot.
  for (const entry of readdirSync(dirname(source)))
    if (!entry.endsWith('.pen') && !entry.startsWith('.'))
      symlinkSync(join(dirname(source), entry), join(work, entry));
  const warm = join(work, 'warm');
  // One execute per step: each execute has a ~55 s budget in headless mode,
  // and a 1348x900 graft plus two exports can exceed it in one call.
  const snippets = trees.flatMap((tree, i) => {
    const { id, x, y, ...body } = tree;
    const v = `__n${i}`;
    return [
      `const has=Get((n,c)=>{if(c.depth>0){c.skipChildren();return}return n.id===${JSON.stringify(id)}||undefined}).length>0;const b=${JSON.stringify(body)};${v}=has?Replace(${JSON.stringify(id)},b):Insert(document,{...b,x:0,y:-200000});Print("MAP"+JSON.stringify([${JSON.stringify(id)},${v}]))`,
      `Export([${v}],"png",${JSON.stringify(warm)},{scale:${Number(scale)}})`,
      `Export([${v}],"png",${JSON.stringify(dir)},{scale:${Number(scale)}})`,
    ];
  });
  try {
    const res = run(snippets, {
      inFile,
      outFile: join(work, 'out.pen'),
      timeoutMs: 300_000,
    });
    const map = Object.fromEntries(res.flatMap(r => tagged(r.lines, 'MAP')));
    return ids.map(id => {
      const src = join(dir, `${map[id]}.png`);
      const path = join(dir, `${id}.png`);
      if (map[id] && map[id] !== id) renameSync(src, path);
      const buf = readFileSync(path);
      return {
        id,
        path,
        buf,
        md5: createHash('md5').update(buf).digest('hex'),
      };
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function renameFrame(id, name, opts) {
  runPen(
    [`Update(${JSON.stringify(id)},{name:${JSON.stringify(name)}})`],
    opts
  );
}

/** Save-guard signature per top-level node: cheap, changes on any edit. */
export const SIGNATURE_SNIPPET = `Get((n,c)=>{if(c.depth>0){c.skipChildren();return}let k=0,h=0;Get(n.id,m=>{k++;const s=JSON.stringify([m.id,m.name,m.x,m.y,m.width,m.height,m.content,m.fill,m.enabled,m.ref]);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0});Print("SIG"+JSON.stringify([n.id,k+":"+h]))})`;

export function signatures(opts) {
  const [res] = runPen([SIGNATURE_SNIPPET], opts);
  return Object.fromEntries(tagged(res.lines, 'SIG'));
}

/** save() on the attached live canvas; returns the persist evidence. */
/** @param {{statFile?: () => {mtimeMs: number, size: number}, spawn?: Function}} [opts] */
export function saveLive({ statFile, spawn = spawnSync } = {}) {
  const before = statFile();
  const res = spawn('pen', ['interactive', '-a', 'desktop'], {
    input: 'save()\nexit()\n',
    encoding: 'utf8',
    timeout: 60_000,
  });
  const after = statFile();
  return {
    saved: /Saved/.test(String(res.stdout)),
    mtimeBefore: before.mtimeMs,
    mtimeAfter: after.mtimeMs,
    sizeBefore: before.size,
    sizeAfter: after.size,
    persisted: after.mtimeMs > before.mtimeMs,
  };
}
