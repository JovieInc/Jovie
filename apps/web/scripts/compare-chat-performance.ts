import { execFile, spawn } from 'node:child_process';
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
    execFile(
      executable,
      args,
      { cwd, env, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error)
          reject(new Error(`Comparison command failed: ${executable}`));
        else done(stdout.trim());
      }
    );
  });
}
const git = (...args: string[]) => command(root, 'git', args);
const pnpm = (cwd: string, args: string, env: NodeJS.ProcessEnv) =>
  command(cwd, 'pnpm', args.split(' '), env);
const guard = resolve(root, '.github/scripts/guard-playwright-artifacts.mjs');
const smoke =
  'pnpm --filter=@jovie/web exec playwright test --config=playwright.config.chat-comparison.ts --project=chromium'.split(
    ' '
  );

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
  if (
    (await git('rev-parse', `${FAILURE_HEAD}^`)) !== FAILURE_PARENT ||
    (await git('merge-base', FAILURE_HEAD, historicalMain)) !== FAILURE_BASE
  )
    throw new Error('Failure-era source verification failed');
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
    let outcome = 'advanced';
    try {
      return await operation();
    } catch (error) {
      outcome = 'failed';
      throw error;
    } finally {
      const event = {
        schema: 'jovie-stage-event/v1',
        entityType: 'chat-comparison',
        entityId,
        stage,
        enteredAt,
        exitedAt: new Date().toISOString(),
        actor: 'codex',
        outcome,
        sourceReceipt: harnessSha,
      };
      events.push(event);
      if (stage === 'smoke')
        events.push({
          ...event,
          stage: 'finished',
          outcome: 'completed',
          enteredAt: event.exitedAt,
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
        await pnpm(checkout, 'install --frozen-lockfile', env);
        await timed('build', sourceSha, () =>
          pnpm(checkout, 'turbo build --filter=@jovie/web', {
            ...sourceEnv,
            NODE_ENV: 'production',
          })
        );
        await command(checkout, 'git', ['diff', '--exit-code', 'HEAD']);
        const web = resolve(checkout, 'apps/web');
        const standalone = resolve(web, '.next/standalone/apps/web');
        if (!existsSync(resolve(standalone, '.next/BUILD_ID')))
          throw new Error('Production standalone output missing');
        for (const asset of ['.next/static', 'public'])
          cpSync(resolve(web, asset), resolve(standalone, asset), {
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
          await pnpm(
            root,
            '--filter=@jovie/web run seed:test-data',
            databaseEnv
          );
          const attemptOutput = resolve(output, `${label}-${attempt}`);
          mkdirSync(attemptOutput, { mode: 0o700 });
          const occupied = await fetch(baseURL, {
            signal: AbortSignal.timeout(1000),
          }).then(
            () => true,
            () => false
          );
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
              ready = await fetch(baseURL, {
                signal: AbortSignal.timeout(1000),
              }).then(
                response => response.ok,
                () => false
              );
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
                  [guard, '--run', '--', ...smoke],
                  flightEnv
                )
              );
            } catch {
              /* Failed flights remain in the paired receipts. */
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
    for (const key of 'harnessSha harnessDigest fixtureDigest datasetDigest browser buildMode workers warmups scoredSamples dataset'.split(
      ' '
    )) {
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
      attempts: [0, 1].map(index => {
        const status = (row: (typeof receipts)[number]) =>
          row?.measurementStatus === 'complete' ? row.budgetStatus : 'unknown';
        return {
          attempt: index + 1,
          base: status(rows.base[index]),
          head: status(rows.head[index]),
          causality: 'unknown',
        };
      }),
    };
    writeFileSync(
      resolve(output, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
      { flag: 'wx', mode: 0o600 }
    );
    try {
      await command(root, process.execPath, [guard, output], {
        ...env,
        RUNNER_TEMP: scratch,
      });
    } catch {
      rmSync(output, { recursive: true, force: true });
      throw new Error('Aggregate artifact guard rejected output');
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith('compare-chat-performance.ts')) {
  runComparison(
    resolve(process.argv[2] ?? '.context/perf/chat-comparison')
  ).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
