#!/usr/bin/env tsx
/**
 * copy-gate CLI.
 *
 *   tsx packages/copy/cli.ts check [--diff-base <ref>] [files...]
 *       Lint customer-facing copy. With --diff-base only added lines are
 *       judged (legacy debt stays advisory). Exit 1 on any block finding.
 *   tsx packages/copy/cli.ts judge --tier <tier> --register <register> <file> [--facts facts.txt]
 *       Full gate (lint + judge panel). Needs AI_GATEWAY_API_KEY (use the Doppler wrapper).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CopyTier,
  gateCopy,
  gatewayTransport,
  type JudgeTransport,
} from './judge';
import { lintCopy } from './lint';
import type { CopyRegister } from './rules';

// Customer-facing paths and the register their text speaks in. Unlisted paths
// (internal docs, code, legal) are not copy-gated.
const PATH_REGISTERS: readonly [RegExp, CopyRegister][] = [
  [/^apps\/web\/content\//, 'jovie-marketing'],
  [/^apps\/web\/data\/support\w*Copy\.ts$/, 'jovie-product-ui'],
  [/^apps\/web\/data\/\w*Copy\.ts$/, 'jovie-marketing'],
  [/^apps\/web\/lib\/email\/templates\//, 'jovie-transactional'],
  [/^apps\/web\/lib\/chat\/onboarding-script\//, 'jovie-persona'],
];
const EXCLUDED = [/^apps\/web\/content\/legal\//, /\.test\.tsx?$/];

export function registerFor(path: string): CopyRegister | undefined {
  if (EXCLUDED.some(pattern => pattern.test(path))) return undefined;
  return PATH_REGISTERS.find(([pattern]) => pattern.test(path))?.[1];
}

const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const JSX_TEXT = />([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g;

/** Human-readable text in one source line. ponytail: single-line strings only; multi-line template literals are skipped. */
export function extractCopy(line: string, path: string): string[] {
  if (/\.(md|mdx|txt)$/.test(path)) {
    const text = line.replace(/^\s*(?:#+|[-*>]|\d+\.)\s*/, '').trim();
    return /^(?:import|export|---|```|<\/?[A-Z])/.test(text) ||
      !/[A-Za-z]{2}/.test(text)
      ? []
      : [text];
  }
  const found: string[] = [];
  for (const match of line.matchAll(STRING_LITERAL)) found.push(match[2] ?? '');
  if (path.endsWith('.tsx'))
    for (const match of line.matchAll(JSX_TEXT)) found.push(match[1] ?? '');
  return found
    .map(text => text.trim())
    .filter(text => {
      const tokens = text.split(/\s+/);
      if (tokens.length < 2 || !/[A-Za-z]{2}/.test(text)) return false;
      // Class lists, paths, and identifiers are not copy.
      const codeLike =
        tokens.every(token => /^[a-z0-9:[\]/._#-]+$/.test(token)) &&
        /[-:/]/.test(text);
      return !codeLike && !/^(?:https?:|\/|@\/|\.\.?\/)/.test(text);
    });
}

function addedLines(path: string, base: string): Set<number> {
  const diff = execFileSync(
    'git',
    ['diff', '-U0', `${base}...HEAD`, '--', path],
    { encoding: 'utf8' }
  );
  const lines = new Set<number>();
  for (const [, start, count] of diff.matchAll(
    /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm
  )) {
    for (let offset = 0; offset < Number(count ?? 1); offset++)
      lines.add(Number(start) + offset);
  }
  return lines;
}

function check(args: string[]): number {
  const baseIndex = args.indexOf('--diff-base');
  const base = baseIndex >= 0 ? args.splice(baseIndex, 2)[1] : undefined;
  let blocked = 0;
  for (const path of args) {
    const register = registerFor(path);
    if (!register) continue;
    const only = base ? addedLines(path, base) : undefined;
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (only && !only.has(index + 1)) return;
        for (const text of extractCopy(line, path)) {
          for (const finding of lintCopy(text, { register }).blocking) {
            blocked++;
            console.log(
              `${path}:${index + 1} [${register}] ${finding.rule}: "${finding.match}" ${finding.message}`
            );
          }
        }
      });
  }
  console.log(
    blocked
      ? `copy-gate: ${blocked} blocking finding(s). See canon/VOICE.md.`
      : 'copy-gate: clean'
  );
  return blocked ? 1 : 0;
}

// Subscription CLIs carry frontier judges; the gateway carries allowlisted ones.
// Codex now ships inside ChatGPT.app; env overrides win, then the bundled CLI, then PATH.
const BUNDLED_CODEX =
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const CODEX_BIN =
  process.env.CODEX_BIN ??
  process.env.HERMES_CODEX_BIN ??
  (existsSync(BUNDLED_CODEX) ? BUNDLED_CODEX : 'codex');
const probe = new Map<string, boolean>();
function installed(bin: string): boolean {
  if (!probe.has(bin)) {
    probe.set(
      bin,
      spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15_000 })
        .status === 0
    );
  }
  return probe.get(bin) ?? false;
}

// Judges run from a neutral temp dir so repo-level agent hooks never fire.
function runCli(
  bin: string,
  args: string[],
  input: string,
  cwd = tmpdir()
): string {
  const result = spawnSync(bin, args, {
    input,
    cwd,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 8 << 20,
  });
  if (result.status !== 0)
    throw new Error(
      `${bin} exited ${result.status}: ${(result.stderr ?? '').slice(0, 160)}`
    );
  return result.stdout;
}

/** anthropic/* -> Claude Code CLI, openai/* -> Codex CLI, zai/* -> AI Gateway. */
export function routedTransport(apiKey?: string): JudgeTransport {
  const gateway = apiKey ? gatewayTransport(apiKey) : undefined;
  const send: JudgeTransport = async request => {
    const [family, name = ''] = request.model.split('/');
    const input = `${request.system}\n\n${request.prompt}`;
    if (family === 'anthropic') {
      // Claude CLI model ids use dashes: claude-opus-5.5 -> claude-opus-5-5.
      return runCli(
        'claude',
        [
          '-p',
          '--model',
          name.replace(/\./g, '-'),
          '--output-format',
          'text',
          '--no-session-persistence',
          '--disallowedTools',
          'Bash,Edit,Write,Read,WebFetch,WebSearch',
        ],
        input
      );
    }
    if (family === 'openai') {
      const dir = mkdtempSync(join(tmpdir(), 'copy-judge-'));
      try {
        runCli(
          CODEX_BIN,
          [
            'exec',
            // User/repo hooks (e.g. a Stop hook) hang non-interactive exec.
            '-c',
            'features.hooks=false',
            '-c',
            'features.codex_hooks=false',
            '--skip-git-repo-check',
            '--sandbox',
            'read-only',
            '-m',
            name,
            '-o',
            join(dir, 'out.txt'),
            '-',
          ],
          input,
          dir
        );
        return readFileSync(join(dir, 'out.txt'), 'utf8');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (!gateway) throw new Error('AI_GATEWAY_API_KEY missing');
    return gateway(request);
  };
  send.available = model => {
    const family = model.split('/')[0];
    if (family === 'anthropic') return installed('claude');
    if (family === 'openai') return installed(CODEX_BIN);
    return gateway?.available?.(model) ?? false;
  };
  return send;
}

async function judge(args: string[]): Promise<number> {
  const flag = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args.splice(index, 2)[1] : undefined;
  };
  const tier = (flag('--tier') ?? 'standard') as CopyTier;
  const register = (flag('--register') ?? 'jovie-marketing') as CopyRegister;
  const factsFile = flag('--facts');
  const audience = flag('--audience') ?? 'the page reader';
  const goal = flag('--goal') ?? 'take the next step';
  const generatorModel = flag('--generator');
  // Positional file only after every flag is consumed.
  const file = args[0];
  if (!file) throw new Error('judge needs a file');
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const result = await gateCopy(
    readFileSync(file, 'utf8'),
    {
      register,
      tier,
      audience,
      goal,
      facts: factsFile
        ? readFileSync(factsFile, 'utf8').split('\n').filter(Boolean)
        : [],
      generatorModel,
    },
    routedTransport(apiKey)
  );
  console.log(JSON.stringify(result, null, 2));
  return result.status === 'pass' ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
if (process.argv[1]?.endsWith('cli.ts')) {
  const run = {
    check: async () => check(rest),
    judge: () => judge(rest),
  }[command ?? ''];
  if (!run) {
    console.error('usage: cli.ts check|judge ... (landing: pnpm copy:landing)');
    process.exit(2);
  }
  run().then(code => process.exit(code));
}
