import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import type { JudgeTransport } from '../../packages/copy/judge.ts';
import { runContentCli } from './cli.mts';
import {
  type Draft,
  diagnoseSpokenRead,
  digest,
  generateProject,
  type Project,
  preserveLocks,
  type Research,
  readHistory,
  renderProject,
  saveRevision,
  setLock,
  validateDraft,
  validatePlan,
  validateResearch,
  validateReview,
} from './project.mts';

const dirs: string[] = [];
function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'content-os-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const plan = {
  question: 'Is this a consistent rule?',
  hypotheses: ['Bias', 'Relevant context'],
  queries: ['evidence', 'counterevidence'],
};
const research: Research = {
  sources: [
    {
      id: 'S1',
      title: 'Study',
      url: 'https://example.org/study',
      evidence: 'Observed a difference.',
    },
    {
      id: 'S2',
      title: 'Replication',
      url: 'https://example.org/replication',
      evidence: 'Context explained part of it.',
    },
  ],
  claims: [
    {
      id: 'C1',
      kind: 'factual',
      text: 'A difference was observed.',
      confidence: 'medium',
      sourceIds: ['S1', 'S2'],
      counterevidence: 'Context differs.',
    },
    {
      id: 'C2',
      kind: 'normative',
      text: 'Use a consistent rule.',
      confidence: 'medium',
      sourceIds: [],
      counterevidence: 'Context still matters.',
    },
  ],
  founderRevisions: ['Rejected the claim that all differences are hypocrisy.'],
  provisionalThesis: 'People are biased.',
};
const review = {
  symmetryTest: {
    namelessCase: 'Company A and B did the same act.',
    rule: 'Compare the same evidence.',
    result: 'Keep context fixed.',
  },
  strongestCounterargument:
    'Different context can justify a different response.',
  thesis: 'Test the rule while retaining relevant context.',
  revisionReason: 'The original thesis overstated bias.',
};
const draft: Draft = {
  title: 'Run your morality as a unit test',
  essay: 'Context changes the interpretation. [C1]',
  spoken: [
    { id: 'B1', text: 'Before the test.', claimIds: [] },
    { id: 'B2', text: ' Keep this exact.\r\nCafé 😎  ', claimIds: ['C2'] },
    { id: 'B3', text: 'After the test.', claimIds: ['C1'] },
  ],
  broll: ['A walk while considering the rule.'],
};
function transport(
  replies: unknown[],
  requests: Parameters<JudgeTransport>[0][] = []
): JudgeTransport {
  return async request => {
    requests.push(request);
    assert.ok(replies.length, 'Unexpected model call');
    return JSON.stringify(replies.shift());
  };
}
async function project(): Promise<Project> {
  return generateProject({
    rawInput: 'Everyone is a hypocrite.',
    canon: { character: { id: 'character:tim-white' } },
    voice: 'founder-tim',
    model: 'openai/test',
    send: transport([plan, research, review, draft]),
  });
}

test('runs research before a genuinely revisable thesis and persists the complete cited package', async () => {
  const requests: Parameters<JudgeTransport>[0][] = [];
  const result = await generateProject({
    rawInput: 'Founder hypothesis',
    canon: { id: 'character:tim-white' },
    voice: 'voice',
    model: 'openai/test',
    send: transport([plan, research, review, draft], requests),
  });
  assert.equal(requests.length, 4);
  assert.equal(requests[0].webSearch, false);
  assert.equal(requests[1].webSearch, true);
  assert.ok(!requests[1].prompt.includes(review.thesis));
  assert.ok(requests[2].prompt.includes(research.provisionalThesis));
  assert.notEqual(result.review.thesis, result.research.provisionalThesis);
  const dir = directory();
  saveRevision(dir, result);
  assert.deepEqual(readHistory(dir), [result]);
  const rendered = renderProject(result);
  for (const expected of [
    'Claim ledger',
    'Strongest counterargument',
    'Essay',
    'Spoken vlog',
    'Table-read diagnostics (advisory)',
    'https://example.org/study',
  ])
    assert.ok(rendered.includes(expected));
});

