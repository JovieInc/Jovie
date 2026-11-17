import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const shellQuote = value => `'${value.replace(/'/g, `'\\''`)}'`;

export function failureTrap(controlDir) {
  const journal = controlDir && shellQuote(path.join(controlDir, 'journal'));
  return `trap ${shellQuote(`__pf_failure=$?; ${journal ? `printf 'failure %s %s\\n' "$__pf_index" "$__pf_failure" >> ${journal} || exit 125; ` : ''}if (( BASH_SUBSHELL > 0 )); then exit "$__pf_failure"; fi`)} ERR`;
}

export function statementControl(controlDir, index) {
  if (!controlDir) return { begin: [], end: [], stop: [], completionFile: '' };
  const journal = shellQuote(path.join(controlDir, 'journal'));
  const completionFile = path.join(controlDir, `returned-${index}`);
  return {
    completionFile,
    begin: [
      `__pf_index=${index}`,
      `printf 'begin ${index}\\n' >> ${journal} || exit 125`,
    ],
    end: [`printf 'end ${index} %s\\n' "$__pf_rc" >> ${journal} || exit 125`],
    stop: [
      `if [ "$__pf_rc" -eq 0 ] && [ ! -f ${shellQuote(completionFile)} ]; then`,
      `printf 'stop ${index}\\n' >> ${journal} || exit 125`,
      'exit 0',
      'fi',
    ],
  };
}

/** Private records remain authoritative even when a command redirects stdout. */
function readControl(controlDir, statementCount, code) {
  const results = [];
  const failures = new Map();
  let current = null;
  let stopped = null;
  const records =
    statementCount === 0
      ? ''
      : readFileSync(path.join(controlDir, 'journal'), 'utf8');
  if (statementCount === 0 && code === 0)
    return { code, results, terminatedAfter: null, error: null };
  if (!records.endsWith('\n'))
    throw new Error('incomplete shell control journal');
  for (const line of records.trimEnd().split('\n')) {
    const match = line.match(/^(begin|end|stop|failure) (\d+)(?: (\d+))?$/);
    if (!match) throw new Error('invalid shell control record');
    const [, kind, rawIndex, rawStatus] = match;
    const index = Number(rawIndex);
    const status = Number(rawStatus);
    if (index >= statementCount || (rawStatus !== undefined && status > 255))
      throw new Error('invalid shell control index or status');
    if (
      kind === 'failure' &&
      rawStatus !== undefined &&
      status !== 0 &&
      index <= (current ?? results.length - 1)
    ) {
      failures.set(index, status);
    } else if (
      kind === 'begin' &&
      rawStatus === undefined &&
      current === null &&
      stopped === null &&
      index === results.length
    ) {
      current = index;
    } else if (kind === 'end' && rawStatus !== undefined && current === index) {
      results.push({ index, code: status });
      current = null;
    } else if (
      kind === 'stop' &&
      rawStatus === undefined &&
      current === null &&
      stopped === null &&
      results.at(-1)?.index === index &&
      results.at(-1)?.code === 0
    ) {
      stopped = index;
    } else {
      throw new Error('inconsistent shell control sequence');
    }
  }
  let terminatedAfter = code === 0 ? stopped : null;
  if (current !== null) {
    const status = failures.get(current) || (code ?? 1);
    results.push({ index: current, code: status });
    if (code === 0 && status === 0) terminatedAfter = current;
  }
  const error =
    code !== 0 && !results.some(result => result.code !== 0)
      ? `step shell exited ${code ?? 'without a status'}`
      : null;
  return { code, results, terminatedAfter, error };
}

/** Collect diagnostics live; classify completion from the private journal. */
export function runProgram({
  program,
  cwd,
  env,
  controlDir,
  statementCount,
  onResult,
}) {
  return new Promise(resolve => {
    const child = spawn('bash', ['-c', program], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const outputs = new Map();
    const endedAt = new Map();
    let buffer = '';
    let current = null;
    let spawnError = null;
    const handle = line => {
      const begin = line.match(/^@@PF-BEGIN (\d+)$/);
      const end = line.match(/^@@PF-END (\d+) (\d+)$/);
      if (begin) {
        current = Number(begin[1]);
        outputs.set(current, []);
      } else if (end && current === Number(end[1])) {
        endedAt.set(current, Date.now());
        current = null;
      } else if (current !== null) outputs.get(current).push(line);
    };
    const feed = chunk => {
      buffer += chunk.toString();
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', error => {
      spawnError = error.message;
    });
    child.on('close', code => {
      if (buffer) handle(buffer);
      let result;
      try {
        result = readControl(controlDir, statementCount, code);
      } catch (error) {
        result = {
          code,
          terminatedAfter: null,
          results: [],
          error: error.message,
        };
      }
      if (spawnError) result.error = spawnError;
      const finishedAt = Date.now();
      let previousAt = 0;
      for (const item of result.results) {
        const at = Math.max(previousAt, endedAt.get(item.index) ?? finishedAt);
        onResult({ ...item, at, output: outputs.get(item.index) ?? [] });
        previousAt = at;
      }
      resolve(result);
    });
  });
}
