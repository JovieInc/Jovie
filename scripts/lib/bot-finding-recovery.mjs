// api-budget: github-app-core 40/hr - daily scan: at most 10 original-comment pages plus one run list, five artifact lists and five ZIP reads (21 core reads including source pages); client owns read retries.
// api-budget: github-app-graphql 60/hr - at most 20 original-comment hydrations times three thread pages, at report priority; no resolver mutations.
// api-budget: linear-requests 300/hr - at most 20 exact original intakes, including up to ten comment pages per existing workpad; shared cooldown retains retries.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ghStdoutBytes, runGh } from '../../packages/api-client/gh.ts';
import { findingSeverity } from './bot-review-findings.mjs';
import { isReviewBot, recoverBotFindings } from './bot-review-threads.mjs';

/** @typedef {(args: readonly string[], options?: object) => Promise<{code:number, stdout:string}>} RecoveryGh */

/** Validate and whitelist cursor-only transport state, never arbitrary artifact fields.
 * @returns {any}
 */
function normalizeCursor(cursor, repo) {
  if (
    cursor?.repo !== repo ||
    !Number.isSafeInteger(cursor.page) ||
    cursor.page < 1 ||
    !Number.isSafeInteger(cursor.offset) ||
    cursor.offset < 0 ||
    cursor.offset >= 100 ||
    typeof cursor.until !== 'string' ||
    !Number.isFinite(Date.parse(cursor.until))
  )
    return null;
  const result = {
    repo,
    page: cursor.page,
    offset: cursor.offset,
    until: cursor.until,
  };
  if (
    typeof cursor.threadCursor === 'string' &&
    cursor.threadCursor &&
    Number.isSafeInteger(cursor.threadPr) &&
    cursor.threadPr > 0 &&
    typeof cursor.threadOriginalUrl === 'string' &&
    cursor.threadOriginalUrl
  ) {
    Object.assign(result, {
      threadCursor: cursor.threadCursor,
      threadPr: cursor.threadPr,
      threadOriginalUrl: cursor.threadOriginalUrl,
    });
  }
  return result;
}

function clearThreadCursor(cursor) {
  delete cursor.threadCursor;
  delete cursor.threadPr;
  delete cursor.threadOriginalUrl;
}

/** Resume a bounded scan of original GitHub review comments in creation order.
 * The checkpoint is pagination only: original threads and Linear own all facts.
 * Completed passes restart from the beginning so deletions cannot permanently
 * hide a finding by shifting REST page boundaries.
 */
/** @param {{ repo?: string, ghRunner?: RecoveryGh, dryRun?: boolean, nowMs?: number,
 * maxPulls?: number, maxPages?: number, cursor?: any, intake?: any }} [options] */
