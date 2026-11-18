import { check, sha } from './native-typecheck-buildinfo.mjs';

export { check, sha } from './native-typecheck-buildinfo.mjs';

import { assertGraphParity } from './native-typecheck-graph.mjs';

export { readGraph } from './native-typecheck-graph.mjs';

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';

const TOOL_CONFIG = '.github/ci-harness/typecheck-native-tools';
export const PROGRAMS = Object.freeze({
  web: 'apps/web/tsconfig.typecheck.json',
  ui: 'packages/ui/tsconfig.json',
});
export const PINS = Object.freeze({
  ts6: { name: 'typescript', version: '6.0.3', executable: 'bin/tsc' },
  tsrs: {
    name: '@tsrs/linux-x64-gnu',
    version: '0.25.0-ts7.1.0-beta',
    executable: 'tsrs',
  },
  upstream: {
    name: '@typescript/typescript-linux-x64',
    version: '7.1.0-beta',
    executable: 'lib/tsc',
  },
});
export const LEAF = 'apps/web/lib/hud/number-series.ts';
export const WIDE = 'packages/ui/lib/utils.ts';
const SEEDS = Object.freeze({
  [LEAF]: [
    ['export const __nativeQualificationString: string = 42;', 'TS2322'],
    ['export const __nativeQualificationNull: string = null;', 'TS2322'],
    ['type __NativeQualificationString<T extends string> = T;', null],
    [
      'export type __NativeQualificationGeneric = __NativeQualificationString<number>;',
      'TS2344',
    ],
    [
      'export const __nativeQualificationSatisfies = { id: 42 } satisfies { id: string };',
      'TS2322',
    ],
    [
      'function __nativeQualificationConst<const T extends readonly string[]>(value: T): T { return value; }',
      null,
    ],
    [
      "export const __nativeQualificationTuple: readonly ['expected'] = __nativeQualificationConst(['wrong']);",
      'TS2322',
    ],
  ],
  [WIDE]: [
    ['export const __nativeQualificationShared: string = 42;', 'TS2322'],
  ],
  'apps/web/lib/design/generated/design-tokens.ts': [
    ['export const __nativeQualificationGenerated: string = 42;', 'TS2322'],
  ],
  'packages/extension-contracts/index.ts': [
    ["export const __nativeQualificationCross = 'wrong' as const;", null],
  ],
  'apps/web/lib/extensions/summary.ts': [
    [
      "import { __nativeQualificationCross } from '@jovie/extension-contracts';",
      null,
    ],
    [
      'const __nativeQualificationCrossConsumer: number = __nativeQualificationCross;',
      'TS2322',
    ],
    [
      "import { __nativeQualificationMissingExport } from '@/lib/hud/number-series';",
      'TS2724',
    ],
    [
      'export const __nativeQualificationMissingConsumer = __nativeQualificationMissingExport;',
      null,
    ],
  ],
});

export const json = value => `${JSON.stringify(value, null, 2)}\n`;
export const same = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);
export const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json(value));
};
const normalizedPath = (path, root) =>
  relative(root, resolve(root, path.replaceAll('\\', '/')))
    .split(sep)
    .join('/');

export function parseArgs(args) {
  if (!args.length || same(args, ['--help'])) return null;
  check(
    args.length === 5 &&
      args[0] === '--run' &&
      args[1] === '--tools' &&
      args[3] === '--output' &&
      !args[2].startsWith('--') &&
      !args[4].startsWith('--'),
    'Unexpected or Missing arguments; required: --run --tools PATH --output PATH'
  );
  return { tools: resolve(args[2]), output: resolve(args[4]) };
}

export function cpuAllocation(status) {
  const allowed = status.match(/^Cpus_allowed_list:\s*(.*)$/mu)?.[1];
  check(
    allowed && /^[\d,-]+$/u.test(allowed),
    'Cannot determine allowed CPU affinity'
  );
  const selected = allowed
    .split(',')
    .flatMap(part => {
      const [first, last = first] = part.split('-').map(Number);
      check(
        last >= first && last - first < 65_536,
        'Invalid CPU affinity range'
      );
      return Array.from(
        { length: last - first + 1 },
        (_, index) => first + index
      );
    })
    .slice(0, 2);
  check(selected.length === 2, 'Qualification requires two available CPUs');
  return { parentAllowed: allowed, selected: selected.join(','), count: 2 };
}