test('locks survive two regenerations byte-for-byte while unlocked transitions change', async () => {
  let current = setLock(await project(), 'B2', true);
  const original = Buffer.from(current.locks[0].text);
  for (let iteration = 1; iteration <= 2; iteration++) {
    const proposed = structuredClone(draft);
    proposed.spoken[0].text = `Repaired entrance ${iteration}.`;
    proposed.spoken[1].text = 'Model tried to rewrite the anchor';
    proposed.spoken[1].claimIds = ['C1'];
    proposed.spoken[2].text = `Repaired exit ${iteration}.`;
    const requests: Parameters<JudgeTransport>[0][] = [];
    current = await generateProject({
      rawInput: current.rawInput,
      canon: current.canon,
      voice: 'voice',
      model: current.model,
      previous: current,
      feedback: 'Repair the transitions.',
      send: transport([review, proposed], requests),
    });
    assert.deepEqual(Buffer.from(current.draft.spoken[1].text), original);
    assert.deepEqual(current.draft.spoken[1].claimIds, ['C2']);
    assert.equal(
      current.draft.spoken[0].text,
      `Repaired entrance ${iteration}.`
    );
    assert.ok(
      requests[1].prompt.includes(JSON.stringify(current.locks[0].text))
    );
    assert.ok(
      requests[0].prompt.includes(JSON.stringify(current.locks[0].text))
    );
    assert.ok(requests.every(request => !request.webSearch));
  }
  assert.equal(setLock(current, 'B2', false).locks.length, 0);
});

test('missing, duplicated and reordered anchors fail rather than silently losing locks', async () => {
  const locks = (await project()).draft.spoken.slice(0, 2);
  for (const spoken of [
    [],
    [locks[0], locks[0], locks[1]],
    [...locks].reverse(),
  ])
    assert.throws(
      () => preserveLocks({ ...draft, spoken }, locks),
      /locked anchor/
    );
  assert.throws(
    () => setLock({ locks: [], draft } as Project, 'B99', true),
    /Unknown spoken block/
  );
});

test('repairs an unsourced research claim once and retains the global canon on regeneration', async () => {
  const invalid = structuredClone(research);
  invalid.claims[0].sourceIds = [];
  const requests: Parameters<JudgeTransport>[0][] = [];
  const first = await generateProject({
    rawInput: 'Hypothesis',
    canon: { id: 'character:tim-white' },
    voice: 'voice',
    model: 'openai/test',
    send: transport([plan, invalid, research, review, draft], requests),
  });
  assert.equal(requests.length, 5);
  assert.ok(requests[2].prompt.includes('Unsourced claim C1'));
  assert.equal(requests[2].webSearch, true);
  const next = await generateProject({
    rawInput: first.rawInput,
    canon: { id: 'local-imposter' },
    previous: first,
    voice: 'voice',
    model: first.model,
    send: transport([review, draft]),
  });
  assert.deepEqual(next.canon, first.canon);
  const dir = directory();
  const errors: string[] = [];
  assert.equal(
    await runContentCli(['script', 'idea', '--output', dir], {
      send: transport([plan, invalid, invalid]),
      stdout: () => {},
      stderr: message => errors.push(message),
    }),
    1
  );
  assert.ok(errors.at(-1)?.includes('Unsourced claim C1'));
  assert.throws(() => readHistory(dir), /ENOENT/);
});

test('rejects incomplete research, unsupported claims, invalid citations and malformed editorial review', () => {
  assert.throws(() => validatePlan({ ...plan, hypotheses: ['one'] }));
  for (const patch of [
    { sources: [] },
    { sources: [research.sources[0], research.sources[0]] },
    { claims: [{ ...research.claims[0], sourceIds: [] }] },
    { claims: [{ ...research.claims[0], sourceIds: ['S99'] }] },
    { claims: [{ ...research.claims[0], confidence: 'certain' }] },
    {
      sources: [
        { ...research.sources[0], url: 'file:///etc/passwd' },
        research.sources[1],
      ],
    },
  ])
    assert.throws(() =>
      validateResearch({ ...research, ...patch } as Research)
    );
  assert.throws(() =>
    validateDraft({ ...draft, essay: 'No citations' }, research)
  );
  assert.throws(() => validateDraft({ ...draft, essay: '[C99]' }, research));
  assert.throws(() =>
    validateDraft(
      { ...draft, spoken: [{ ...draft.spoken[0], claimIds: ['C99'] }] },
      research
    )
  );
  assert.throws(() =>
    validateReview({ ...review, strongestCounterargument: '' })
  );
  assert.throws(
    () =>
      validateDraft(
        { ...draft, essay: 'Context matters — check it. [C1]' },
        research
      ),
    /Founder voice validation/
  );
});

test('spoken inline citations must resolve and belong to the block claim list', () => {
  for (const block of [
    { id: 'B1', text: 'Context matters. [C99]', claimIds: ['C1'] },
    { id: 'B1', text: 'Context matters. [C1]', claimIds: [] },
    { id: 'B1', text: 'Context matters. [C1] [C2]', claimIds: ['C1'] },
  ])
    assert.throws(
      () => validateDraft({ ...draft, spoken: [block] }, research),
      /spoken citation/
    );
  assert.doesNotThrow(() =>
    validateDraft(
      {
        ...draft,
        spoken: [
          { id: 'B1', text: 'Context matters. [C1]', claimIds: ['C1'] },
          { id: 'B2', text: 'What would change my mind?', claimIds: [] },
        ],
      },
      research
    )
  );
});

