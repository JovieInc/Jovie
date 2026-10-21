import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeStageTimings } from '../../../scripts/lib/stage-events.mjs';
import {
  type ChatRunBinding,
  COMPARISON_POLICY,
  FAILURE_BASE,
  FAILURE_HEAD,
  FAILURE_PARENT,
} from './chat-performance-receipt';

const root = resolve(import.meta.dirname, '../../..');
const historicalMain = 'fcdf417872e8589fe98f89d1d57b7b342a703058';

async function command(
  cwd: string,
  executable: string,
  args: string[],
  env = process.env
) {
  return new Promise<string>((done, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    child.stdout.on('data', chunk => {
      if (bytes < 8 * 1024 * 1024) chunks.push(chunk);
      bytes += chunk.length;
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0
        ? done(Buffer.concat(chunks).toString().trim())
        : reject(
            new Error(`Comparison command failed: ${executable} (exit ${code})`)
          )
    );
  });
}
const git = (...args: string[]) => command(root, 'git', args);

export function validateComparisonSources(
  head: string,
  base: string,
  parent: string,
  mergeBase: string
) {
  if (
    head !== FAILURE_HEAD ||
    base !== FAILURE_BASE ||
    parent !== FAILURE_PARENT ||
    mergeBase !== base
  )
    throw new Error('Failure-era source verification failed');
}

/** Retry success never replaces the first result; missing/partial evidence stays unknown. */
export function compareAttempts(
  base: { budgetStatus: string; measurementStatus: string }[],
  head: { budgetStatus: string; measurementStatus: string }[]
) {
  return [0, 1].map(index => ({
    attempt: index + 1,
    base:
      base[index]?.measurementStatus === 'complete'
        ? base[index].budgetStatus
        : 'unknown',
    head:
      head[index]?.measurementStatus === 'complete'
        ? head[index].budgetStatus
        : 'unknown',
    causality: 'unknown',
  }));
}

async function digestPaths(paths: string[]) {
  return createHash('sha256')
    .update(await git('ls-tree', '-r', 'HEAD', '--', ...paths))
    .digest('hex');
}

function digestBuild(directory: string): string {
  const hash = createHash('sha256');
  function visit(path: string) {
    hash.update(path).update('\0');
    const absolute = resolve(directory, path);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) hash.update(readlinkSync(absolute));
    else if (stat.isDirectory())
      for (const name of readdirSync(absolute).sort()) visit(`${path}/${name}`);
    else hash.update(readFileSync(absolute));
  }
  visit('.');
  return hash.digest('hex');
}

