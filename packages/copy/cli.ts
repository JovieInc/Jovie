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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { type CopyTier, gateCopy } from './judge';
import { lintCopy } from './lint';
import type { CopyRegister } from './rules';
import { routedTransport } from './transport';

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