test('table-read diagnostics are advisory and preserve locked and multilingual text', () => {
  const sample = {
    ...draft,
    spoken: [
      {
        id: 'B1',
        text: ' First thought.\nCafé stays open. [C1] ',
        claimIds: ['C1'],
      },
      { id: 'B2', text: '你好世界', claimIds: [] },
    ],
  };
  const before = JSON.stringify(sample);
  const report = diagnoseSpokenRead(sample, 120);
  assert.deepEqual(report, {
    wordsPerMinute: 120,
    totalWords: 6,
    estimatedSeconds: 3,
    blocks: [
      { id: 'B1', words: 5, longestSentenceWords: 3, editorialReferences: 1 },
      { id: 'B2', words: 1, longestSentenceWords: 1, editorialReferences: 0 },
    ],
  });
  assert.equal(JSON.stringify(sample), before);
  assert.equal(
    diagnoseSpokenRead({ ...draft, spoken: [] }).estimatedSeconds,
    0
  );
  for (const pace of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    assert.throws(() => diagnoseSpokenRead(sample, pace), /reading pace/);
});

test('history versions lock state, rejects stale writers and detects modified bytes', async () => {
  const dir = directory();
  const first = await project();
  saveRevision(dir, first);
  const locked = setLock(first, 'B2', true);
  saveRevision(dir, locked);
  assert.equal(readHistory(dir)[1].locks[0].id, 'B2');
  assert.throws(
    () => saveRevision(dir, setLock(first, 'B1', true)),
    /changed during generation/
  );
  const log = join(dir, 'project.jsonl');
  const before = readFileSync(log, 'utf8');
  writeFileSync(log, before.replace('Keep this exact', 'Changed this text'));
  assert.throws(() => readHistory(dir), /integrity/);
  writeFileSync(log, before);
  assert.equal(readHistory(dir)[1].parentDigest, digest(first));
});

test('one CLI command consumes a transcript, shows IDs, locks and regenerates without losing the anchor', async () => {
  const dir = directory();
  const input = join(dir, 'voice-note.txt');
  const output = join(dir, 'episode');
  writeFileSync(input, 'A real raw idea.');
  let stdout = '';
  let stderr = '';
  const dependencies = {
    send: transport([plan, research, review, draft]),
    stdout: (s: string) => {
      stdout = s;
    },
    stderr: (s: string) => {
      stderr += s;
    },
  };
  assert.equal(
    await runContentCli(
      ['script', '--input', input, '--output', output, '--json'],
      dependencies
    ),
    0
  );
  assert.equal(JSON.parse(stdout).project.rawInput, 'A real raw idea.');
  assert.equal(
    await runContentCli(['script', 'lock', output, 'B2'], dependencies),
    0
  );
  const proposed = structuredClone(draft);
  proposed.spoken[0].text = 'New entrance.';
  dependencies.send = transport([review, proposed]);
  assert.equal(
    await runContentCli(
      ['script', 'regenerate', output, '--feedback', 'Make it shorter.'],
      dependencies
    ),
    0
  );
  assert.equal(
    await runContentCli(['script', 'show', output, '--json'], dependencies),
    0
  );
  const saved = JSON.parse(stdout) as Project;
  assert.equal(saved.revision, 3);
  assert.equal(saved.draft.spoken[1].text, draft.spoken[1].text);
  assert.ok(stderr.includes('live research'));
  assert.equal(
    await runContentCli(['script', 'unlock', output, 'B2'], dependencies),
    0
  );
  assert.equal(readHistory(output).at(-1)?.locks.length, 0);
});

test('CLI failures never append a partial revision or overwrite an existing episode', async () => {
  const dir = directory();
  saveRevision(dir, await project());
  const before = readFileSync(join(dir, 'project.jsonl'), 'utf8');
  const deps = {
    stdout: (_: string) => {},
    stderr: (_: string) => {},
    send: transport([plan, research, review, draft]),
  };
  for (const args of [
    ['script', 'new idea', '--output', dir],
    ['script', 'regenerate', dir, '--input', 'bad'],
    ['script', '--input', '/missing'],
    ['script', ''],
    ['script', 'idea', '--model', 'zai/nope'],
    ['script', 'idea', '--feedback', 'x'],
    ['script', 'lock', dir, 'B99'],
    ['script', 'idea', 'extra'],
    ['unknown'],
  ])
    assert.equal(await runContentCli(args, deps), 1);
  assert.equal(readFileSync(join(dir, 'project.jsonl'), 'utf8'), before);
  assert.equal(await runContentCli(['--help'], deps), 0);
  assert.equal(
    await runContentCli(['script', 'regenerate', dir], {
      ...deps,
      send: async () => {
        throw new Error('provider offline');
      },
    }),
    1
  );
  assert.equal(readFileSync(join(dir, 'project.jsonl'), 'utf8'), before);
});
