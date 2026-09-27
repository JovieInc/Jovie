// Detects session-scoped Postgres state changes in shell commands or SQL text.
//
// Production DATABASE_URL points at the Neon PgBouncer pooler (transaction
// mode). A session-level SET survives on the pooled server connection after
// the client disconnects and applies to the next app transaction that lands
// there. `set default_transaction_read_only=on` from an agent's read-only psql
// check made prod writes fail for ~1h40m on 2026-09-27 (JOV-6726 follow-up).
// Transaction-scoped forms (BEGIN READ ONLY, SET LOCAL, SET TRANSACTION,
// set_config(..., true)) end with the transaction and are safe.

const DB_COMMAND =
  /\b(psql|pgcli|pg_dump|pg_restore)\b|DATABASE_URL|postgres(ql)?:\/\/|\.neon\.tech\b|\bneon\(/i;

// A SET that begins a statement: at the start, after `;`, a newline, or an
// opening quote (`-c "SET ...`). Every form except SET LOCAL / TRANSACTION /
// CONSTRAINTS is session-scoped, including SET TIME ZONE and SET SCHEMA.
// `set -e` is a shell builtin.
const SESSION_SET =
  /(?:^|[;\n]|["'`])\s*SET\s+(?!LOCAL\b|TRANSACTION\b|CONSTRAINTS\b|[-+])\S+/i;
const SESSION_SET_CONFIG = /set_config\s*\([^()]*,\s*false\s*\)/i;
// Role/database defaults persist for every future session, pooled or not.
const PERSISTENT_SET = /\bALTER\s+(?:ROLE|USER|DATABASE)\b[^;]*\bSET\b/i;

// SQL comments can sit between keywords (`SET /* x */ foo`, `SET--x\nfoo`).
// Strip block comments and line comments; a shell flag (`--no-psqlrc`) starts
// after whitespace and has no space after `--`, so it is kept.
function stripSqlComments(text) {
  return text
    .replace(/\\n/g, '\n') // $'...\n...' shell strings expand at run time
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<=\S)--[^\n]*|--\s[^\n]*/g, ' ');
}

// Statement-leading transaction control would end a read-only wrapper.
// SET TRANSACTION can switch the wrapper's transaction to READ WRITE.
const TRANSACTION_CONTROL =
  /(?:^|[;\n])\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|SET\s+TRANSACTION|SET\s+SESSION\s+CHARACTERISTICS)\b/i;

export function findTransactionControl(sql) {
  const match = stripSqlComments(String(sql ?? '')).match(TRANSACTION_CONTROL);
  return match ? match[0].trim() : null;
}

export function findSessionScopedSql(text) {
  const source = stripSqlComments(String(text ?? ''));
  // Statements end at `;`; shell quotes delimit separate `-c` arguments.
  for (const statement of source.split(/[;"'`]/)) {
    const set = statement.match(SESSION_SET);
    // `UPDATE t\nSET col = 1` (and ON CONFLICT DO UPDATE) is a clause, not a
    // statement, even when a newline precedes SET.
    if (set && !/\bUPDATE\b/i.test(statement.slice(0, set.index))) {
      return set[0].trim();
    }
  }
  const config = source.match(SESSION_SET_CONFIG);
  if (config) return config[0].trim();
  const persistent = source.match(PERSISTENT_SET);
  if (persistent) return persistent[0].trim();
  return null;
}

export function isDatabaseCommand(command) {
  return DB_COMMAND.test(String(command ?? ''));
}

export function sessionScopeViolation(command) {
  if (!isDatabaseCommand(command)) return null;
  return findSessionScopedSql(command);
}

export const SAFE_READ_ONLY_GUIDANCE = [
  'Session-level SET on the Neon pooler leaks into other clients (production outage 2026-09-27).',
  'Use a transaction-scoped form instead:',
  '  scripts/db/prod-read.mjs "select ..."   (direct endpoint, BEGIN READ ONLY)',
  '  psql "$URL" -X -c "BEGIN READ ONLY" -c "<query>" -c "COMMIT"',
  '  SET LOCAL <guc> = <value> inside BEGIN ... COMMIT',
].join('\n');

// Neon's pooled host is the direct host with `-pooler` on the endpoint id.
export function directNeonUrl(url) {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.replace(
    /^(ep-[a-z0-9-]+?)-pooler\./,
    '$1.'
  );
  return parsed.toString();
}
