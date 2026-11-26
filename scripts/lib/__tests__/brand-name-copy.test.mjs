import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import {
  EXCEPTIONS,
  scanText,
  stripCommitScopes,
} from '../../anti-slop/brand-name.mjs';

const locations = (text, file) =>
  scanText(text, { file }).map(h => `${h.line}:${h.kind}:${h.text}`);
const kinds = (text, file = 'a.md') =>
  scanText(text, { file }).map(h => `${h.kind}:${h.text}`);

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

test('compatibility host identifiers stay literal while adjacent domain copy is checked', () => {
  const file = 'apps/web/lib/leads/buyer-signal-rules.ts';
  const source = "export const JOVIE_HOSTS = ['jov.ie', 'jovie.com'];";
  assert.deepEqual(kinds(source, file), []);
  assert.deepEqual(kinds(source + "\nconst title = 'Visit jovie.com';", file), [
    'domain:jovie.com',
  ]);
  assert.deepEqual(kinds(source.replace('jovie.com', 'jovie.io'), file), [
    'domain:jovie.io',
  ]);
  assert.deepEqual(kinds(source, 'other.ts'), ['domain:jovie.com']);
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
