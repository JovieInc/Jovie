#!/usr/bin/env node
// PreToolUse(Bash): block session-scoped Postgres SET in database commands.
// Claude Code passes hook input as JSON on stdin; exit 2 blocks and shows
// stderr to the agent. See scripts/lib/pg-session-scope.mjs for why.
import { readFileSync } from 'node:fs';
import {
  SAFE_READ_ONLY_GUIDANCE,
  sessionScopeViolation,
} from '../../scripts/lib/pg-session-scope.mjs';

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {
  process.exit(0);
}

const match = sessionScopeViolation(command);
if (match) {
  process.stderr.write(
    `BLOCKED: session-scoped Postgres setting in a database command (${match}).\n` +
      `${SAFE_READ_ONLY_GUIDANCE}\n`
  );
  process.exit(2);
}