export function assertPrime(cache, expected) {
  check(
    existsSync(cache) && sha(readFileSync(cache)) === expected,
    'Cache prime mismatch'
  );
}

export function parseDiagnostics(output, root) {
  const diagnostics = [];
  for (const line of output.replace(/\u001b\[[0-9;]*m/gu, '').split(/\r?\n/u)) {
    const located =
      /^(.*?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/u.exec(line);
    const global = /^(error|warning)\s+(TS\d+):\s*(.*)$/u.exec(line);
    if (located)
      diagnostics.push({
        path: normalizedPath(located[1], root),
        line: Number(located[2]),
        column: Number(located[3]),
        severity: located[4],
        code: located[5],
        message: located[6],
      });
    else if (global)
      diagnostics.push({
        path: null,
        line: null,
        column: null,
        severity: global[1],
        code: global[2],
        message: global[3],
      });
    else if (diagnostics.length && /^\s{2,}\S/u.test(line))
      diagnostics.at(-1).message += `\n${line.trim()}`;
  }
  return diagnostics.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
}

export function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

export function inventory(root) {
  const files = git(root, ['ls-files', '-z'])
    .split('\0')
    .filter(
      file => /\.(?:[cm]?[jt]sx?|json|ya?ml)$/u.test(file) || file === '.nvmrc'
    );
  return files
    .sort()
    .map(path => ({ path, sha256: sha(readFileSync(resolve(root, path))) }));
}

function hashTree(directory) {
  const entries = [];
  const visit = path => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, item.name);
      if (item.isDirectory()) visit(child);
      else if (item.isFile())
        entries.push([relative(directory, child), sha(readFileSync(child))]);
    }
  };
  visit(directory);
  return sha(json(entries.sort(([a], [b]) => a.localeCompare(b))));
}

export function inspectTools(root, tools) {
  const lock = readFileSync(resolve(root, TOOL_CONFIG, 'pnpm-lock.yaml'));
  check(
    lock.equals(readFileSync(resolve(tools, 'pnpm-lock.yaml'))),
    'Installed tool lock differs from checked-in pin lock'
  );
  check(
    readFileSync(resolve(root, TOOL_CONFIG, 'package.json')).equals(
      readFileSync(resolve(tools, 'package.json'))
    ),
    'Installed tool manifest differs'
  );
  const result = {};
  for (const [alias, pin] of Object.entries(PINS)) {
    const directory = realpathSync(resolve(tools, 'node_modules', alias));
    check(
      directory.startsWith(`${realpathSync(tools)}${sep}`),
      `Tool escapes isolated directory: ${alias}`
    );
    const metadata = JSON.parse(
      readFileSync(resolve(directory, 'package.json'), 'utf8')
    );
    check(
      metadata.name === pin.name &&
        metadata.version === pin.version &&
        !['preinstall', 'install', 'postinstall', 'prepare'].some(
          name => metadata.scripts?.[name]
        ),
      `Unexpected compiler pin or install scripts: ${alias}`
    );
    const executable = resolve(directory, pin.executable);
    check(existsSync(executable), `Missing compiler: ${alias}`);
    result[alias] = {
      ...pin,
      executable,
      libraries:
        alias === 'ts6' ? resolve(directory, 'lib') : dirname(executable),
      packageTreeSha256: hashTree(directory),
    };
  }
  return { lockSha256: sha(lock), packages: result };
}

function configurationOptions(compiler, config) {
  const parsed = compiler.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...compiler.sys,
      onUnRecoverableConfigFileDiagnostic: () => {
        throw new Error('Invalid compiler configuration');
      },
    }
  );
  check(parsed && !parsed.errors.length, 'Invalid compiler configuration');
  return parsed.options;
}

