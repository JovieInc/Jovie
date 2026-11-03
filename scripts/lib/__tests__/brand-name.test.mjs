import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { afterEach, test, vi } from 'vitest';
import {
  EXCEPTIONS,
  readScanFile,
  main as runBrandName,
  scanDiff,
  scanFiles,
  scanRepo,
  scanText,
  stripCommitScopes,
} from '../../anti-slop/brand-name.mjs';
import {
  main as runMessages,
  scanPullRequestText,
} from '../../anti-slop/brand-name-messages.mjs';
import { runMatchers } from '../../anti-slop/run.mjs';
import {
  BRAND_NAME_COVERAGE_COMMAND,
  SCRIPT_CONTRACT_VITEST_TESTS,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';

const kinds = (text, file = 'a.md') =>
  scanText(text, { file }).map(h => `${h.kind}:${h.text}`);
const locations = (text, file) =>
  scanText(text, { file }).map(h => `${h.line}:${h.kind}:${h.text}`);
test('deliberate red: every misspelling is flagged', () => {
  for (const bad of [
    'Jovy',
    'Jovee',
    'Jovei',
    'Jovvie',
    'Jovies',
    'J0vie',
    'Jovey',
    'Jouvie',
    'Jovvy',
    'Jovye',
  ]) {
    assert.deepEqual(
      kinds(`Welcome to ${bad} today.`),
      [`misspelling:${bad}`],
      bad
    );
  }
});
test('deliberate red: the wrong domain and wrong casing are flagged', () => {
  assert.deepEqual(kinds('Visit jovie.com now'), ['domain:jovie.com']);
  assert.deepEqual(kinds('Visit jovie.io now'), ['domain:jovie.io']);
  assert.deepEqual(kinds('Sign up for jovie today'), ['casing:jovie']);
  assert.deepEqual(kinds('Sign up for JOVIE today'), ['casing:JOVIE']);
  assert.deepEqual(kinds('Sign up for JoVie today'), ['casing:JoVie']);
});
test('only enumerated brand misspellings are flagged', () => {
  assert.deepEqual(kinds('Meet Jovle here', 'x.tsx'), []);
  assert.deepEqual(kinds('Meet Jvie here', 'x.tsx'), []); // No fuzzy matching of names.
});
test('correct usage and look-alikes pass', () => {
  assert.deepEqual(kinds("Jovie's profile at jov.ie, from Jovie."), []);
  assert.deepEqual(
    kinds('A jovial Jove, Joyce and Jolie. Join the list. Jamie, Jose.'),
    []
  );
  assert.deepEqual(
    kinds(
      'const x = jovie; import { JovieO } from "@jovie/ui"; JOVIE_API_KEY=1 jovie-web',
      'x.ts'
    ),
    []
  );
  assert.deepEqual(
    kinds('See https://www.jovie.com/ and [x](https://jovie.io/a)', 'x.md'),
    []
  );
  assert.deepEqual(kinds('Use `jovie` in the shell.'), []);
  assert.deepEqual(kinds('```\njovie login\n```\n'), []);
  assert.deepEqual(kinds('Mail ci@test.jovie.com or app.jovie.com'), []);
  assert.deepEqual(
    kinds(
      'Jovie at jov.ie is unrelated to the childcare franchise at jovie.com.'
    ),
    []
  );
});
test('Jovi is allowed only where it names the agent', () => {
  assert.deepEqual(kinds('Summer Jovi is the internal agent.'), []);
  assert.deepEqual(kinds('Ask the Jovi coach for a plan.'), []);
  assert.deepEqual(kinds('Jovi Technology Inc is the company.'), []);
  assert.deepEqual(kinds('Welcome to Jovi, the best link in bio.'), [
    'jovi-outside-agent-context:Jovi',
  ]);
});
test('casing checks app copy while preserving code identifiers and technical literals', () => {
  assert.deepEqual(kinds('const jovie = 1;', 'a.ts'), []);
  assert.deepEqual(kinds('hello jovie', 'a.html'), ['casing:jovie']);
  assert.deepEqual(kinds('<h1>Welcome to JOVIE</h1>', 'a.tsx'), [
    'casing:JOVIE',
  ]);
  assert.deepEqual(
    kinds('export const headline = "Welcome to jovie"', 'a.ts'),
    ['casing:jovie']
  );
  assert.deepEqual(
    kinds(
      'const jovie = "jovie"; const key = "JOVIE"; const url = "https://jovie.com/jovie"; type Brand = "jovie";',
      'a.ts'
    ),
    []
  );
  assert.deepEqual(
    kinds(
      'const copy = "Visit https://jovie.io/path and email ci@jovie.com";',
      'a.ts'
    ),
    []
  );
  assert.deepEqual(
    kinds(
      '// Welcome to jovie\nconst copy = "Welcome to Jovie"; const obj = { "jovie": 1 };',
      'a.ts'
    ),
    []
  );
});
test('JSX copy and template fragments retain casing hits and original line numbers', () => {
  const source = [
    'const view = <><h1>JOVIE</h1><span>{"jovie"}</span>',
    '<input aria-label="jovie" title={"JOVIE"} id="jovie" /></>;',
    'const headline = `Welcome to jovie`;',
    'const description = `JOVIE welcomes ${name} to jovie with ${count} new JOVIE updates`;',
  ].join('\n');
  assert.deepEqual(
    scanText(source, { file: 'copy.tsx' }).map(
      h => `${h.line}:${h.kind}:${h.text}`
    ),
    [
      '1:casing:JOVIE',
      '1:casing:jovie',
      '2:casing:jovie',
      '2:casing:JOVIE',
      '3:casing:jovie',
      '4:casing:JOVIE',
      '4:casing:jovie',
      '4:casing:JOVIE',
    ]
  );
});
test('quotes cannot hide brand casing in JSX or named presentation copy', () => {
  for (const brand of ['jovie', 'JOVIE']) {
    const value = `Welcome to "${brand}"`;
    for (const source of [
      `<h1>${value}</h1>`,
      `<h1>{${JSON.stringify(value)}}</h1>`,
      `<input title={${JSON.stringify(value)}} />`,
      `<h1 children={${JSON.stringify(value)}} />`,
      `export const headline = '${value}';`,
      `const title = ${JSON.stringify(value)};`,
      `const copy = { title: ${JSON.stringify(value)} };`,
      `const copy = { 'label': '${value}' };`,
      `const copy = { label: \`Welcome \${name} to "${brand}"\` };`,
      `const label = '${brand}';`,
    ]) {
      assert.deepEqual(kinds(source, 'copy.tsx'), [`casing:${brand}`], source);
    }
  }
  assert.deepEqual(
    kinds(
      'const title = \'Run "pnpm jovie login" or `jovie login`; welcome to "JOVIE"\';',
      'copy.ts'
    ),
    ['casing:JOVIE']
  );
  assert.deepEqual(
    kinds(
      '<h1>Use `jovie` or "pnpm jovie login"; welcome to "jovie"</h1>',
      'copy.tsx'
    ),
    ['casing:jovie']
  );
});
test('quoted product statements are prose; presentation commands need local intent', () => {
  for (const source of [
    '<h1>"jovie makes you visible"</h1>',
    'const headline = \'"jovie makes you visible"\';',
    'const copy = { title: \'"jovie makes you visible"\', label: \'"JOVIE makes you visible"\' };',
  ]) {
    assert.deepEqual(
      kinds(source, 'copy.tsx'),
      source.includes('JOVIE')
        ? ['casing:jovie', 'casing:JOVIE']
        : ['casing:jovie'],
      source
    );
  }
  for (const source of [
    '<h1>Run "jovie mesh send"; welcome to jovie and JOVIE</h1>',
    'const headline = \'Run "jovie mesh send"; welcome to jovie and JOVIE\';',
  ]) {
    assert.deepEqual(kinds(source, 'copy.tsx'), [
      'casing:jovie',
      'casing:JOVIE',
    ]);
  }
  assert.deepEqual(
    kinds('<p>Run jovie init; welcome to jovie</p>', 'copy.tsx'),
    ['casing:jovie']
  );
  assert.deepEqual(
    kinds('const body = "Run jovie init; welcome to jovie";', 'copy.ts'),
    ['casing:jovie']
  );
  assert.deepEqual(kinds('const title = "Run JOVIE init";', 'copy.ts'), [
    'casing:JOVIE',
  ]);
  const diagnostic =
    'const diagnostic = \'Use "jovie mesh send"; welcome to jovie\';';
  assert.deepEqual(kinds(diagnostic, 'copy.ts'), []);
  assert.deepEqual(
    kinds(diagnostic + '\nconst title = "Welcome to jovie";', 'copy.ts'),
    ['casing:jovie']
  );
});
test('existing identifier diagnostics and JSON protocol prompts remain truthful', () => {
  const diagnostic = readFileSync(
    resolve('scripts/public-benchmark/public-benchmark.mjs'),
    'utf8'
  ).match(
    /`platform id "\$\{platform\.id\}" must be "jovie" or "platform-<letter>"`/u
  )?.[0];
  const prompt = readFileSync(
    resolve('scripts/screenshot-loop/screenshot-bug-loop.mjs'),
    'utf8'
  ).match(/const CLASSIFY_PROMPT = `[\s\S]*?`;/u)?.[0];
  assert.ok(diagnostic);
  assert.ok(prompt && prompt.includes('"product":"jovie"'));
  for (const source of [
    `throw new TypeError(${diagnostic});`,
    `throw new TypeError(${diagnostic.slice(0, -1)}; welcome to jovie and JOVIE\`);`,
    prompt,
    prompt.replace('Personal photos', 'jovie and JOVIE. Personal photos'),
  ]) {
    assert.deepEqual(scanText(source, { file: 'copy.mjs' }), []);
    const line = source.split('\n').length + 1;
    assert.deepEqual(
      locations(
        source + '\nconst title = "Welcome to jovie and JOVIE";',
        'copy.mjs'
      ),
      [`${line}:casing:jovie`, `${line}:casing:JOVIE`]
    );
  }
});
test('technical spans inside copy preserve neighboring casing errors and lines', () => {
  const source = [
    'const message = \'Use "jovie" or "pnpm jovie login"; welcome to jovie and JOVIE\';',
    'const json = "Use \\"product\\":\\"jovie\\"; welcome to jovie";',
    'const template = `Use \\`jovie login\\` and \\`JOVIE\\`; welcome to JOVIE`;',
    '<p>Use `jovie login` and "jovie"; welcome to jovie and JOVIE</p>;',
    'const quote = \'Say "Welcome to jovie" and "JOVIE welcomes you"\';',
  ].join('\n');
  assert.deepEqual(
    scanText(source, { file: 'copy.tsx' }).map(h => `${h.line}:${h.text}`),
    ['4:jovie', '4:jovie', '4:JOVIE']
  );
  const copy =
    source +
    '\nconst headline = \'Use "pnpm jovie login"; welcome to jovie and JOVIE\';';
  assert.deepEqual(
    scanText(copy, { file: 'copy.tsx' }).map(h => `${h.line}:${h.text}`),
    ['4:jovie', '4:jovie', '4:JOVIE', '6:jovie', '6:JOVIE']
  );
});
test('commit scopes are identifiers; PR and commit text is still checked', () => {
  assert.equal(stripCommitScopes('chore(jovie): fix Jovy'), 'chore: fix Jovy');
  assert.deepEqual(
    kinds(stripCommitScopes('feat(jovie): welcome to Jovy'), 'm.md'),
    ['misspelling:Jovy']
  );
});
test('real names and agent exemptions are occurrence-specific', () => {
  assert.deepEqual(kinds('Jovan, Joves and Bon Jovi'), []);
  assert.deepEqual(kinds('Summer Jovi meets Jovi. Jovi coach meets Jovi.'), [
    'jovi-outside-agent-context:Jovi',
    'jovi-outside-agent-context:Jovi',
  ]);
  assert.deepEqual(
    kinds('AI Agent welcomes Jovi. Jovi Technology meets Jovi.'),
    [
      'jovi-outside-agent-context:Jovi',
      'jovi-outside-agent-context:Jovi',
      'jovi-outside-agent-context:Jovi',
    ]
  );
});
test('domains share prose filtering; URLs and code identifiers remain literal', () => {
  assert.deepEqual(
    kinds('Use `jovie.com` and ``jovie.io``; https://jovie.com/path'),
    []
  );
  assert.deepEqual(kinds('Visit jovie.com and jovie.io'), [
    'domain:jovie.com',
    'domain:jovie.io',
  ]);
  assert.deepEqual(kinds('ci@jovie.com, app.jovie.com and test.jovie.com'), []);
});
test('external-company domain exceptions attach to each occurrence', () => {
  assert.deepEqual(
    kinds('The childcare franchise is at jovie.com, but Jovie is at jovie.io.'),
    ['domain:jovie.io']
  );
  assert.deepEqual(
    kinds(
      'Jovie is at jovie.com, but the childcare franchise is at jovie.com.'
    ),
    ['domain:jovie.com']
  );
  assert.deepEqual(
    kinds(
      'The childcare franchise is at jovie.com, but Jovie is at jovie.com.'
    ),
    ['domain:jovie.com']
  );
  assert.deepEqual(kinds('Unrelated product updates are at jovie.io.'), [
    'domain:jovie.io',
  ]);
  assert.deepEqual(kinds('Unrelated product updates are at jovie.com.'), [
    'domain:jovie.com',
  ]);
  assert.deepEqual(
    kinds('jovie.com is the childcare franchise; Jovie uses jovie.io.'),
    ['domain:jovie.io']
  );
  assert.deepEqual(kinds('Bright Horizons uses jovie.com.'), []);
  assert.deepEqual(kinds('The childcare franchise is at jovie.io.'), [
    'domain:jovie.io',
  ]);
});
test('source-backed childcare references preserve neighboring wrong domains', () => {
  for (const file of [
    'apps/web/app/llms-full.txt/route.ts',
    'apps/web/app/llms.txt/route.ts',
    'apps/web/content/published-claims.ts',
    'apps/web/lib/agent/site-llms-guidance.ts',
  ]) {
    const line = readFileSync(resolve(file), 'utf8')
      .split('\n')
      .find(line => /jovie\.com\b/u.test(line));
    assert.ok(line, file);
    assert.deepEqual(kinds(line), [], file);
    for (const domain of ['jovie.com', 'jovie.io']) {
      assert.deepEqual(
        kinds(`${line} Visit ${domain} for Jovie.`),
        [`domain:${domain}`],
        file
      );
      assert.deepEqual(
        kinds(`Jovie uses ${domain}. ${line}`),
        [`domain:${domain}`],
        file
      );
    }
    assert.deepEqual(
      kinds(line.replace('jovie.com', 'jovie.io')),
      ['domain:jovie.io'],
      file
    );
  }
  assert.deepEqual(
    kinds('jovie.com belongs to Bright Horizons; Jovie uses jovie.com.'),
    ['domain:jovie.com']
  );
  assert.deepEqual(
    kinds('Visit jovie.com. Bright Horizons childcare business is unrelated.'),
    ['domain:jovie.com']
  );
});

test('exact wordmark and machine identifiers preserve same-line and neighboring copy checks', () => {
  /** @type {Array<[string, (span: string) => string]>} */
  const cases = [
    [
      'apps/web/app/brand/page.tsx',
      span => `<section>${span}<h1>Welcome to jovie and JOVIE</h1></section>;`,
    ],
    [
      'apps/web/components/organisms/home-loop/fixtures.ts',
      span =>
        `const copy = { summary: '${span}', title: 'Welcome to jovie and JOVIE' };`,
    ],
    [
      'apps/web/lib/tracking/fire-subscribe-event.ts',
      span =>
        `const pixels = [{ ${span}, title: 'Welcome to jovie and JOVIE' }];`,
    ],
  ];
  for (const [file, wrap] of cases) {
    const exception = EXCEPTIONS.find(e => e.file === file);
    assert.ok(exception && exception.reason.trim(), file);
    const source = readFileSync(resolve(file), 'utf8');
    assert.ok(source.includes(exception.match), file);
    assert.deepEqual(scanText(source, { file }), [], file);
    const fixture = wrap(exception.match);
    assert.deepEqual(
      locations(fixture + '\nconst title = "Welcome to jovie";', file),
      ['1:casing:jovie', '1:casing:JOVIE', '2:casing:jovie'],
      file
    );
    assert.ok(scanText(fixture, { file: 'other.tsx' }).length > 2, file);
    assert.ok(
      scanText(fixture.replace(/JOVIE|jovie/u, 'Jovee'), { file }).some(
        h => h.text === 'Jovee'
      ),
      file
    );
  }
});

test('the real landing-page CLI command stays literal with adjacent brand checks', () => {
  const file = 'apps/web/components/marketing/CliLandingPage.tsx';
  const line = readFileSync(resolve(file), 'utf8')
    .split('\n')
    .find(line => line.includes('or run jovie init'));
  assert.ok(line);
  assert.deepEqual(kinds(`const copy = { ${line} };`, 'copy.ts'), []);
  assert.deepEqual(
    kinds(
      `const copy = { ${line} title: 'Welcome to jovie and JOVIE' };`,
      'copy.ts'
    ),
    ['casing:jovie', 'casing:JOVIE']
  );
});

test('YAML names are checked as titles, while identifier casing stays valid', () => {
  assert.deepEqual(kinds('name: Jovy', 'a.yml'), ['misspelling:Jovy']);
  assert.deepEqual(kinds('name: Welcome to Jovies', 'a.yml'), [
    'misspelling:Jovies',
  ]);
  assert.deepEqual(kinds('name: @jovie/web', 'a.yml'), []);
});
test('frozen exceptions excuse only the exact text and validate reasons', () => {
  const options = {
    file: 'a.md',
    exceptions: [
      {
        file: 'a.md',
        match: 'A frozen jovie quote',
        reason: 'Verbatim source quotation',
      },
    ],
  };
  assert.deepEqual(
    scanText('A frozen jovie quote and jovie typo', options).map(h => h.text),
    ['jovie']
  );
  assert.equal(
    scanText('A frozen jovie quote and jovie typo', options)[0].context,
    'A frozen jovie quote and jovie typo'
  );
  assert.deepEqual(
    scanText('An edited jovie quote', options).map(h => h.text),
    ['jovie']
  );
  assert.throws(
    () =>
      scanText('jovie', {
        exceptions: [{ file: 'a.md', match: 'jovie', reason: '  ' }],
      }),
    /reason/
  );
});

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'brand-name-test-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
    cwd: root,
  });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  return root;
};
const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const put = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};
const commit = root => {
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
};

