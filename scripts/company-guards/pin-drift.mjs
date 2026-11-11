import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep the pinned upstream age policy. Only replace its path-filtered API
// history, which can omit a merge pin and age freshly merged branch commits
// from their old branch dates. First-parent history records arrival on main.
export function driftHistory({ repo, pin }) {
  if (!/^[0-9a-f]{40}$/.test(pin ?? ''))
    throw new Error('pin-drift needs an exact pin');
  const git = args =>
    execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  const tip = git([
    'rev-parse',
    '--verify',
    'refs/remotes/origin/main^{commit}',
  ]);
  // Missing/shallow/diverged ancestry cannot authorize a passing verdict.
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false')
    throw new Error('pin-drift needs complete shared CI history');
  try {
    git(['merge-base', '--is-ancestor', pin, tip]);
  } catch {
    throw new Error('pin is not a proven ancestor of shared CI main');
  }
  const history = git([
    'log',
    '--first-parent',
    '--format=%H%x09%cI',
    `${pin}..${tip}`,
    '--',
    'canon',
    'guards',
    '.github/workflows/company-guards.yml',
  ]);
  if (!history) return [];
  return history
    .split('\n')
    .map(line => {
      const [sha, date] = line.split('\t');
      if (!/^[0-9a-f]{40}$/.test(sha) || !Number.isFinite(Date.parse(date)))
        throw new Error('invalid shared CI commit history');
      return { sha, date };
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function run({
  repo,
  pin,
  evaluate,
  now = Date.now(),
  log = console.log,
}) {
  const result = evaluate(pin, driftHistory({ repo, pin }), now);
  log(`pin-drift: ${result.ok ? 'ok' : result.reason}`);
  return result.ok === true ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const repo = resolve('.company-ci');
    const { evaluate } = await import(
      pathToFileURL(resolve(repo, 'guards/drift.mjs')).href
    );
    process.exitCode = run({ repo, pin: process.env.CI_PIN, evaluate });
  } catch (error) {
    console.error(`pin-drift: unavailable (${error.message})`);
    process.exitCode = 1;
  }
}
