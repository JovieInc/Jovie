import assert from 'node:assert/strict';
import { test } from 'vitest';
import { scanText } from '../../anti-slop/brand-name.mjs';

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