export async function recoverReviewFindings({
  repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie',
  ghRunner = runGh,
  dryRun = false,
  nowMs = Date.now(),
  maxPulls = 20,
  maxPages = 10,
  cursor,
  intake,
} = {}) {
  const warnings = [],
    issues = [];
  const valid = normalizeCursor(cursor, repo);
  let nextCursor = valid ?? {
    repo,
    page: 1,
    offset: 0,
    until: new Date(nowMs).toISOString(),
  };
  if (!valid)
    warnings.push(
      'Bot finding checkpoint missing or invalid; starting full original-comment backfill'
    );
  const hydrated = new Map();
  let hydrationCalls = 0;
  const report = complete => ({ warnings, issues, nextCursor, complete });
  const partial = reason => {
    warnings.push(
      `Bot finding recovery incomplete: ${reason}; next page=${nextCursor.page} offset=${nextCursor.offset} snapshot=${nextCursor.until}`
    );
    return report(false);
  };
  const complete = () => {
    nextCursor = {
      repo,
      page: 1,
      offset: 0,
      until: new Date(nowMs).toISOString(),
    };
    return report(true);
  };
  for (let page = 0; page < maxPages; page++) {
    const read = await ghRunner(
      [
        'api',
        `repos/${repo}/pulls/comments?sort=created&direction=asc&per_page=100&page=${nextCursor.page}`,
      ],
      { priority: 'report' }
    );
    if (read.code !== 0) return partial('original-comment read failed');
    const comments = JSON.parse(read.stdout);
    if (!Array.isArray(comments))
      return partial('original-comment response malformed');
    for (let offset = nextCursor.offset; offset < comments.length; offset++) {
      const comment = comments[offset];
      nextCursor.offset = offset;
      if (Date.parse(comment.created_at) > Date.parse(nextCursor.until))
        return complete();
      const eligible =
        !comment.in_reply_to_id &&
        isReviewBot({
          __typename: comment.user?.type,
          login: comment.user?.login,
        }) &&
        ['P0', 'P1'].includes(findingSeverity(comment.body));
      const pr = Number(
        String(comment.pull_request_url ?? '').match(/\/pulls\/(\d+)$/)?.[1]
      );
      if (
        eligible &&
        Number.isInteger(pr) &&
        pr > 0 &&
        !hydrated.get(pr)?.has(comment.html_url)
      ) {
        if (hydrationCalls >= maxPulls)
          return partial(`${maxPulls} PR hydration cap`);
        if (typeof comment.html_url !== 'string' || !comment.html_url)
          return partial('original comment URL missing; checkpoint retained');
        if (
          nextCursor.threadCursor &&
          (nextCursor.threadPr !== pr ||
            nextCursor.threadOriginalUrl !== comment.html_url)
        ) {
          clearThreadCursor(nextCursor);
          warnings.push(
            'Bot finding original changed at REST checkpoint; restarting its thread pagination'
          );
        }
        hydrationCalls += 1;
        const result = await recoverBotFindings({
          repo,
          pr,
          after: nextCursor.threadCursor,
          commentUrl: comment.html_url,
          gh: args => ghRunner(args, { priority: 'report' }),
          dryRun,
          intake,
          log: () => {},
        });
        warnings.push(...result.warnings);
        issues.push(
          ...result.findings.map(({ thread, result: filed }) => ({
            fingerprint: `bot-review:${repo}#${pr}:${thread.id}`,
            ...filed,
          }))
        );
        const bound =
          typeof comment.html_url === 'string' &&
          result.findings.some(
            row => row.thread.comments?.nodes?.[0]?.url === comment.html_url
          );
        if (
          result.source.incomplete &&
          result.source.reason !== 'thread-pagination-incomplete'
        )
          return partial('source read failed; checkpoint retained');
        if (result.findings.some(row => !row.result.ok && !dryRun))
          return partial('Linear intake failed; checkpoint retained');
        if (!bound) {
          // A large PR resumes its next thread page, rather than pinning the
          // whole original-comment scan on the first 300 threads forever.
          if (
            result.source.reason === 'thread-pagination-incomplete' &&
            result.source.nextCursor &&
            result.source.nextCursor !== nextCursor.threadCursor
          ) {
            nextCursor.threadCursor = result.source.nextCursor;
            nextCursor.threadPr = pr;
            nextCursor.threadOriginalUrl = comment.html_url;
            return partial('thread pagination checkpoint advanced');
          }
          return partial(
            'source or original binding incomplete; checkpoint retained'
          );
        }
        clearThreadCursor(nextCursor);
        const captured = hydrated.get(pr) ?? new Set();
        for (const finding of result.findings) {
          if (finding.result.ok || dryRun)
            captured.add(finding.thread.comments?.nodes?.[0]?.url);
        }
        hydrated.set(pr, captured);
      }
      clearThreadCursor(nextCursor);
      nextCursor.offset = offset + 1;
    }
    if (comments.length < 100) return complete();
    nextCursor = { ...nextCursor, page: nextCursor.page + 1, offset: 0 };
  }
  return partial(`${maxPages} original-comment page cap`);
}

/** Persist only pagination transport state; dry-run never advances it. */
export async function runFindingRecoveryFromCheckpoint({
  path,
  dryRun = false,
  ...options
}) {
  let cursor;
  try {
    if (path && existsSync(path))
      cursor = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    /* Recovery reports restart coverage. */
  }
  const result = await recoverReviewFindings({ ...options, dryRun, cursor });
  if (path && !dryRun)
    writeFileSync(path, `${JSON.stringify(result.nextCursor)}\n`);
  return result;
}

const CURSOR_MEMBER = 'bot-findings-cursor.json';
const MAX_ARCHIVE_BYTES = 64 * 1024;

