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
// Arguments may nest parentheses; stay within one statement.
const SESSION_SET_CONFIG = /set_config\s*\([^;]*?,\s*false\s*\)/i;
// Role/database defaults persist for every future session, pooled or not.
const PERSISTENT_SET = /\bALTER\s+(?:ROLE|USER|DATABASE)\b[^;]*\bSET\b/i;

// SQL comments can sit between keywords (`SET /* x */ foo`, `SET--x\nfoo`).
// A shell flag (`--no-psqlrc`) starts after whitespace with no space after
// `--`, so it is kept. Stripping is not quote-aware, so callers check the raw
// text as well: a `--` inside a string literal must not hide what follows.
function expandShellNewlines(text) {
  return text.replace(/\\n/g, '\n'); // $'...\n...' expands at run time
}

function stripSqlComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<=\S)--[^\n]*|--\s[^\n]*/g, ' ');
}

function scan(source) {
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

// Best-effort guard against accidental session state from agents; the
// sanctioned path (scripts/db/prod-read.mjs) does not rely on it alone.
export function findSessionScopedSql(text) {
  const raw = expandShellNewlines(String(text ?? ''));
  return scan(raw) ?? scan(stripSqlComments(raw));
}

const READ_STATEMENT = /^(?:SELECT|WITH|EXPLAIN|SHOW|TABLE|VALUES)\b/i;

// prod-read accepts exactly one read statement, so caller SQL can never
// end or reconfigure the wrapping read-only transaction.
export function readOnlyStatementError(sql) {
  const body = String(sql ?? '')
    .replace(/^(?:\s+|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '')
    .replace(/;\s*$/, '');
  if (body.includes(';')) return 'multiple statements';
  if (!READ_STATEMENT.test(body))
    return 'not a SELECT, WITH, EXPLAIN, SHOW, TABLE or VALUES statement';
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
