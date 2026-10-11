import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import writer from '../.github/scripts/update-quarantine.js';

const REPO = 'JovieInc/Jovie';
const LEDGER = 'apps/web/tests/quarantine.json';
const PREFIX = 'codex/quarantine-heal-';
function requireFact(ok, message) {
  if (!ok) throw new Error(message);
}

/**
 * @param {object} [input]
 * @param {string} [input.root]
 * @param {number} [input.now]
 * @param {(command:string,args:string[],options:import('node:child_process').ExecFileSyncOptionsWithStringEncoding)=>string} [input.execute]
 */
export function proposeQuarantineLedger({
  root = process.cwd(),
  now = Date.now(),
  execute = execFileSync,
} = {}) {
  const run = (command, args) =>
    execute(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const git = args => run('git', args);
  const sourceHead = git(['rev-parse', 'HEAD']);
  requireFact(/^[a-f0-9]{40}$/.test(sourceHead), 'Exact source required');
  const sourceLease = expectedHead => {
    requireFact(
      git(['rev-parse', 'HEAD']) === expectedHead &&
        run('gh', [
          'api',
          `repos/${REPO}/git/ref/heads/main`,
          '--jq',
          '.object.sha',
        ]) === sourceHead,
      'Quarantine proposal source changed'
    );
  };
  sourceLease(sourceHead);
  requireFact(
    git(['diff', '--name-only']) === '' &&
      git(['diff', '--cached', '--name-only']) === '',
    'Clean tracked proposal source required'
  );
  const roster = JSON.parse(
    run('gh', [
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--limit',
      '1000',
      '--json',
      'number,headRefName',
    ])
  );
  requireFact(
    Array.isArray(roster) && roster.length < 1000,
    'Complete bounded proposal roster required'
  );
  const existing = roster.find(pr => pr.headRefName?.startsWith(PREFIX));
  if (existing) return { updated: false, blockedBy: existing.number };
  const result = writer.processQuarantine({ root, now });
  if (!result.updated) return result;
  const expectedLedger = readFileSync(join(root, LEDGER), 'utf8');
  const ledgerLease = () =>
    requireFact(
      readFileSync(join(root, LEDGER), 'utf8') === expectedLedger,
      'Quarantine ledger lease changed'
    );
  sourceLease(sourceHead);
  requireFact(
    git(['diff', '--name-only']) === LEDGER,
    'Ledger-only proposal required'
  );
  const branch = `${PREFIX}${sourceHead.slice(0, 12)}`;
  git(['switch', '-c', branch]);
  ledgerLease();
  git(['add', '--', LEDGER]);
  requireFact(
    git(['diff', '--cached', '--name-only']) === LEDGER,
    'Ledger-only staged proposal required'
  );
  sourceLease(sourceHead);
  git([
    '-c',
    'user.name=Jovie Bot',
    '-c',
    'user.email=jovie-bot@users.noreply.github.com',
    'commit',
    '-m',
    'fix(tests): reconcile verified quarantine execution evidence',
  ]);
  const proposalHead = git(['rev-parse', 'HEAD']);
  requireFact(
    git(['rev-parse', 'HEAD^']) === sourceHead,
    'Proposal parent changed'
  );
  sourceLease(proposalHead);
  ledgerLease();
  git([
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
    'push',
    'origin',
    `HEAD:refs/heads/${branch}`,
  ]);
  sourceLease(proposalHead);
  const directory = mkdtempSync(join(tmpdir(), 'quarantine-proposal-'));
  try {
    const bodyPath = join(directory, 'body.md');
    writeFileSync(
      bodyPath,
      [
        `Reconcile verified execution evidence collected at source ${sourceHead}.`,
        `Added: ${JSON.stringify(result.added)}. Released: ${JSON.stringify(result.unquarantined)}.`,
        'The guarded writer requires three successful flaky retry attempts within 24 hours to add a file, and 50 distinct clean executions after the last failure plus seven stable days to release an automatically managed file. Manual entries are preserved; skipped, stale, partial or missing evidence cannot authorize release.',
        'This draft changes only the quarantine ledger. Normal review, source checks and native combined-head CI are required before landing. Linear issues are not closed by proposing a ledger change.',
        '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
      ].join('\n\n')
    );
    const url = run('gh', [
      'pr',
      'create',
      '--repo',
      REPO,
      '--base',
      'main',
      '--head',
      branch,
      '--draft',
      '--title',
      'fix(tests): reconcile verified quarantine execution evidence',
      '--body-file',
      bodyPath,
    ]);
    requireFact(
      /^https:\/\/github\.com\/JovieInc\/Jovie\/pull\/[1-9]\d*$/.test(url),
      'Canonical draft proposal receipt required'
    );
    return { ...result, sourceHead, proposalHead, url };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(proposeQuarantineLedger()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
