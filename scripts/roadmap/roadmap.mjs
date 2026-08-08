#!/usr/bin/env node

/**
 * /roadmap CLI — Linear ops for AgentOS (JOV-1932).
 *
 *   pnpm roadmap <command> [args] [flags]
 *   node scripts/roadmap/roadmap.mjs <command> ...
 *
 * Each subcommand is an isolated pure-ish module under commands/.
 */

import { runAdd } from './commands/add.mjs';
import { runAgentBrief } from './commands/agent-brief.mjs';
import { runApproved } from './commands/approved.mjs';
import { runExpand } from './commands/expand.mjs';
import { runSync } from './commands/sync.mjs';
import { runToday } from './commands/today.mjs';
import { createLinearClient } from './linear-client.mjs';
import { formatHelp, parseRoadmapArgs } from './parse-args.mjs';

/**
 * Programmatic entry for tests.
 * @param {readonly string[]} argv
 * @param {{
 *   client?: ReturnType<typeof createLinearClient>,
 *   cwd?: string,
 *   stdout?: (s: string) => void,
 *   stderr?: (s: string) => void,
 * }} [deps]
 * @returns {Promise<{ exitCode: number, result?: any }>}
 */
export async function runRoadmap(argv, deps = {}) {
  const stdout = deps.stdout ?? (s => process.stdout.write(`${s}\n`));
  const stderr = deps.stderr ?? (s => process.stderr.write(`${s}\n`));

  const parsed = parseRoadmapArgs(argv);
  if (parsed.ok === false) {
    stderr(parsed.error);
    stderr(formatHelp());
    return { exitCode: 2 };
  }

  if (parsed.command === 'help' || parsed.flags.help === true) {
    stdout(formatHelp());
    return { exitCode: 0 };
  }

  const needsLinear = new Set(['add', 'expand', 'sync', 'agent-brief']);
  // today/approved work offline from backlog.json; agent-brief prefers live
  // Linear when available but can run offline.
  let client = deps.client ?? null;
  if (!client && needsLinear.has(parsed.command)) {
    try {
      client = createLinearClient();
    } catch (err) {
      // agent-brief can degrade to backlog-only
      if (parsed.command !== 'agent-brief') {
        stderr(err instanceof Error ? err.message : String(err));
        return { exitCode: 1 };
      }
    }
  }

  const common = {
    client,
    positionals: parsed.positionals,
    flags: parsed.flags,
    cwd: deps.cwd ?? process.cwd(),
  };

  try {
    /** @type {any} */
    let result;
    switch (parsed.command) {
      case 'add':
        result = await runAdd(common);
        break;
      case 'expand':
        result = await runExpand(common);
        break;
      case 'sync':
        result = await runSync(common);
        break;
      case 'today':
        result = await runToday(common);
        break;
      case 'approved':
        result = await runApproved(common);
        break;
      case 'agent-brief':
        result = await runAgentBrief(common);
        break;
      default:
        stderr(`Unhandled command: ${parsed.command}`);
        return { exitCode: 2 };
    }

    const asJson =
      parsed.flags.json === true ||
      parsed.command === 'agent-brief' ||
      parsed.command === 'sync' ||
      parsed.command === 'add' ||
      parsed.command === 'expand' ||
      parsed.command === 'today' ||
      parsed.command === 'approved';

    if (result?.ok === false) {
      if (asJson) {
        stdout(JSON.stringify(result, null, 2));
      } else {
        stderr(result.error ?? 'Command failed');
      }
      // sync --check with drift uses ok:false path below via exit code
      return { exitCode: 1, result };
    }

    if (
      parsed.command === 'sync' &&
      parsed.flags.check === true &&
      result?.drifted
    ) {
      stdout(JSON.stringify(result, null, 2));
      return { exitCode: 1, result };
    }

    if (asJson) {
      stdout(JSON.stringify(result, null, 2));
    } else if (parsed.command === 'today' || parsed.command === 'approved') {
      for (const issue of result.issues ?? []) {
        stdout(
          [
            issue.id,
            issue.state ?? '',
            `p${issue.priority ?? 0}`,
            issue.title,
          ].join('\t')
        );
      }
    } else {
      stdout(JSON.stringify(result, null, 2));
    }

    return { exitCode: 0, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr(message);
    return { exitCode: 1, result: { ok: false, error: message } };
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('/roadmap.mjs') ||
    process.argv[1].endsWith('\\roadmap.mjs') ||
    process.argv[1].endsWith('/roadmap') ||
    process.argv[1].includes('scripts/roadmap/roadmap'));

if (isMain) {
  const { exitCode } = await runRoadmap(process.argv.slice(2));
  process.exit(exitCode);
}
