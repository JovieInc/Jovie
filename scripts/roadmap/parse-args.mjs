/**
 * Pure argv parser for `/roadmap`. No I/O — fully unit-testable.
 *
 * Usage shapes:
 *   roadmap <command> [args...] [--flag value] [--bool]
 *   roadmap --help
 */

/** @typedef {'add'|'expand'|'sync'|'today'|'approved'|'agent-brief'|'help'} RoadmapCommand */

const COMMANDS = new Set([
  'add',
  'expand',
  'sync',
  'today',
  'approved',
  'agent-brief',
  'help',
]);

/**
 * @param {readonly string[]} argv  process.argv slice after node + script
 * @returns {{
 *   ok: true,
 *   command: RoadmapCommand,
 *   positionals: string[],
 *   flags: Record<string, string|boolean>,
 * } | {
 *   ok: false,
 *   error: string,
 *   command?: string,
 * }}
 */
export function parseRoadmapArgs(argv) {
  const args = [...argv];
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { ok: true, command: 'help', positionals: [], flags: {} };
  }

  const command = args[0];
  if (!COMMANDS.has(command)) {
    return {
      ok: false,
      error: `Unknown command "${command}". Expected one of: ${[...COMMANDS].filter(c => c !== 'help').join(', ')}.`,
      command,
    };
  }

  /** @type {string[]} */
  const positionals = [];
  /** @type {Record<string, string|boolean>} */
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    const token = args[i];
    if (token === '--help' || token === '-h') {
      flags.help = true;
      continue;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        const key = token.slice(2, eq);
        const value = token.slice(eq + 1);
        flags[key] = value;
        continue;
      }
      const key = token.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    positionals.push(token);
  }

  return {
    ok: true,
    command: /** @type {RoadmapCommand} */ (command),
    positionals,
    flags,
  };
}

export function formatHelp() {
  return `Usage: roadmap <command> [args] [flags]

Commands:
  add <title>              Create a Linear issue from a brief title/description
  expand <issueId>         Generate sub-issues from an epic (description bullets)
  sync                     Pull Linear state into agentos/roadmap/backlog.json
  today                    Emit today's active issues as agent-briefs (or list)
  approved                 List issues with human-approval gate cleared
  agent-brief <issueId>    Emit structured agent brief for a given issue

Flags (common):
  --json                   Machine-readable JSON output (default for agent-brief)
  --dry-run                Print planned writes without calling Linear mutations
  --help, -h               Show this help

sync:
  --check                  Diff in-memory sync vs on-disk backlog; exit 1 on drift
  --force                  Always rewrite backlog.json
  --out <path>             Output path (default: agentos/roadmap/backlog.json)

add:
  --description <text>     Issue description body
  --project <slug|id>      Linear project slug or id
  --priority <0-4>         Linear priority (0=None … 1=Urgent … 4=Low)
  --parent <JOV-N>         Parent issue identifier
  --labels <a,b,c>         Extra labels (agentos is always applied)

expand:
  --from <file>            Read sub-issue titles from a file (one per line)
  --limit <n>              Cap number of sub-issues created (default: 20)

today / approved:
  --limit <n>              Cap results (default: 50)

agent-brief / today:
  --json                   Emit JSON (default true for agent-brief)
`;
}

export { COMMANDS };