// Run the real CLI in an isolated checkout with no origin/main fallback.
const cliRepo = () => {
  const root = repo();
  for (const file of [
    'scripts/anti-slop/brand-name.mjs',
    'scripts/anti-slop/brand-name.exceptions.json',
    'scripts/anti-slop/lib.mjs',
    'scripts/anti-slop/run.mjs',
    'scripts/design-frontend-skill-check.mjs',
  ])
    put(root, file, readFileSync(resolve(file)));
  put(root, 'docs/design-system/anti-slop-rules.json', '{"rules":[]}');
  return root;
};
const cli = (root, entry, args) =>
  spawnSync(process.execPath, [join(root, entry), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
test('only root historical files are excluded in explicit and diff CLI modes', () => {
  const root = cliRepo();
  put(root, 'CHANGELOG.md', 'Jovy historical');
  put(root, 'pnpm-lock.yaml', 'Jovy generated');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  put(root, 'docs/CHANGELOG.md', 'Welcome to Jovy');
  put(root, 'docs/pnpm-lock.yaml', 'Jovy newly authored');
  commit(root);
  const entry = 'scripts/anti-slop/brand-name.mjs';
  assert.equal(
    cli(root, entry, ['--files', 'CHANGELOG.md', 'pnpm-lock.yaml']).status,
    0
  );
  for (const args of [
    ['--files', 'docs/CHANGELOG.md', 'docs/pnpm-lock.yaml'],
    ['--diff-base', base],
  ]) {
    const result = cli(root, entry, args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /misspelling "Jovy" docs\/CHANGELOG.md:1/u);
    assert.match(result.stderr, /misspelling "Jovy" docs\/pnpm-lock.yaml:1/u);
    assert.equal(result.stderr.split('\n').filter(Boolean).length, 2);
  }
});
test('integrated CLI stops when missing-only or binary-only files are filtered', () => {
  const root = cliRepo();
  put(root, 'payload.dat', 'Jovy\0binary');
  put(root, 'image.png', 'Jovy');
  for (const files of [['missing.md'], ['payload.dat'], ['image.png']]) {
    const result = cli(root, 'scripts/anti-slop/run.mjs', [
      'check',
      '--files',
      ...files,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
test('integrated CLI still runs the frontend checker for nonempty eligible input', () => {
  const root = cliRepo();
  const file = 'apps/web/styles/brand.css';
  put(root, file, 'div { transition: all 1s; }');
  const result = cli(root, 'scripts/anti-slop/run.mjs', [
    'check',
    '--files',
    'missing.md',
    file,
  ]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /ERROR FS-004.*brand\.css:1/u);
  put(root, file, 'div { transition: opacity 1s; }');
  const clean = cli(root, 'scripts/anti-slop/run.mjs', [
    'check',
    '--files',
    file,
  ]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /\[frontend-skill\] 0 error\(s\)/u);
});
test('repo and explicit file scans share binary, deleted and deliberate fixture filtering', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovy');
  put(root, 'blob.dat', 'Jovy\0payload');
  put(root, 'image.png', 'Jovy');
  put(root, 'scripts/anti-slop/brand-name.mjs', 'Jovy');
  put(root, 'docs/design-system/anti-slop-rules.json', 'Jovy');
  put(root, 'deleted.md', 'Jovy');
  git(root, 'add', '.');
  rmSync(join(root, 'deleted.md'));
  const files = [
    'copy.md',
    'blob.dat',
    'image.png',
    'scripts/anti-slop/brand-name.mjs',
    'docs/design-system/anti-slop-rules.json',
    'deleted.md',
  ];
  assert.deepEqual(scanRepo(root), scanFiles(files, root));
  assert.deepEqual(
    scanFiles(files, root).map(h => h.file),
    ['copy.md']
  );
  assert.deepEqual(
    scanFiles([join(root, 'copy.md')], root),
    scanFiles(['copy.md'], root)
  );
  const registry = {
    rules: [
      {
        id: 'ASR-001',
        severity: 'block',
        enforcement: { matchers: [{ pattern: 'Jovy', flags: 'gu' }] },
      },
    ],
  };
  assert.deepEqual(runMatchers(registry, ['blob.dat', 'deleted.md'], root), []);
  assert.equal(runMatchers(registry, ['copy.md'], root).length, 1);
});

test('diff scans real committed files with fence state, exact exceptions and line attribution', () => {
  const root = repo();
  const file = 'a spaced "quoted" \\ file.md';
  put(root, file, 'Jovy existing\n```text\nold command\n```\nold tail\n');
  put(root, 'deleted.md', 'Jovy');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  put(
    root,
    file,
    'Jovy existing\n```text\nJovy in code\n```\nJovee added\nJovy also added\n'
  );
  put(root, 'new.md', '~~~\nJovy code\n~~~\nJovies prose\n');
  const quote = readFileSync(
    new URL('../../../canon/PRODUCT.md', import.meta.url),
    'utf8'
  ).match(
    /\*\*EVENT:\*\* Tim White, 2026-10-20: "jovie[\s\S]*?DS and IA\."/u
  )[0];
  put(root, 'canon/PRODUCT.md', quote + '\nJovy outside quote\n');
  put(root, 'data.bin', 'Jovy\0binary');
  rmSync(join(root, 'deleted.md'));
  commit(root);
  assert.deepEqual(
    scanDiff(base, root).map(({ file, line, text }) => ({ file, line, text })),
    [
      { file, line: 5, text: 'Jovee' },
      { file, line: 6, text: 'Jovy' },
      { file: 'canon/PRODUCT.md', line: 7, text: 'Jovy' },
      { file: 'new.md', line: 4, text: 'Jovies' },
    ]
  );
});

test('CI selects the guard for code and arbitrary text extensions and discovers real assertions', () => {
  const guard = selectSourceGuards('pull_request', ['README.md']).find(
    g => g.id === 'anti-slop'
  );
  assert.ok(guard.command.includes('node scripts/anti-slop/brand-name.mjs'));
  assert.ok(
    guard.command.includes(
      'node --test --test-concurrency=1 --test-isolation=none scripts/anti-slop/anti-slop.test.mjs'
    )
  );
  assert.ok(!guard.command.includes(BRAND_NAME_COVERAGE_COMMAND));

  for (const path of [
    'apps/web/a.tsx',
    'apps/desktop/a.swift',
    'packages/ui/a.ts',
    'assets/copy.custom',
    'README.md',
  ]) {
    assert.ok(
      selectSourceGuards('pull_request', [path]).some(
        g => g.id === 'anti-slop'
      ),
      path
    );
  }
  assert.ok(
    SCRIPT_CONTRACT_VITEST_TESTS.includes(
      'scripts/lib/__tests__/brand-name.test.mjs'
    )
  );
  assert.ok(
    selectScriptContracts(['scripts/anti-slop/brand-name.mjs']).vitest.includes(
      'scripts/lib/__tests__/brand-name.test.mjs'
    )
  );
});

test('file CLI and integrated check safely ignore deliberate registry text and deleted files', () => {
  const script = resolve('scripts/anti-slop/brand-name.mjs');
  const files = [
    'docs/design-system/anti-slop-rules.json',
    'scripts/anti-slop/missing.md',
  ];
  /** @type {Array<[string, string[]]>} */
  const entries = [
    [script, ['--files', ...files]],
    [resolve('scripts/anti-slop/run.mjs'), ['check', '--files', ...files]],
  ];
  for (const [entry, args] of entries) {
    const result = spawnSync(process.execPath, [entry, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

function metadataStep() {
  const workflow =
    /** @type {{jobs: {deterministic: {steps: Array<{name?: string, run?: string}>}}}} */ (
      yamlLoad(
        readFileSync(resolve('.github/workflows/source-validation.yml'), 'utf8')
      )
    );
  const step = workflow.jobs.deterministic.steps.find(
    s => s.name === 'Check brand spelling in PR text and commit messages'
  );
  assert.ok(step && typeof step.run === 'string');
  return step;
}

function putGuardSources(root) {
  const source = resolve('scripts/anti-slop');
  for (const name of readdirSync(source).filter(n =>
    /\.(?:mjs|json)$/u.test(n)
  ))
    put(root, `scripts/anti-slop/${name}`, readFileSync(join(source, name)));
}

function runMetadata(root, title, body, head) {
  const step = metadataStep();
  assert.ok(!step.run.includes('${{'));
  const temp = join(root, 'runner-temp');
  mkdirSync(temp);
  const result = spawnSync('bash', ['-c', step.run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RUNNER_TEMP: temp,
      BASE_BRANCH: 'main',
      HEAD_SHA: head,
      PR_TITLE: title,
      PR_BODY: body,
    },
  });
  return { temp, result };
}

test('Source Validation isolates title, body and each commit using only the trusted guard', () => {
  const root = repo();
  putGuardSources(root);
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'checkout', '-qb', 'feature');
  git(root, 'commit', '--allow-empty', '-qm', 'feat: fix Jovy');
  const head = git(root, 'rev-parse', 'HEAD');
  // A PR-controlled guard must never be executed by this workflow.
  put(
    root,
    'scripts/anti-slop/brand-name-messages.mjs',
    'throw new Error("PR CONTROLLED CODE EXECUTED");'
  );
  const { temp, result } = runMetadata(
    root,
    'Safe title',
    '```\nunclosed body fence',
    head
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Jovy/u);
  assert.doesNotMatch(result.stderr, /PR CONTROLLED CODE EXECUTED/u);
  assert.deepEqual(readdirSync(temp), []);
});

test('metadata scans isolate fence state and attribute each section and commit', async () => {
  const { scanPullRequestText } = await import(
    '../../anti-slop/brand-name-messages.mjs'
  );
  const root = repo();
  put(root, 'a.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  git(
    root,
    'commit',
    '--allow-empty',
    '-qm',
    '```\nfirst commit with an unclosed fence'
  );
  git(root, 'commit', '--allow-empty', '-qm', 'feat(jovie): repair Jovy');
  const head = git(root, 'rev-parse', 'HEAD');
  const hits = scanPullRequestText({
    root,
    base,
    head,
    title: '```',
    body: 'Jovee in body',
  });
  assert.deepEqual(
    hits.map(h => h.text),
    ['Jovee', 'Jovy']
  );
  assert.equal(hits[0].file, 'PR body');
  assert.equal(hits[1].file, `commit ${head}`);
});

test('CLI modes return failures with exact locations and clean scans return success', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    assert.equal(runBrandName([], root), 0);
    assert.match(out.mock.calls.flat().join(''), /0 hits; no baseline/u);
    put(root, 'copy.md', 'Jovy');
    commit(root);
    assert.equal(runBrandName(['--list'], root), 1);
    assert.equal(runBrandName(['--files', 'copy.md'], root), 1);
    assert.equal(runBrandName(['--diff-base', base], root), 1);
    assert.equal(runBrandName(['--text-file', join(root, 'copy.md')], root), 1);
    assert.match(err.mock.calls.flat().join(''), /copy.md:1/u);
    put(root, 'copy.md', 'Jovie');
    commit(root);
    assert.equal(runBrandName(['--files', 'copy.md'], root), 0);
    assert.equal(runBrandName(['--diff-base', base], root), 0);
    assert.equal(runBrandName(['--text-file', join(root, 'copy.md')], root), 0);
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
});

test('metadata CLI returns a failing verdict for prose and a clean verdict for empty sections', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    assert.equal(
      runMessages([base, base], { root, title: 'Jovy', body: 'Safe' }),
      1
    );
    assert.match(err.mock.calls.flat().join(''), /PR title:1.*Jovy/u);
    assert.equal(
      runMessages([base, base], { root, title: 'Jovie', body: '' }),
      0
    );
    assert.deepEqual(scanPullRequestText({ root, base, head: base }), []);
    assert.throws(() => runMessages([]), /full head SHA/u);
    assert.throws(() => runMessages([base, 'bad']), /full head SHA/u);
  } finally {
    err.mockRestore();
  }
});

test('only skill frontmatter slugs are identifiers; names in other contexts remain checked', () => {
  assert.deepEqual(
    kinds(
      '---\nname: jovie\ndescription: Jovy title\n---\nname: jovie',
      'skills/example/SKILL.md'
    ),
    ['misspelling:Jovy', 'casing:jovie']
  );
  assert.deepEqual(kinds('---\nname: Jovies\n---', 'skills/example/SKILL.md'), [
    'misspelling:Jovies',
  ]);
  assert.deepEqual(kinds('name: jovie', 'other.md'), ['casing:jovie']);
  assert.deepEqual(kinds('---\nname: jovie', 'skills/example/SKILL.md'), [
    'casing:jovie',
  ]);
});

test('fences respect delimiter type and length, including embedded shorter fences', () => {
  assert.deepEqual(kinds('````text\n```\nJovy\n~~~\n````\nJovee'), [
    'misspelling:Jovee',
  ]);
  assert.deepEqual(
    kinds('~~~text\nJovy\n~~~ trailing text\nJovy\n~~~\nJovee'),
    ['misspelling:Jovee']
  );
});

test('the committed quote and intentional negative assertion do not exempt neighboring typos', () => {
  for (const file of [
    'canon/PRODUCT.md',
    'apps/web/tests/unit/marketing/header-brand-config.test.ts',
  ]) {
    const e = EXCEPTIONS.find(e => e.file === file);
    assert.ok(e.reason.trim());
    assert.deepEqual(
      scanText(e.match + ' Jovy', { file }).map(h => h.text),
      ['Jovy']
    );
    assert.ok(
      scanText(e.match.replace(/jovie|Jovies/u, 'Jovee'), { file }).some(
        h => h.text === 'Jovee'
      )
    );
  }
});

test('safe file reading ignores directories and surfaces unexpected IO errors', () => {
  const root = repo();
  assert.equal(readScanFile('.', root), null);
  assert.throws(() => readScanFile('x\0bad', root), /null bytes/u);
});

test('guard source exclusions apply only to exact owned paths and leave other matchers intact', () => {
  const root = repo();
  put(root, 'content/brand-name.mjs', 'Jovy');
  put(root, 'content/anti-slop-rules.json', 'Jovee');
  put(root, 'docs/CHANGELOG.md-preview.ts', 'Jovy');
  put(root, 'pnpm-lock.yaml-note.md', 'Jovee');
  put(root, 'scripts/anti-slop/brand-name.mjs', 'Jovy\nJovy');
  assert.deepEqual(
    scanFiles(
      [
        'content/brand-name.mjs',
        'content/anti-slop-rules.json',
        'docs/CHANGELOG.md-preview.ts',
        'pnpm-lock.yaml-note.md',
      ],
      root
    ).map(h => h.text),
    ['Jovy', 'Jovee', 'Jovy', 'Jovee']
  );
  const reg = {
    rules: [
      {
        id: 'ASR-001',
        severity: 'block',
        enforcement: { matchers: [{ pattern: 'Jovy', flags: 'gu' }] },
      },
    ],
  };
  assert.deepEqual(
    runMatchers(reg, ['scripts/anti-slop/brand-name.mjs'], root).map(
      h => h.line
    ),
    [1, 2]
  );
});

test('Source Validation skips adoption only while the helper is absent on the trusted base', () => {
  const root = repo();
  put(root, 'readme.md', 'Jovie');
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  const head = git(root, 'rev-parse', 'HEAD');
  const { temp, result } = runMetadata(root, 'Jovy', 'Jovy', head);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /guard not on main yet; skipping/u);
  assert.deepEqual(readdirSync(temp), []);
});

test('Source Validation treats shell metacharacters in PR text as data and cleans up on success', () => {
  const root = repo();
  putGuardSources(root);
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  const head = git(root, 'rev-parse', 'HEAD');
  const sentinel = join(root, 'must-not-exist');
  const { temp, result } = runMetadata(
    root,
    `Jovie $(touch '${sentinel}')`,
    `Jovie \`touch '${sentinel}'\``,
    head
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readScanFile(sentinel, root), null);
  assert.deepEqual(readdirSync(temp), []);
});

test('all prose capitalization variants are checked while the canonical spelling passes', () => {
  for (let bits = 0; bits < 32; bits += 1) {
    const variant = [...'jovie']
      .map((c, i) => (bits & (1 << i) ? c.toUpperCase() : c))
      .join('');
    assert.deepEqual(
      kinds(`Welcome to ${variant}.`),
      variant === 'Jovie' ? [] : [`casing:${variant}`]
    );
  }
});

test('bare public subdomains are checked while emails, fixture domains and URLs remain identifiers', () => {
  assert.deepEqual(kinds('Visit www.jovie.com and www.jovie.io'), [
    'domain:jovie.com',
    'domain:jovie.io',
  ]);
  assert.deepEqual(
    kinds(
      'ci@www.jovie.com app.jovie.com test.jovie.com https://www.jovie.com/a'
    ),
    []
  );
});

test('immutable commit exceptions apply only to the exact evidenced span and commit identity', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const quoted = 'Negative spelling examples: Jovy and Jovies.';
  git(root, 'commit', '--allow-empty', '-qm', quoted);
  const head = git(root, 'rev-parse', 'HEAD');
  const exceptions = [
    {
      file: `commit ${head}`,
      match: quoted,
      reason: 'Exact negative examples in this immutable fixture commit.',
    },
  ];
  assert.deepEqual(scanPullRequestText({ root, base, head, exceptions }), []);
  assert.deepEqual(
    scanPullRequestText({
      root,
      base,
      head,
      exceptions,
      title: 'Jovy',
      body: 'Jovies',
    }).map(h => h.file),
    ['PR title', 'PR body']
  );
  git(root, 'commit', '--allow-empty', '-qm', quoted);
  const next = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(
    scanPullRequestText({ root, base: head, head: next, exceptions }).map(
      h => h.text
    ),
    ['Jovy', 'Jovies']
  );
});

test('the published implementation commit freezes only its original negative examples', () => {
  const file = 'commit 3ce9dca0e29780a21a36e524aa251c8092abdb51';
  const exception = EXCEPTIONS.find(e => e.file === file);
  assert.ok(exception && exception.reason.trim());
  assert.deepEqual(scanText(exception.match, { file, prose: true }), []);
  assert.deepEqual(
    scanText(exception.match + '\nJovy', { file, prose: true }).map(
      h => h.text
    ),
    ['Jovy']
  );
  assert.ok(
    scanText(exception.match, { file: 'PR body', prose: true }).length > 0
  );
});

test('existing CLI source stays literal and adjacent named copy is still checked', () => {
  const source = readFileSync(resolve('packages/jovie-cli/src/cli.ts'), 'utf8');
  assert.ok(source.includes('Usage: jovie <command> [options]'));
  assert.deepEqual(scanText(source, { file: 'renamed-source.ts' }), []);
  const line = source.split('\n').length + 1;
  assert.deepEqual(
    locations(
      source + '\nexport const headline = "Welcome to jovie";',
      'renamed-source.ts'
    ),
    [`${line}:casing:jovie`]
  );
});

test('internal diagnostics and protocol strings do not become copy from whitespace', () => {
  assert.deepEqual(kinds('const internal = "Jovy at jovie.io";', 'a.ts'), [
    'misspelling:Jovy',
    'domain:jovie.io',
  ]);
  const source = [
    'test("jovie auth protocol", () => {});',
    'throw new Error("Invalid jovie work feed request");',
    'const protocol = { command: "jovie mesh send", product: "jovie" };',
    'const query = "loading jovie profile";',
    '<h1>Welcome to JOVIE</h1>;',
    'export const headline = "Welcome to jovie";',
  ].join('\n');
  assert.deepEqual(locations(source, 'arbitrary.tsx'), [
    '5:casing:JOVIE',
    '6:casing:jovie',
  ]);
});
