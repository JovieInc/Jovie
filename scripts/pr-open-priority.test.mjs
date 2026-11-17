import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publicationPriority } from './lib/pr-publication.mjs';
import { draftBody, main } from './pr-open.mjs';

test('declining reserve never raises ordinary feature, docs or unqualified priority', () => {
  const repair = {
    title: 'fix(ci): regression',
    body: '',
    labels: [],
    files: [{ filename: '.github/workflows/ci.yml' }],
    evidence: {
      failingCommand: 'node --test regression.test.mjs',
      failingRun: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    },
  };
  for (const input of [
    repair,
    { ...repair, title: 'feat(ci): feature' },
    { ...repair, files: [{ filename: 'docs/guide.md' }] },
    { ...repair, evidence: {} },
  ]) {
    const automatic = publicationPriority(input);
    const declined = publicationPriority({ ...input, noRepairReserve: true });
    assert.equal(declined.automaticPriority, automatic.automaticPriority);
    assert.equal(declined.priority, 'default');
    assert.equal(automatic.priority, input === repair ? 'repair' : 'default');
  }
});

function fixture() {
  const repo = mkdtempSync(path.join(tmpdir(), 'publication-priority-'));
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  const hooks = path.join(repo, 'hooks');
  mkdirSync(hooks);
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Publication fixture']);
  git(['config', 'user.email', 'publication@example.invalid']);
  git(['config', 'core.hooksPath', hooks]);
  writeFileSync(path.join(repo, 'base.txt'), 'fixture\n');
  git(['add', '.']);
  git(['commit', '-m', 'fixture base']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  git(['checkout', '-b', 'fixture/source']);
  mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(repo, 'scripts'));
  writeFileSync(
    path.join(repo, '.github/workflows/fixture.yml'),
    'name: fixture\n'
  );
  writeFileSync(path.join(repo, 'scripts/fixture.test.mjs'), '// regression\n');
  git(['add', '.']);
  git(['commit', '-m', 'fix(ci): regression']);
  const files = [
    { filename: '.github/workflows/fixture.yml', status: 'added' },
    { filename: 'scripts/fixture.test.mjs', status: 'added' },
  ];
  const body = path.join(repo, 'body.md');
  writeFileSync(
    body,
    draftBody({
      title: 'fix(ci): regression',
      files,
      summary: 'Fixes the existing regression.',
      failingCommand: 'node --test scripts/fixture.test.mjs',
      failingRun: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    })
  );
  return {
    repo,
    body,
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
}

const ok = stdout => ({ status: 0, stdout, stderr: '' });

async function publish(extra, refusal) {
  const f = fixture();
  const calls = [],
    creates = [],
    receipts = [],
    messages = [];
  const execute = (command, args) => {
    calls.push({ command, args });
    if (command === 'python3')
      return {
        status: refusal ? 75 : 0,
        stdout: JSON.stringify({
          allowed: !refusal,
          known: true,
          reason: refusal ?? 'within-capacity',
          used: 14,
          cap: 8,
          producer: 'fixture',
        }),
        stderr: '',
      };
    if (command === 'git') {
      if (args[0] === 'log') return ok('fix(ci): regression');
      if (args[0] === 'branch') return ok('fixture/source');
      if (args[0] === 'ls-remote')
        return ok(`${'c'.repeat(40)}\trefs/heads/fixture/source\n`);
      if (args[0] === 'rev-parse')
        return ok(args[1] === 'HEAD' ? 'c'.repeat(40) : args[1]);
      if (args[0] === 'merge-base') return ok('base');
      if (args[0] === 'show') return ok('// trusted classifier');
    }
    return ok(
      args.includes('--plan') ? JSON.stringify({ applicable: false }) : ''
    );
  };
  try {
    const code = await main(
      ['open', '--repo', f.repo, '--body-file', f.body, ...extra],
      message => messages.push(message),
      {
        execute,
        record: row => receipts.push(row),
        github: (_cwd, args, options) => {
          creates.push({ args, options });
          return ok('https://github.com/JovieInc/Jovie/pull/42');
        },
      }
    );
    return { code, calls, creates, receipts, messages };
  } finally {
    f.cleanup();
  }
}

test('qualified repairs retain automatic reserve selection unless explicitly declined', async () => {
  for (const [extra, priority] of [
    [[], 'repair'],
    [['--no-repair-reserve'], 'default'],
  ]) {
    const result = await publish(extra);
    assert.equal(result.code, 0, result.messages.join('\n'));
    const gate = result.calls.find(call => call.command === 'python3');
    assert.equal(gate.args[gate.args.indexOf('--priority') + 1], priority);
    assert.deepEqual(result.creates[0].options, { once: true, priority });
    const receipt = result.receipts.find(
      row => row.cmd === 'publication-priority'
    );
    assert.deepEqual(receipt, {
      cmd: 'publication-priority',
      automaticPriority: 'repair',
      priority,
      noRepairReserve: extra.length > 0,
    });
    assert.equal(
      result.receipts.find(row => row.cmd === 'wip-admission').priority,
      priority
    );
  }
});

test('declining reserve preserves quota and CI refusal without source push or creation', async () => {
  for (const reason of ['github-quota:core', 'ci-runner-backlog']) {
    const result = await publish(['--no-repair-reserve'], reason);
    assert.equal(result.code, 75, result.messages.join('\n'));
    assert.equal(result.creates.length, 0);
    assert.ok(
      !result.calls.some(
        call => call.command === 'git' && call.args[0] === 'push'
      )
    );
    const gate = result.calls.find(call => call.command === 'python3');
    assert.equal(gate.args[gate.args.indexOf('--priority') + 1], 'default');
  }
});

test('no-push remains independent from declining repair reserve', async () => {
  const result = await publish(['--no-push', '--no-repair-reserve']);
  assert.equal(result.code, 0, result.messages.join('\n'));
  assert.ok(
    !result.calls.some(
      call => call.command === 'git' && call.args[0] === 'push'
    )
  );
  assert.equal(result.creates[0].options.priority, 'default');
});

test('the downgrade flag accepts no priority value and cannot request escalation', async () => {
  for (const value of ['repair', 'poll', 'true', 'false']) {
    const result = await publish([`--no-repair-reserve=${value}`]);
    assert.equal(result.code, 2);
    assert.equal(result.creates.length, 0);
    assert.ok(!result.calls.some(call => call.command === 'python3'));
  }
});
