import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  config,
  detect,
  excluded,
  extract,
  POLICY,
  ratchet,
  run,
  scan,
} from './check.mjs';

const script = fileURLToPath(new URL('check.mjs', import.meta.url));
const fixture = 'apps/web/app/demo/copy/page.tsx';
const clean = { schema: config.schema, entries: {} };
const bad = 'concise headline. fits 1-2 lines.';

test('each configured leak family is case insensitive and blocks real copy', () => {
  const cases = JSON.parse(
    readFileSync(new URL('positive-fixtures.json', import.meta.url), 'utf8')
  );
  assert.equal(Object.keys(cases).length, 11);
  for (const [rule, texts] of Object.entries(cases))
    for (const text of texts) {
      assert.ok(
        detect(text.toUpperCase(), 'headline').includes(rule),
        `${rule}: ${text}`
      );
    }
  for (const text of [
    'Replacement tracks',
    'Somewhere is home',
    'A certain light',
    'Todoist',
    'Your music. One link.',
    'Loading... a < b > c <=>',
    'Catchyfish',
    '<header><article name="bio">Ready</article></header>',
    '<name>Jovie</name><entry><content>Ready</content></entry>',
  ])
    assert.deepEqual(detect(text, 'headline'), []);
});

test('all visible source forms are scanned, including nested expressions and split JSX', () => {
  const sources = [
    `export const copy = {name: '${bad}'};`,
    `<h1>${bad} text-[12px]</h1>`,
    `<h1>{['${bad}'.trim()].map(text => text)}</h1>`,
    `<p>https://jov.ie — ${bad}</p>`,
    '<h1>TODO-release</h1>',
    '<h1>concise <span>{`headline`}</span></h1>',
    'const headline = `concise ${"headline"}`;',
    'const html = `<h1>Use a brief welcome</h1>`;',
    `<Hero name='${bad}'/>`,
    `const prompt = '${bad}';`,
    `export const metadata = {title: '${bad}', description: '${bad}', openGraph: {title: '${bad}'}, keywords: ['${bad}']};`,
    `<input placeholder='${bad}' aria-label='${bad}'/>`,
    `<div data-placeholder='${bad}'/>`,
    `<img alt='${bad}'/>`,
    `throw new Error('${bad}');`,
    `toast.info('${bad}');`,
    '<h1>{`${ok ? "concise headline. fits 1-2 lines." : "Ready"}`}</h1>',
    '<h1>concise <span>headline</span>. fits <strong>1-2</strong> lines.</h1>',
    '<h1>concise&#32;headline. fits 1&#45;2 lines.</h1>',
    '<h1>concise&#x20;headline. fits 1-2 lines.</h1>',
    '<p>&quot;Sure,&quot; here is your copy.</p>',
    `const title = 'concise ' + 'headline. fits 1-2 lines.';`,
    `const text = '[Your headline] copy goes here';`,
  ];
  for (const source of sources) assert.ok(scan(fixture, source).length, source);
  for (const path of [
    'apps/web/public/llms.txt',
    'apps/web/lib/email/templates/new.ts',
    'apps/web/components/shared/fixtures.ts',
    'apps/web/data/copy.json',
    'apps/web/app/demo/new/page.tsx',
  ]) {
    assert.ok(
      scan(
        path,
        path.endsWith('.txt')
          ? bad
          : path.endsWith('.json')
            ? JSON.stringify({ text: bad })
            : `const text = '${bad}'`
      ).length,
      path
    );
  }
  assert.ok(
    scan('apps/web/components/Hero.tsx', '<h1>Coming soon</h1>').length
  );
  assert.deepEqual(
    scan('apps/web/components/Hero.js', '<h1>Listen now</h1>'),
    []
  );
});

test('headline length applies after concatenation', () => {
  const half = 'A useful musical release headline with context ';
  assert.ok(
    scan(fixture, `const headline = '${half}' + '${half}' + '${half}';`).some(
      h => h.rule === 'headline-length'
    )
  );
});