export function effectiveTypeRoots(config, tools, compiler = null) {
  const ts6 =
    compiler ??
    createRequire(import.meta.url)(
      resolve(tools, 'node_modules/ts6/lib/typescript.js')
    );
  return ts6
    .getEffectiveTypeRoots(configurationOptions(ts6, config), ts6.sys)
    .map(path => resolve(path));
}

export function seedPlan(root, program) {
  return Object.fromEntries(
    Object.entries(SEEDS)
      .filter(([path]) => program === 'web' || path === WIDE)
      .map(([path, lines]) => {
        const firstLine =
          readFileSync(resolve(root, path), 'utf8').split('\n').length + 1;
        return [
          path,
          {
            suffix: `\n${lines.map(([text]) => text).join('\n')}\n`,
            expected: lines.flatMap(([, code], index) =>
              code ? [{ path, line: firstLine + index, code }] : []
            ),
          },
        ];
      })
  );
}

/**
 * @template Result
 * @param {string} root
 * @param {Record<string, string>} changes
 * @param {() => Result | Promise<Result>} run
 * @returns {Promise<Result>}
 */
export async function withMutation(root, changes, run) {
  /** @type {[string, Buffer][]} */
  const originals = Object.keys(changes).map(path => [
    path,
    readFileSync(resolve(root, path)),
  ]);
  try {
    for (const [path, bytes] of originals)
      writeFileSync(
        resolve(root, path),
        Buffer.concat([bytes, Buffer.from(changes[path])])
      );
    return await run();
  } finally {
    for (const [path, bytes] of originals) {
      writeFileSync(resolve(root, path), bytes);
      check(
        bytes.equals(readFileSync(resolve(root, path))),
        `Source restoration failed: ${path}`
      );
    }
  }
}

export function assertEquivalent(
  result,
  expected,
  label,
  { deadline = Infinity, diagnostics = true } = {}
) {
  if (diagnostics)
    check(
      same(result.diagnostics, expected.diagnostics),
      `${label}: diagnostic parity failed`
    );
  result.contextProof = assertGraphParity(result.graph, expected.graph, {
    deadline,
    configuration: () => {
      const compiler = createRequire(import.meta.url)(
        resolve(
          result.graph.metadata.toolsDirectory,
          'node_modules/ts6/lib/typescript.js'
        )
      );
      const config = result.argv[result.argv.indexOf('--project') + 1];
      return { compiler, options: configurationOptions(compiler, config) };
    },
  });
}

export function assertSeeds(result, expected) {
  check(expected.length > 0, 'No seeded error assertions');
  for (const seed of expected)
    check(
      result.diagnostics.some(diagnostic =>
        Object.entries(seed).every(([key, value]) => diagnostic[key] === value)
      ),
      `Seed missed: ${seed.path}:${seed.line} ${seed.code}`
    );
}

export function assertCompleted(result) {
  check(
    !result.timedOut && [0, 1, 2].includes(result.exitCode),
    'Incomplete checker invocation'
  );
  check(
    result.exitCode === 0 || result.diagnostics.length > 0,
    'Failed without complete diagnostics'
  );
  check(
    !/panic:|fatal error:|fatal runtime|SIGSEGV|segmentation fault|thread .*panicked|out of memory|core dumped/iu.test(
      result.output
    ),
    'Compiler crash'
  );
  check(
    !result.diagnostics.some(
      item =>
        item.path === null ||
        /tsconfig.*\.json$/u.test(item.path) ||
        /^TS(?:50|51|63)\d{2}$/u.test(item.code)
    ),
    'Unsupported configuration or program'
  );
  check(
    !(
      result.exitCode === 0 &&
      result.diagnostics.some(item => item.severity === 'error')
    ),
    'Error diagnostic with success exit'
  );
}

export async function writeStageMetrics(root, output, events) {
  const { computeStageTimings, validateStageEvent } = await import(
    './stage-events.mjs'
  );
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'docs/metrics/stage-manifest.json'), 'utf8')
  );
  check(
    events.flatMap(event => validateStageEvent(event, manifest)).length === 0,
    'Unregistered qualification telemetry'
  );
  save(
    resolve(output, 'stage-timings-latest.json'),
    computeStageTimings(events, manifest, { now: events.at(-1).exitedAt })
  );
}