export async function runComparison(output: string) {
  if (await git('status', '--porcelain', '--untracked-files=normal'))
    throw new Error('Commit the reviewed harness before comparison');
  const databases = [
    'BASE_FIRST',
    'BASE_RETRY',
    'HEAD_FIRST',
    'HEAD_RETRY',
  ].map(key => process.env[`CHAT_COMPARISON_${key}_DATABASE_URL`]);
  if (databases.some(value => !value) || new Set(databases).size !== 4)
    throw new Error(
      'Four fresh isolated comparison database URLs are required'
    );
  validateComparisonSources(
    await git('rev-parse', FAILURE_HEAD),
    await git('rev-parse', FAILURE_BASE),
    await git('rev-parse', `${FAILURE_HEAD}^`),
    await git('merge-base', FAILURE_HEAD, historicalMain)
  );
  if (
    (await command(root, 'gh', [
      'api',
      'repos/JovieInc/Jovie/actions/runs/38637462417',
      '--jq',
      '.head_sha',
    ])) !== FAILURE_HEAD
  )
    throw new Error('Historical run source mismatch');
  const harnessSha = await git('rev-parse', 'HEAD');
  const harnessDigest = await digestPaths(['.']);
  const fixtureDigest = await digestPaths([
    'apps/web/tests/fixtures',
    'apps/web/tests/helpers/chat-performance-probe.ts',
    'apps/web/tests/e2e/chat-performance-ratchet.spec.ts',
  ]);
  const datasetDigest = await digestPaths([
    'apps/web/tests/seed-test-data.ts',
    'apps/web/tests/fixtures',
  ]);
  mkdirSync(output, { mode: 0o700 });
  const scratch = mkdtempSync(resolve(tmpdir(), 'jovie-chat-comparison-'));
  const baseURL = 'http://localhost:3240';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    SMOKE_ONLY: '1',
    VERCEL_ENV: 'development',
    E2E_USE_TEST_AUTH_BYPASS: '1',
    E2E_TEST_AUTH_PERSONA: 'creator-ready',
    NEXT_PUBLIC_E2E_MODE: '1',
    E2E_TEST_MODE: '1',
    E2E_SKIP_WARMUP: '1',
    NEXT_DISABLE_TOOLBAR: '1',
    CHAT_LLM_FAILURE_INJECTION: '1',
    HOSTNAME: 'localhost',
    PORT: '3240',
    NEXT_PUBLIC_APP_URL: baseURL,
    BETTER_AUTH_URL: baseURL,
    NEXT_PUBLIC_BETTER_AUTH_URL: baseURL,
    BASE_URL: baseURL,
    DATABASE_URL: databases[0],
    PLAYWRIGHT_WORKERS: '8',
  };
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;
  const rows: Record<string, ReturnType<typeof JSON.parse>[]> = {
    base: [],
    head: [],
  };
  const events: Record<string, string>[] = [];
  async function timed(
    stage: string,
    entityId: string,
    operation: () => Promise<string>
  ) {
    const enteredAt = new Date().toISOString();
    let outcome = 'completed';
    try {
      return await operation();
    } catch (error) {
      outcome = 'failed';
      throw error;
    } finally {
      events.push({
        schema: 'jovie-stage-event/v1',
        entityType: 'chat-comparison',
        entityId,
        stage,
        enteredAt,
        exitedAt: new Date().toISOString(),
        actor: 'codex',
        outcome,
        sourceReceipt: harnessSha,
      });
    }
  }
  try {
    for (const [label, sourceSha] of [
      ['base', FAILURE_BASE],
      ['head', FAILURE_HEAD],
    ]) {
      const checkout = resolve(scratch, label);
      await git('worktree', 'add', '--detach', checkout, sourceSha);
      try {
        const sourceEnv = {
          ...env,
          NEXT_PUBLIC_BUILD_SHA: sourceSha,
          VERCEL_GIT_COMMIT_SHA: sourceSha,
        };
        console.log(`Building exact ${label} ${sourceSha}`);
        await command(checkout, 'pnpm', ['install', '--frozen-lockfile'], env);
        await timed('build', sourceSha, () =>
          command(checkout, 'pnpm', ['turbo', 'build', '--filter=@jovie/web'], {
            ...sourceEnv,
            NODE_ENV: 'production',
          })
        );
        await command(checkout, 'git', ['diff', '--exit-code', 'HEAD']);
        const web = resolve(checkout, 'apps/web');
        const standalone = resolve(web, '.next/standalone/apps/web');
        if (!existsSync(resolve(standalone, '.next/BUILD_ID')))
          throw new Error('Production standalone output missing');
        cpSync(
          resolve(web, '.next/static'),
          resolve(standalone, '.next/static'),
          { recursive: true }
        );
        cpSync(resolve(web, 'public'), resolve(standalone, 'public'), {
          recursive: true,
        });
        const binding: ChatRunBinding = {
          sourceSha,
          parentSha: await command(checkout, 'git', ['rev-parse', 'HEAD^']),
          baseSha: FAILURE_BASE,
          harnessSha,
          harnessDigest,
          fixtureDigest,
          datasetDigest,
          buildDigest: digestBuild(resolve(web, '.next/standalone')),
        };
        for (
          let attempt = 1;
          attempt <= COMPARISON_POLICY.attempts;
          attempt++
        ) {
          const databaseEnv = {
            ...sourceEnv,
            DATABASE_URL: databases[(label === 'base' ? 0 : 2) + attempt - 1],
          };
          await command(
            root,
            'pnpm',
            ['--filter=@jovie/web', 'run', 'seed:test-data'],
            databaseEnv
          );
          const attemptOutput = resolve(output, `${label}-${attempt}`);
          mkdirSync(attemptOutput, { mode: 0o700 });
          let occupied = false;
          try {
            await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
            occupied = true;
          } catch {
            /* expected: no listener */
          }
          if (occupied) throw new Error('Comparison port already in use');
          const server = spawn(
            process.execPath,
            [resolve(standalone, 'server.js')],
            {
              cwd: checkout,
              env: { ...databaseEnv, NODE_ENV: 'test' },
              stdio: 'ignore',
            }
          );
          const serverExit = new Promise<void>(done =>
            server.once('exit', () => done())
          );
          try {
            const deadline = Date.now() + 30_000;
            let ready = false;
            while (Date.now() < deadline && server.exitCode === null) {
              try {
                ready = (
                  await fetch(baseURL, { signal: AbortSignal.timeout(1000) })
                ).ok;
              } catch {
                /* readiness only */
              }
              if (ready) break;
              await new Promise(done => setTimeout(done, 250));
            }
            if (!ready || server.exitCode !== null)
              throw new Error('Standalone server not ready');
            const version = await fetch(`${baseURL}/api/version`, {
              signal: AbortSignal.timeout(5000),
            });
            if ((await version.json()).buildId !== sourceSha.slice(0, 7))
              throw new Error('Served standalone build mismatch');
            const privateOutput = resolve(
              scratch,
              `private-${label}-${attempt}`
            );
            const flightEnv = {
              ...databaseEnv,
              CHAT_COMPARISON_ATTEMPT: String(attempt),
              CHAT_COMPARISON_OUTPUT: attemptOutput,
              CHAT_COMPARISON_PRIVATE_OUTPUT: privateOutput,
              CHAT_COMPARISON_BINDING: JSON.stringify(binding),
              PLAYWRIGHT_ARTIFACT_PATHS: attemptOutput,
              RUNNER_TEMP: scratch,
            };
            try {
              await timed('smoke', `${sourceSha}:${attempt}`, () =>
                command(
                  root,
                  process.execPath,
                  [
                    resolve(
                      root,
                      '.github/scripts/guard-playwright-artifacts.mjs'
                    ),
                    '--run',
                    '--',
                    'pnpm',
                    '--filter=@jovie/web',
                    'exec',
                    'playwright',
                    'test',
                    '--config=playwright.config.chat-comparison.ts',
                    '--project=chromium',
                  ],
                  flightEnv
                )
              );
            } catch {
              console.log(
                `${label} attempt ${attempt}: nonzero smoke/guard outcome`
              );
            }
            const receiptPath = resolve(
              attemptOutput,
              `attempt-${attempt}.json`
            );
            rows[label].push(
              existsSync(receiptPath)
                ? JSON.parse(readFileSync(receiptPath, 'utf8'))
                : { measurementStatus: 'incomplete', budgetStatus: 'pending' }
            );
            if (
              existsSync(resolve(scratch, 'safe-playwright-producer/blocked'))
            ) {
              rmSync(output, { recursive: true, force: true });
              throw new Error('Artifact guard rejected comparison output');
            }
          } finally {
            server.kill('SIGTERM');
            const killer = setTimeout(() => server.kill('SIGKILL'), 5000);
            await serverExit;
            clearTimeout(killer);
          }
        }
      } finally {
        await git('worktree', 'remove', '--force', checkout);
      }
    }
    const receipts = [...rows.base, ...rows.head].filter(
      row => row.measurementStatus === 'complete'
    );
    for (const key of [
      'harnessSha',
      'harnessDigest',
      'fixtureDigest',
      'datasetDigest',
      'browser',
      'buildMode',
      'workers',
      'warmups',
      'scoredSamples',
      'dataset',
    ]) {
      if (receipts.some(row => row[key] !== receipts[0]?.[key]))
        throw new Error('Incomparable workload receipts');
    }
    writeFileSync(
      resolve(output, 'stage-events.jsonl'),
      events.map(row => JSON.stringify(row)).join('\n') + '\n'
    );
    const stageEntities = computeStageTimings(
      events,
      JSON.parse(
        readFileSync(resolve(root, 'docs/metrics/stage-manifest.json'), 'utf8')
      )
    ).entities as Record<string, unknown>;
    if (
      (await git('diff', 'HEAD')) ||
      (await git('rev-parse', 'HEAD')) !== harnessSha
    )
      throw new Error('Harness changed during comparison');
    const comparison = {
      stageTimings: stageEntities['chat-comparison'],
      schema: 'jovie-chat-comparison/v1',
      harnessSha,
      harnessDigest,
      fixtureDigest,
      datasetDigest,
      ...COMPARISON_POLICY,
      attempts: compareAttempts(rows.base, rows.head),
    };
    writeFileSync(
      resolve(output, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
      { flag: 'wx', mode: 0o600 }
    );
    try {
      await command(
        root,
        process.execPath,
        [
          resolve(root, '.github/scripts/guard-playwright-artifacts.mjs'),
          output,
        ],
        { ...env, RUNNER_TEMP: scratch }
      );
    } catch {
      rmSync(output, { recursive: true, force: true });
      throw new Error('Aggregate artifact guard rejected output');
    }
    console.log('Comparison receipts retained; causality remains unknown.');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output = process.argv[2];
  if (!output)
    throw new Error(
      'Usage: pnpm exec tsx apps/web/scripts/compare-chat-performance.ts <new-output-directory>'
    );
  runComparison(resolve(output)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