test('reasoned exceptions match only exact copy in the named source', () => {
  const path =
    'apps/web/components/features/profile/artist-notifications-cta/ProfileMobileNotificationsFlow.tsx';
  assert.deepEqual(scan(path, "const label = 'Use Email';"), []);
  assert.ok(scan(path, "const label = 'Use Email placeholder';").length);
  assert.ok(scan(fixture, "const label = 'Use Email';").length);
  config.exclude.push({ path: 'only-invalid-test' });
  try {
    assert.throws(() => excluded('only-invalid-test'), /reason/);
  } finally {
    config.exclude.pop();
  }
  config.allow.push({ path: fixture });
  try {
    assert.throws(() => scan(fixture, `const label = '${bad}';`), /reason/);
  } finally {
    config.allow.pop();
  }
});

test('HTML/email headings and attributes, CSS content and SVG labels carry real copy', () => {
  for (const [path, source] of [
    ['apps/web/public/copy.html', '<h1>Use a short headline</h1>'],
    [
      'apps/web/lib/email/templates/new.ts',
      'const html = `<img alt="concise headline"/><h1>Use a short headline</h1>`;',
    ],
    ['apps/web/app/copy.css', 'p::before { content: "concise headline"; }'],
    ['apps/web/public/copy.svg', '<svg><title>concise headline</title></svg>'],
  ])
    assert.ok(scan(path, source).length, path);
  assert.ok(detect('<description here>').includes('unresolved-prompt'));
  assert.deepEqual(scan(fixture, 'const html = `<td${style}>Ready</td>`;'), []);
});

test('narrow exclusions preserve fixtures and do not hide leaked adjacent copy', () => {
  for (const path of [
    'apps/web/tests/example.ts',
    'apps/web/a.test.tsx',
    'apps/web/docs/README.md',
    'apps/web/app/dev/example.tsx',
  ])
    assert.ok(excluded(path));
  for (const path of [
    fixture,
    'apps/web/components/fixtures.ts',
    'apps/web/lib/email/templates/welcome.ts',
    'apps/web/app/exp/page.tsx',
  ])
    assert.equal(excluded(path), false);
  assert.deepEqual(
    scan(
      fixture,
      `// ${bad}\n/* ${bad} */\nconst ui = <p className='font-[620]'>Listen</p>;\ntype T = '${bad}';\nlogger.info('${bad}');`
    ),
    []
  );
  assert.throws(() => extract(fixture, 'export const = ;'), /unable to parse/);
  assert.deepEqual(detect('', 'headline'), []);
});

test('baseline only shrinks, rejects moved/new/repeated hits and stale entries', () => {
  const hits = scan(fixture, `const title = '${bad}';`);
  const entries = Object.fromEntries(hits.map(h => [h.key, 1]));
  const grandfathered = { ...clean, entries };
  assert.equal(ratchet(hits, grandfathered, grandfathered).length, 0);
  assert.ok(
    ratchet(hits, grandfathered, clean).some(e => e.includes('only shrink'))
  );
  assert.ok(
    ratchet([], grandfathered, grandfathered).some(e => e.includes('stale'))
  );
  assert.ok(ratchet([...hits, ...hits], grandfathered, grandfathered).length);
  assert.ok(
    ratchet(
      scan(fixture.replace('/copy/', '/other/'), `const x = '${bad}'`),
      grandfathered,
      grandfathered
    ).length
  );
  assert.deepEqual(ratchet([], clean, grandfathered), []);
  assert.throws(() => ratchet([], { schema: 'invalid' }, clean), /schema/);
});

test('deliberate-red CLI proof: a tracked production route exits 1; clean exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'jovie-copy-leak-'));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    symlinkSync(
      join(process.cwd(), 'node_modules'),
      join(root, 'node_modules')
    );
    mkdirSync(join(root, POLICY), { recursive: true });
    mkdirSync(join(root, 'apps/web/app/demo/copy'), { recursive: true });
    writeFileSync(join(root, POLICY, 'baseline.json'), JSON.stringify(clean));
    writeFileSync(join(root, fixture), 'export const title = "Listen now";');
    git(['init', '-q']);
    git(['add', 'apps', 'scripts']);
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.com',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'fixture',
    ]);
    git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    assert.equal(run(root, 'HEAD'), 0);
    writeFileSync(join(root, fixture), `export const headline = '${bad}';`);
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[instruction\].*concise headline/);
    assert.equal(run(root, 'HEAD'), 1);
    assert.throws(() => run(root, 'missing-base'), /Command failed/);
    git(['rm', '-q', '--cached', fixture]);
    assert.throws(() => run(root, 'HEAD'), /empty source inventory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
