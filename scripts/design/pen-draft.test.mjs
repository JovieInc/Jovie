import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  ATTEMPTS,
  attemptTimeout,
  draftProblem,
  LOAD_NOTE,
  loadBriefs,
  missingOutputs,
  missingSecrets,
  PEN_CLI_VERSION,
  PEN_DRAFT_MODEL,
  parseBrief,
  penArgs,
  penModel,
  planFrames,
  spliceDraft,
  trimCanonical,
  useTrimmedInput,
  writeCanonical,
} from './pen-draft.mjs';

test('every checked-in brief parses and names a unique frame', () => {
  for (const b of loadBriefs())
    assert.ok(b.context.length, `${b.file} names the screens it builds on`);
  const briefs = loadBriefs();
  assert.deepEqual(
    briefs.map(b => b.frame),
    [
      'audience-analytics',
      'billing-success',
      'chat-history-switcher',
      'claim',
      'empty-states',
      'homepage',
      'insights',
      'page-skeletons',
      'profile-analytics-card',
      'request-access',
      'tour-dates-connect',
      'workspace-table',
    ]
  );
  for (const b of briefs) assert.ok(b.prompt.length > 100, b.frame);
});

test('a brief without front matter or a bad frame name is rejected', () => {
  assert.throws(() => parseBrief('just text', 'x.md'), /front matter/);
  assert.throws(
    () => parseBrief('---\nframe: Bad Name\n---\nbody', 'x.md'),
    /kebab/
  );
});

test('pen draws into its own file from the canonical input and keeps other frames', () => {
  const args = penArgs(
    { frame: 'claim', route: '/x', prompt: 'P' },
    { input: 'c.pen', outDir: 'o' }
  );
  assert.deepEqual(args.slice(0, 6), [
    '-y',
    `@pen.dev/cli@${PEN_CLI_VERSION}`,
    '--in',
    'c.pen',
    '--out',
    'o/claim.pen',
  ]);
  assert.match(
    args[args.indexOf('--prompt') + 1],
    /Leave every existing frame untouched/
  );
  assert.equal(args[args.indexOf('--export') + 1], 'o/claim.png');
});

test('the Pen agent drafts on Fable 5.2 unless PEN_DRAFT_MODEL names another model', () => {
  // Run 43305192409: the CLI's default model, claude-opus-5-5, had spent the
  // subscription's weekly limit, so every frame ended "Agent failed: rate_limit".
  assert.equal(PEN_DRAFT_MODEL, 'claude-fable-5-2');
  assert.equal(penModel({}), 'claude-fable-5-2');
  assert.equal(penModel({ PEN_DRAFT_MODEL: ' ' }), 'claude-fable-5-2');
  assert.equal(penModel({ PEN_DRAFT_MODEL: 'gpt-5.5' }), 'gpt-5.5');
  const brief = { frame: 'claim', prompt: 'P' };
  const opts = { input: 'i.pen', outDir: 'o' };
  const args = penArgs(brief, opts);
  assert.equal(args[args.indexOf('--model') + 1], 'claude-fable-5-2');
  const other = penArgs(brief, { ...opts, model: 'gpt-5.5' });
  assert.equal(other[other.indexOf('--model') + 1], 'gpt-5.5');
  // Pen CLI 0.3.14 doesn't list claude-fable-5-2 and rejects unknown models.
  const [major, minor, patch] = PEN_CLI_VERSION.split('.').map(Number);
  assert.ok(major > 0 || minor > 3 || (minor === 3 && patch >= 16));
});

test('the Pen agent sees why a tool call failed and has room to recover', () => {
  // Run 42457693051: three drafts aborted at 8 failed calls with no error
  // text; the one that finished needed 7.
  const args = penArgs(
    { frame: 'claim', prompt: 'P' },
    { input: 'i.pen', outDir: 'o' }
  );
  assert.ok(args.includes('--verbose-mcp'));
  assert.ok(Number(args[args.indexOf('--max-failed-calls') + 1]) >= 20);
});

test('the agent is told the editor loads slowly and may retry timed-out calls', () => {
  const args = penArgs(
    { frame: 'claim', route: '/x', prompt: 'P' },
    { input: 'c.pen', outDir: 'o' }
  );
  const prompt = args[args.indexOf('--prompt') + 1];
  assert.ok(prompt.includes(LOAD_NOTE));
  assert.ok(prompt.endsWith('P'));
  // 8 allowed failures ended 3 of 4 drafts before the 25 MB file loaded.
  assert.ok(Number(args[args.indexOf('--max-failed-calls') + 1]) >= 24);
  assert.ok(ATTEMPTS >= 2);
});

