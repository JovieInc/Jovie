import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = 'scripts/run-affected-tests.mjs';
// Existing sparse-checkout closure names this module-initialization JSON input.
export const MODULE_INIT_FILES = {
  'scripts/invariants/scanned-paths.mjs': [
    'scripts/invariants/latency-sensitive-execution-allowlist.json',
  ],
  // Read at ci-fast-lanes.mjs module load (lanes coverage floors, Move 3).
  'scripts/lib/ci-structural-shards.mjs': [
    '.github/ci-harness/lanes-coverage-floors.txt',
  ],
};

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const PATH = /^[A-Za-z0-9_.\/-]+$/u;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const AST_PARSER = [
  "const {parse}=require('node:internal/deps/acorn/acorn/dist/acorn');",
  "const {readFileSync}=require('node:fs');",
  "const ast=parse(readFileSync(0,'utf8'),{ecmaVersion:'latest',sourceType:'module'});",
  "function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))for(const child of value)walk(child,visit);else if(value&&typeof value==='object')walk(value,visit);}}",
];
const PARSER = [
  ...AST_PARSER,
  "const aliases=new Set(['require']);const dependencies=[];",
  "walk(ast,node=>{if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init?.type==='CallExpression'&&node.init.callee.type==='Identifier'&&node.init.callee.name==='createRequire')aliases.add(node.id.name);});",
  "function literal(node){if(node?.type!=='Literal'||typeof node.value!=='string')throw Error('Unsupported computed BASE dependency');return node.value;}",
  "walk(ast,node=>{if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)dependencies.push(literal(node.source));else if(node.type==='ImportExpression')dependencies.push(literal(node.source));else if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&aliases.has(node.callee.name)){if(node.arguments.length!==1)throw Error('Unsupported BASE require arguments');const value=literal(node.arguments[0]);if(value.startsWith('.'))dependencies.push(value);}});",
  'process.stdout.write(JSON.stringify(dependencies));',
].join('\n');

/** Parse actual executable wiring with the same pinned native parser as BASE imports. */
export function plannerContractGroupIsWired(source) {
  const program = [
    ...AST_PARSER,
    "const binding=ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value==='./lib/test-planner-contract-tests.mjs').flatMap(n=>n.specifiers).find(n=>n.type==='ImportSpecifier'&&n.imported.name==='TEST_PLANNER_CONTRACT_TESTS')?.local.name;",
    "const declaration=ast.body.filter(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.type==='VariableDeclaration').flatMap(n=>n.declaration.declarations).find(n=>n.id.type==='Identifier'&&n.id.name==='SCRIPT_CONTRACT_NODE_TESTS')?.init;",
    "const array=declaration?.type==='CallExpression'&&declaration.callee.type==='MemberExpression'&&!declaration.callee.computed&&declaration.callee.object.name==='Object'&&declaration.callee.property.name==='freeze'&&declaration.arguments.length===1?declaration.arguments[0]:null;",
    "process.stdout.write(JSON.stringify(Boolean(binding&&array?.type==='ArrayExpression'&&array.elements.some(n=>n?.type==='SpreadElement'&&n.argument.type==='Identifier'&&n.argument.name===binding))));",
  ].join('\n');
  const parsed = spawnSync(
    process.execPath,
    ['--expose-internals', '-e', program],
    {
      input: source,
      encoding: 'utf8',
    }
  );
  if (parsed.status !== 0)
    throw new Error('Cannot parse CI planner wiring: ' + parsed.stderr);
  return JSON.parse(parsed.stdout);
}

function safePath(file) {
  if (
    !PATH.test(file) ||
    isAbsolute(file) ||
    file.split('/').some(p => p === '..' || p === '.')
  ) {
    throw new Error('Unsafe trusted planner path: ' + file);
  }
  return file;
}

function readBlob(repo, base, file) {
  safePath(file);
  const args = ['--no-replace-objects', '--literal-pathspecs'];
  const row = execFileSync(
    'git',
    [...args, 'ls-tree', '-z', base, '--', file],
    { cwd: repo, encoding: 'utf8' }
  );
  const match = row.match(/^(\d+) blob ([a-f0-9]+)\t([^\0]+)\0$/u);
  if (!match || match[3] !== file || !['100644', '100755'].includes(match[1])) {
    throw new Error(
      'Required BASE dependency missing or not a regular blob: ' + file
    );
  }
  return execFileSync('git', [...args, 'cat-file', 'blob', match[2]], {
    cwd: repo,
  });
}