/** Decode one bounded regular JSON member in memory; never extract ZIP paths. */
function cursorArchive(bytes, repo) {
  if (bytes.length > MAX_ARCHIVE_BYTES) return null;
  const program = `import io,json,stat,sys,zipfile
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
entries=z.infolist()
assert len(entries)==1
entry=entries[0]
assert entry.filename=='bot-findings-cursor.json' and entry.file_size<=16384
mode=entry.external_attr>>16
assert stat.S_IFMT(mode) in (0,stat.S_IFREG) and not entry.is_dir() and not entry.flag_bits&1
sys.stdout.buffer.write(z.read(entry))`;
  const read = spawnSync('python3', ['-c', program], {
    input: bytes,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 32 * 1024,
  });
  if (read.status !== 0) return null;
  try {
    return normalizeCursor(JSON.parse(read.stdout), repo);
  } catch {
    return null;
  }
}

/** Restore through explicit GETs: runs, run artifacts, then constructed ZIP URL.
 * Contract: docs.github.com/en/rest/actions/{workflow-runs,artifacts}.
 * @param {{repo?: string, dir: string, ghRunner?: RecoveryGh}} options
 */
export async function restoreFindingCursor({
  repo = process.env.GITHUB_REPOSITORY,
  dir,
  ghRunner = runGh,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) return false;
  const base = `repos/${repo}/actions`;
  const readJson = async endpoint => {
    const result = await ghRunner(['api', '--method', 'GET', endpoint], {
      priority: 'report',
    });
    if (result.code !== 0) return null;
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  };
  const runs = await readJson(
    `${base}/workflows/remediation-sweep.yml/runs?status=completed&per_page=5`
  );
  if (!Array.isArray(runs?.workflow_runs)) return false;
  for (const run of runs.workflow_runs.slice(0, 5)) {
    if (
      !run ||
      !Number.isSafeInteger(run.id) ||
      run.id < 1 ||
      run.status !== 'completed' ||
      run.path !== '.github/workflows/remediation-sweep.yml' ||
      !['schedule', 'workflow_dispatch'].includes(run.event) ||
      String(run.repository?.full_name).toLowerCase() !== repo.toLowerCase() ||
      !Number.isSafeInteger(run.repository?.id) ||
      run.repository.id < 1 ||
      run.head_repository?.id !== run.repository.id ||
      !/^[0-9a-f]{40}$/i.test(run.head_sha)
    )
      continue;
    const listed = await readJson(
      `${base}/runs/${run.id}/artifacts?name=bot-findings-cursor&per_page=2`
    );
    if (listed?.total_count !== 1 || listed.artifacts?.length !== 1) continue;
    const artifact = listed.artifacts[0];
    if (
      !artifact ||
      artifact.name !== 'bot-findings-cursor' ||
      artifact.expired !== false ||
      !Number.isSafeInteger(artifact.id) ||
      artifact.id < 1 ||
      !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes < 1 ||
      artifact.size_in_bytes > MAX_ARCHIVE_BYTES ||
      artifact.workflow_run?.id !== run.id ||
      artifact.workflow_run.repository_id !== run.repository.id ||
      artifact.workflow_run.head_repository_id !== run.repository.id ||
      artifact.workflow_run.head_sha !== run.head_sha
    )
      continue;
    const args = [
      'api',
      '--method',
      'GET',
      `${base}/artifacts/${artifact.id}/zip`,
    ];
    const archive = await ghRunner(args, { priority: 'report' });
    if (archive.code !== 0) continue;
    const bytes = ghStdoutBytes(archive.stdout, args);
    if (
      artifact.digest &&
      artifact.digest !==
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    )
      continue;
    const cursor = cursorArchive(bytes, repo);
    if (!cursor) continue;
    writeFileSync(join(dir, CURSOR_MEMBER), `${JSON.stringify(cursor)}\n`);
    return true;
  }
  return false;
}

export async function collectFindingRecovery(load) {
  if (!load)
    return {
      warnings: ['Bot findings recovery not wired; not judged'],
      issues: [],
    };
  try {
    const result = await load();
    return {
      warnings: result.warnings,
      issues: result.issues,
      botFindings: { complete: result.complete, nextCursor: result.nextCursor },
    };
  } catch (error) {
    return {
      warnings: [
        `Bot findings recovery failed; recovery incomplete: ${error.message}`,
      ],
      issues: [],
    };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await restoreFindingCursor({ dir: process.argv[2] });
}