test('one attempt gets 23 minutes of the 25-minute frame job', () => {
  // audience-analytics was still building when its 14-minute first attempt
  // and 6-minute restart were each stopped (run 43339513257).
  assert.equal(attemptTimeout(0), 23 * 60_000);
  assert.equal(attemptTimeout(10 * 60_000), 13 * 60_000);
  assert.equal(attemptTimeout(0, 4 * 60_000), 0);
});

test('a retry starts from scratch, so it needs room for a whole draft', () => {
  // An attempt that ran out its time is not restarted in what is left.
  assert.equal(attemptTimeout(23 * 60_000 + 10), 0);
  assert.equal(attemptTimeout(13 * 60_000 + 1), 0);
  // One that failed early (a rate limit, the failed-call cap) is.
  assert.equal(attemptTimeout(3 * 60_000), 20 * 60_000);
  assert.equal(attemptTimeout(13 * 60_000), 10 * 60_000);
});

test('the agent is told to build in small calls and that a stopped run saves nothing', () => {
  assert.match(LOAD_NOTE, /one screen or state per call/);
  assert.match(LOAD_NOTE, /within 20 minutes/);
  assert.match(LOAD_NOTE, /saves nothing/);
});

test('the CLI retries a draft that failed early, including opt-in trimming', () => {
  const work = mkdtempSync(join(tmpdir(), 'pen-retry-'));
  const preload = join(work, 'timeout.mjs');
  // Exercise the real CLI and receipt writer. Only the provider boundary and
  // clock are replaced: no paid Pen calls or fifteen-minute sleeps in CI.
  writeFileSync(
    preload,
    `
    import cp from 'node:child_process';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    let now = 0, calls = 0;
    Date.now = () => now;
    const fetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const response = await fetch(...args);
      now += 2000;
      return response;
    };
    cp.execFileSync = (command, args, options) => {
      if (command !== 'npx') throw new Error('unexpected command');
      calls++;
      if (calls % 2 === 1) {
        now += 3 * 60_000;
        throw new Error('Command failed: npx');
      }
      const arg = flag => args[args.indexOf(flag) + 1];
      const doc = JSON.parse(fs.readFileSync(arg('--in'), 'utf8'));
      const name = arg('--out').split('/').pop().replace('.pen', '');
      doc.children.push({type: 'frame', id: 'draft', name});
      fs.writeFileSync(arg('--out'), JSON.stringify(doc));
      fs.writeFileSync(arg('--export'), 'fixture preview');
    };
    syncBuiltinESMExports();
  `
  );
  const canonical = {
    children: [
      { type: 'frame', id: 'old', name: 'unrelated', x: 100, width: 100 },
    ],
  };
  for (const trim of ['0', '1']) {
    const out = join(work, trim);
    execFileSync(
      process.execPath,
      [
        '--import',
        preload,
        resolve('scripts/design/pen-draft.mjs'),
        '--out',
        out,
        '--only',
        'claim,homepage',
      ],
      {
        env: {
          ...process.env,
          PEN_CLI_KEY: 'fixture',
          PEN_DRAFT_TRIM: trim,
          PEN_GOLDEN_PATH_FILE_URL: `data:application/json,${encodeURIComponent(JSON.stringify(canonical))}`,
        },
      }
    );
    const { drafts } = JSON.parse(
      readFileSync(join(out, 'receipt.json'), 'utf8')
    );
    assert.deepEqual(
      drafts.map(d => d.frame),
      ['claim', 'homepage']
    );
    for (const draft of drafts) {
      assert.equal(draft.status, 'drafted');
      assert.equal(draft.attempts, 2);
      assert.equal(draft.error, undefined);
      const doc = JSON.parse(
        readFileSync(join(out, `${draft.frame}.pen`), 'utf8')
      );
      assert.deepEqual(doc.children[0], canonical.children[0]);
      assert.equal(doc.children[1].name, draft.frame);
      if (trim === '1') assert.equal(doc.children[1].x, 600);
    }
  }
});

