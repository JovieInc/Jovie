/**
 * Instance census for the Pen structural-edit guard. Runs the headless pen CLI
 * on each saved .pen that changed since its last census and writes
 * { components, instances, owners, generatedAt } to the census dir
 * (default ~/.cache/pen-census/<sha1(path)[:10]>.json). A few minutes stale is
 * fine. Mac only (needs the `pen` CLI).
 *
 *   node pen-census.mjs --workspace "$HOME/Documents/Jovie/Jovie Marketing Workspace"
 *   node pen-census.mjs path/to/design.pen [...]
 *   --max-age-days N   skip files not saved in the last N days (keeps the first pass small)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CENSUS_DIR =
  process.env.PEN_CENSUS_DIR || join(homedir(), '.cache', 'pen-census');
export const censusPathFor = (filePath, dir = CENSUS_DIR) =>
  join(
    dir,
    `${createHash('sha1').update(filePath).digest('hex').slice(0, 10)}.json`
  );

const SNIPPET = `const comps={};const owner={};const refs={};const walk=(n,root)=>{owner[n.id]=root;if(n.children)for(const k of n.children)walk(k,root)};
Get((n,c)=>{if(n.reusable){let g;try{g=Get(n.id,{depth:50})}catch(e){g=n}comps[n.id]=n.name||"";walk(g,n.id)}});
Get((n,c)=>{if(n.type==="ref"&&n.ref){refs[n.ref]=(refs[n.ref]||0)+1}});
Print("CENSUS|"+JSON.stringify({components:comps,instances:refs,owners:owner}));`;

/** Pull the census JSON out of the CLI transcript; owners is kept only for components with instances. */
export function parseCensus(transcript) {
  const m = transcript.match(/CENSUS\|(\{.*\})/u);
  if (!m) throw new Error('no CENSUS line in pen output');
  const raw = JSON.parse(m[1]);
  const owners = {};
  for (const [id, owner] of Object.entries(raw.owners))
    if ((raw.instances[owner] ?? 0) > 0) owners[id] = owner;
  return { components: raw.components, instances: raw.instances, owners };
}

export function buildCommand() {
  return `execute(${JSON.stringify({ input: SNIPPET })})\nexit()\n`;
}

export function censusOne(file, dir = CENSUS_DIR) {
  const target = censusPathFor(file, dir);
  const mtime = statSync(file).mtimeMs;
  if (
    existsSync(target) &&
    JSON.parse(readFileSync(target, 'utf8')).sourceMtimeMs >= mtime
  )
    return { file, skipped: true };
  const work = mkdtempSync(join(tmpdir(), 'pen-census-'));
  try {
    copyFileSync(file, join(work, 'in.pen'));
    const run = spawnSync(
      'pen',
      ['interactive', '-i', join(work, 'in.pen'), '-o', join(work, 'out.pen')],
      {
        input: buildCommand(),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        timeout: 900_000,
        env: {
          ...process.env,
          NODE_OPTIONS: '--network-family-autoselection-attempt-timeout=2000',
        },
      }
    );
    const census = parseCensus(`${run.stdout}\n${run.stderr}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      target,
      `${JSON.stringify({ file, sourceMtimeMs: mtime, generatedAt: Date.now(), ...census })}\n`
    );
    return { file, components: Object.keys(census.components).length };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let files = args.filter(a => a.endsWith('.pen'));
  const w = args.indexOf('--workspace');
  if (w >= 0)
    files = files.concat(
      readdirSync(args[w + 1])
        .filter(f => f.endsWith('.pen'))
        .map(f => join(args[w + 1], f))
    );
  const maxAge = args.indexOf('--max-age-days');
  if (maxAge >= 0) {
    const cutoff = Date.now() - Number(args[maxAge + 1]) * 86_400_000;
    files = files.filter(f => statSync(f).mtimeMs >= cutoff);
  }
  for (const file of files) {
    try {
      process.stdout.write(`${JSON.stringify(censusOne(file))}\n`);
    } catch (error) {
      process.stderr.write(`pen-census: ${file}: ${error.message}\n`);
    }
  }
}