/** Snapshot existing planner imports from immutable Git blobs, never the candidate. */
export function snapshotTrustedTestPlanner({ repo, base, out }) {
  const started = Date.now();
  if (!SHA.test(base) || !isAbsolute(out))
    throw new Error('Exact BASE SHA and absolute output required');
  const actual = execFileSync(
    'git',
    ['--no-replace-objects', 'rev-parse', '--verify', base + '^{commit}'],
    { cwd: repo, encoding: 'utf8' }
  ).trim();
  if (actual !== base) throw new Error('BASE identity mismatch');
  const pending = [ENTRY];
  const blobs = new Map();
  const parserDiagnostics = [];
  while (pending.length) {
    const file = pending.pop();
    if (blobs.has(file)) continue;
    const bytes = readBlob(repo, base, file);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    blobs.set(file, bytes);
    pending.push(...(MODULE_INIT_FILES[file] ?? []));
    if (file === 'scripts/invariants/scanned-paths.mjs') {
      const optionalInput = execFileSync(
        'git',
        [
          '--no-replace-objects',
          '--literal-pathspecs',
          'ls-tree',
          '-z',
          base,
          '--',
          'LESSONS.guards.json',
        ],
        { cwd: repo }
      );
      if (!optionalInput.length)
        throw new Error(
          'Optional BASE feedback-guard input absent; refusing candidate fallback: LESSONS.guards.json'
        );
      pending.push('LESSONS.guards.json');
    }
    if (file.endsWith('.json')) {
      JSON.parse(source);
      continue;
    }
    // Module-initialization data files (e.g. the lanes coverage floors table)
    // are carried as opaque bytes: included in the closure, never parsed.
    if (file.endsWith('.txt')) {
      continue;
    }
    if (!file.endsWith('.mjs'))
      throw new Error('Unsupported BASE module type: ' + file);
    const parsed = spawnSync(
      process.execPath,
      ['--expose-internals', '-e', PARSER],
      { input: source, encoding: 'utf8' }
    );
    if (parsed.status !== 0)
      throw new Error(
        'Cannot parse BASE module ' + file + ': ' + parsed.stderr
      );
    if (parsed.stderr) parserDiagnostics.push({ file, stderr: parsed.stderr });
    // Parse only with Acorn bundled in this pinned Node runtime. Never load a
    // parser or dependency from the candidate workspace, and never evaluate it.
    for (const specifier of JSON.parse(parsed.stdout)) {
      if (isBuiltin(specifier)) continue;
      if (!specifier.startsWith('.'))
        throw new Error('Unsupported external BASE dependency: ' + specifier);
      const dependency = safePath(
        posix.normalize(posix.join(posix.dirname(file), specifier))
      );
      if (!blobs.has(dependency)) pending.push(dependency);
    }
  }
  // Exclusive generation: validate the entire closure before creating any payload.
  mkdirSync(out);
  const files = [...blobs]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, bytes]) => {
      const target = join(out, 'files', file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { mode: 0o444, flag: 'wx' });
      return { path: file, sha256: digest(bytes) };
    });
  const manifest = {
    schema: 'jovie.trusted-test-planner/v1',
    base,
    entry: ENTRY,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    files,
    parserDiagnostics,
  };
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { mode: 0o444, flag: 'wx' }
  );
  return manifest;
}

export function verifyTrustedTestPlanner(out, base) {
  if (!SHA.test(base) || !isAbsolute(out))
    throw new Error('Exact BASE SHA and absolute output required');
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  if (
    manifest.schema !== 'jovie.trusted-test-planner/v1' ||
    manifest.base !== base ||
    manifest.entry !== ENTRY ||
    !manifest.files?.some(file => file.path === ENTRY)
  ) {
    throw new Error('Trusted planner manifest identity mismatch');
  }
  for (const file of manifest.files) {
    safePath(file.path);
    const target = join(out, 'files', file.path);
    if (
      !lstatSync(target).isFile() ||
      digest(readFileSync(target)) !== file.sha256
    ) {
      throw new Error('Trusted planner snapshot changed: ' + file.path);
    }
  }
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const base = args[args.indexOf('--base') + 1];
    const out = args[args.indexOf('--out') + 1];
    const result = args.includes('--verify')
      ? verifyTrustedTestPlanner(out, base)
      : snapshotTrustedTestPlanner({ repo: process.cwd(), base, out });
    process.stdout.write(
      JSON.stringify({
        base: result.base,
        files: result.files.length,
        verified: args.includes('--verify'),
      }) + '\n'
    );
  } catch (error) {
    process.stderr.write(String(error) + '\n');
    process.exitCode = 1;
  }
}