test('a draft stopped at the time limit is not restarted', () => {
  const work = mkdtempSync(join(tmpdir(), 'pen-timeout-'));
  const preload = join(work, 'timeout.mjs');
  const calls = join(work, 'calls');
  writeFileSync(
    preload,
    `
    import cp from 'node:child_process';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    let now = 0;
    Date.now = () => now;
    cp.execFileSync = (command, args, options) => {
      fs.appendFileSync(${JSON.stringify(calls)}, String(options.timeout) + '\\n');
      now += options.timeout + 10;
      throw new Error('spawnSync npx ETIMEDOUT');
    };
    syncBuiltinESMExports();
  `
  );
  const out = join(work, 'out');
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [
        '--import',
        preload,
        resolve('scripts/design/pen-draft.mjs'),
        '--out',
        out,
        '--only',
        'claim',
      ],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          PEN_CLI_KEY: 'fixture',
          PEN_DRAFT_TRIM: '0',
          PEN_GOLDEN_PATH_FILE_URL: `data:application/json,${encodeURIComponent(JSON.stringify({ children: [] }))}`,
        },
      }
    )
  );
  assert.equal(readFileSync(calls, 'utf8'), `${23 * 60_000}\n`);
  const { drafts } = JSON.parse(
    readFileSync(join(out, 'receipt.json'), 'utf8')
  );
  assert.equal(drafts[0].status, 'failed');
  assert.equal(drafts[0].attempts, 1);
  assert.match(drafts[0].error, /ETIMEDOUT/);
});

test('missing secrets are named, so a blocked run never reads as done', () => {
  assert.deepEqual(missingSecrets({}), [
    'PEN_CLI_KEY',
    'PEN_GOLDEN_PATH_FILE_URL',
  ]);
  assert.deepEqual(
    missingSecrets({ PEN_CLI_KEY: 'k', PEN_GOLDEN_PATH_FILE_URL: 'u' }),
    []
  );
});

test('a frame without its .pen or preview is not drafted', () => {
  const b = { frame: 'claim' };
  assert.deepEqual(
    missingOutputs(b, 'o', () => true),
    []
  );
  assert.deepEqual(
    missingOutputs(b, 'o', p => String(p).endsWith('.pen')),
    ['claim.png']
  );
});

test('a draft counts only when it adds the named top-level frame', () => {
  const before = { children: [{ id: 'a', name: 'pricing' }] };
  const added = { children: [...before.children, { id: 'b', name: 'claim' }] };
  assert.equal(draftProblem(before, added, 'claim'), null);
  assert.equal(
    draftProblem(before, before, 'claim'),
    'no new top-level frame claim'
  );
  assert.equal(
    draftProblem(before, null, 'claim'),
    'pen output is not a Pen file'
  );
});

test('a .tar.gz workspace is unpacked and its named .pen is the input', () => {
  // The canonical URL serves the workspace folder as a .tar.gz so fonts and
  // images resolve. Written raw as canonical.pen, pen failed every frame with
  // "Failed to open document" (run 42457207487).
  const src = mkdtempSync(join(tmpdir(), 'pen-src-'));
  mkdirSync(join(src, 'ws', 'fonts'), { recursive: true });
  writeFileSync(join(src, 'ws', 'other.pen'), '{"children":[]}');
  writeFileSync(join(src, 'ws', 'canonical.lib.pen'), '{"children":[1]}');
  const tgz = join(src, 'ws.tar.gz');
  execFileSync('tar', ['-czf', tgz, '-C', src, 'ws']);
  const work = mkdtempSync(join(tmpdir(), 'pen-work-'));
  const pen = writeCanonical(readFileSync(tgz), work, 'canonical.lib.pen');
  assert.equal(basename(pen), 'canonical.lib.pen');
  assert.equal(readFileSync(pen, 'utf8'), '{"children":[1]}');
});

test('a plain .pen is used as is, and anything else is named, not drafted', () => {
  const work = mkdtempSync(join(tmpdir(), 'pen-work-'));
  const pen = writeCanonical(Buffer.from(' {"children":[]}'), work, 'x.pen');
  assert.equal(readFileSync(pen, 'utf8'), ' {"children":[]}');
  assert.throws(
    () => writeCanonical(Buffer.from('<html>expired</html>'), work, 'x.pen'),
    /neither a \.pen file nor a \.tar\.gz/
  );
});

test('a push drafts only the briefs it changed', () => {
  const briefs = [
    { frame: 'claim', file: 'claim.md' },
    { frame: 'homepage', file: 'homepage.md' },
    { frame: 'workspace-table', file: 'links-table.md' },
  ];
  assert.deepEqual(
    planFrames({
      briefs,
      changed: [
        'docs/design-system/pen-briefs/links-table.md',
        'docs/design-system/pen-briefs/retired.md',
        'apps/web/app/page.tsx',
      ],
    }),
    ['workspace-table']
  );
  assert.deepEqual(planFrames({ briefs, changed: ['README.md'] }), []);
});

test('a drafter change, a manual run or --only picks the right frames', () => {
  const briefs = [
    { frame: 'claim', file: 'claim.md' },
    { frame: 'homepage', file: 'homepage.md' },
  ];
  assert.deepEqual(
    planFrames({ briefs, changed: ['scripts/design/pen-draft.mjs'] }),
    ['claim', 'homepage']
  );
  assert.deepEqual(planFrames({ briefs }), ['claim', 'homepage']);
  assert.deepEqual(planFrames({ briefs, only: ['homepage'] }), ['homepage']);
  assert.throws(() => planFrames({ briefs, only: ['hompage'] }), /hompage/);
});

const frame = (id, name, extra = {}) => ({
  type: 'frame',
  id,
  name,
  x: 0,
  width: 100,
  children: [],
  ...extra,
});

test('a draft starts from components, related screens and what they use, not the whole file', () => {
  const doc = {
    version: '2',
    variables: { '--bg': { type: 'color', value: '#000' } },
    themes: { mode: ['dark'] },
    children: [
      frame('LIB', 'Components', {
        children: [{ type: 'frame', id: 'Btn', reusable: true, children: [] }],
      }),
      frame('PRO', 'Public profile, desktop', {
        children: [{ type: 'ref', id: 'r1', ref: 'Shell' }],
      }),
      frame('SHL', 'Layouts', {
        children: [{ type: 'frame', id: 'Shell', children: [] }],
      }),
      frame('BIL', 'Billing settings'),
      frame('OLD', 'Archive 2025'),
    ],
  };
  const bare = trimCanonical(doc, { frame: 'claim', route: '/[username]' });
  assert.deepEqual(
    bare.children.map(c => c.id),
    ['LIB'],
    'components, and no screen the brief does not name'
  );
  const claim = trimCanonical(doc, {
    frame: 'claim',
    context: ['profile', 'sign in'],
  });
  assert.deepEqual(
    claim.children.map(c => c.id),
    ['LIB', 'PRO', 'SHL'],
    'the screens a brief builds on come with the frames they use'
  );
  assert.deepEqual(
    trimCanonical(
      { children: [frame('D', 'Design tokens')] },
      {
        frame: 'x',
        context: ['sign in', 'sign'],
      }
    ).children,
    [],
    'terms match whole words only'
  );
  const profile = trimCanonical(doc, { frame: 'profile-analytics-card' });
  assert.deepEqual(
    profile.children.map(c => c.id),
    ['LIB', 'PRO', 'SHL'],
    'a word of the frame name counts too'
  );
  assert.deepEqual(profile.variables, doc.variables);
  assert.deepEqual(profile.themes, doc.themes);
  assert.equal(doc.children.length, 5, 'the canonical document is not changed');
});

test('a drafted frame lands in the whole file, clear of every existing frame', () => {
  const full = {
    variables: { a: 1 },
    children: [frame('A', 'A'), frame('B', 'B', { x: 500, width: 300 })],
  };
  const trimmed = { variables: { a: 1 }, children: [frame('A', 'A')] };
  const drafted = {
    variables: { a: 2, b: 3 },
    children: [frame('A', 'A'), frame('N', 'claim', { x: 200, width: 1440 })],
  };
  const out = spliceDraft(full, trimmed, drafted);
  assert.deepEqual(
    out.children.map(c => c.id),
    ['A', 'B', 'N']
  );
  assert.equal(out.children[2].x, 1200, 'placed 400 right of the last frame');
  assert.deepEqual(out.children.slice(0, 2), full.children);
  assert.deepEqual(out.variables, { a: 1, b: 3 }, 'existing values win');
});

test('the whole canonical file is the input unless the cut-down copy is asked for', () => {
  assert.equal(useTrimmedInput({}), false);
  assert.equal(useTrimmedInput({ PEN_DRAFT_TRIM: '0' }), false);
  assert.equal(useTrimmedInput({ PEN_DRAFT_TRIM: '1' }), true);
  const brief = { frame: 'claim', route: '/x', prompt: 'P' };
  const prompt = opts => {
    const args = penArgs(brief, { input: 'c.pen', outDir: 'o', ...opts });
    return args[args.indexOf('--prompt') + 1];
  };
  assert.doesNotMatch(prompt({}), /not every screen/);
  assert.match(prompt({ trim: true }), /not every screen/);
});
