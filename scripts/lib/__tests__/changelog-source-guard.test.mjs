import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COPY_LINT_FROM,
  customerNoteCopyProblems,
  HEADLINE_MAX,
  headlineProblems,
  lintCustomerNoteCopy,
  splitHeadline,
} from '../changelog-filter-rules.mjs';
import { checkEditorialOverlay } from '../customer-changelog-editorial.mjs';
import { resolveRealGh, runWithRealGh } from '../real-gh-harness.mjs';

const guard = fileURLToPath(
  new URL('../../changelog-source-guard.mjs', import.meta.url)
);
let checkout, head, eventPath, localPr, localPrPath;
beforeAll(() => {
  checkout = mkdtempSync(join(tmpdir(), 'changelog-guard-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: checkout, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Guard test');
  git('config', 'user.email', 'guard@example.invalid');
  git('commit', '--allow-empty', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(checkout, 'internal.txt'), 'internal change\n');
  git('add', 'internal.txt');
  git('commit', '-qm', 'head');
  head = git('rev-parse', 'HEAD');
  eventPath = join(checkout, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        number: 20031,
        base: { sha: base },
        head: { sha: head },
        created_at: '2026-10-03T21:00:00Z',
        body: 'outdated event metadata',
      },
    })
  );
  mkdirSync(join(checkout, 'apps/web/lib'), { recursive: true });
  writeFileSync(
    join(checkout, 'apps/web/lib/storefront.ts'),
    'export const country = "jp";\n'
  );
  git('add', 'apps/web/lib/storefront.ts');
  git('commit', '-qm', 'customer change');
  localPr = {
    number: 20031,
    base: { sha: base },
    head: { sha: git('rev-parse', 'HEAD') },
    created_at: '2026-10-03T21:00:00Z',
    body: '## Summary\nStorefront correction\n',
  };
  localPrPath = join(checkout, 'pr.json');
  writeFileSync(localPrPath, JSON.stringify(localPr));
});
afterAll(() => rmSync(checkout, { recursive: true, force: true }));

describe('local customer decision preflight', () => {
  const preflight = (...args) =>
    spawnSync(process.execPath, [guard, ...args], {
      cwd: checkout,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'false',
        GITHUB_EVENT_PATH: '',
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
      },
    });
  it('rejects missing metadata and validates a proposed body without GitHub credentials', () => {
    const red = preflight('--pr-file', localPrPath);
    expect(red.status).not.toBe(0);
    expect(red.stderr).toContain('missing-metadata');
    const bodyPath = join(checkout, 'body.md');
    writeFileSync(
      bodyPath,
      `${localPr.body}\n<!-- customer-changelog/v1 {"releaseWorthy":false} -->`
    );
    const green = preflight('--pr-file', localPrPath, '--body-file', bodyPath);
    expect(green.status, green.stderr).toBe(0);
    expect(JSON.parse(green.stdout)).toEqual({
      passed: true,
      applicable: true,
      reason: 'internal',
    });
  });
  it('lints release-worthy copy for PRs created after the cutoff, with fix-it lines', () => {
    const marker = text =>
      `<!-- customer-changelog/v1 ${JSON.stringify({ issueId: 'JOV-7447', outcomeKey: 'storefront-country', section: 'Changed', audience: 'public', visibility: 'public', releaseWorthy: true, text, availability: { status: 'ga', prerequisites: [] }, evidence: [{ url: 'https://jov.ie/', contains: 'Claim' }] })} -->`;
    const bodyPath = join(checkout, 'copy.md');
    const newPrPath = join(checkout, 'new-pr.json');
    writeFileSync(
      newPrPath,
      JSON.stringify({ ...localPr, created_at: COPY_LINT_FROM })
    );
    writeFileSync(bodyPath, marker('The storefront bug is fixed again.'));
    const red = preflight('--pr-file', newPrPath, '--body-file', bodyPath);
    expect(red.status).not.toBe(0);
    expect(red.stderr).toContain('Customer changelog copy needs a rewrite');
    expect(red.stderr).toContain('text must read "Headline: explanation"');
    expect(red.stderr).toContain('unflattering phrasing "bug"');
    // The same body on a PR opened before the cutoff keeps its contract.
    expect(
      preflight('--pr-file', localPrPath, '--body-file', bodyPath).status
    ).toBe(0);
    writeFileSync(bodyPath, marker(GOOD_COPY));
    expect(
      preflight('--pr-file', newPrPath, '--body-file', bodyPath).status
    ).toBe(0);
  });
  it('rejects duplicate decisions instead of choosing one', () => {
    const bodyPath = join(checkout, 'duplicate.md');
    writeFileSync(
      bodyPath,
      '<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n'.repeat(2)
    );
    const result = preflight('--pr-file', localPrPath, '--body-file', bodyPath);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ambiguous');
  });
  it('rejects stale and absent PR snapshots and a body override without a PR', () => {
    const stalePath = join(checkout, 'stale.json');
    writeFileSync(
      stalePath,
      JSON.stringify({ ...localPr, head: { sha: head } })
    );
    expect(preflight('--pr-file', stalePath).stderr).toContain(
      'Local HEAD differs'
    );
    const emptyPath = join(checkout, 'empty.json');
    writeFileSync(emptyPath, '{}');
    expect(preflight('--pr-file', emptyPath).stderr).toContain(
      'Missing exact PR revision evidence'
    );
    writeFileSync(emptyPath, 'null');
    expect(preflight('--pr-file', emptyPath).stderr).toContain(
      'Missing exact PR revision evidence'
    );
    expect(preflight('--body-file', emptyPath).status).not.toBe(0);
  });
  it('cannot override the hosted CI evidence source', () => {
    const result = spawnSync(
      process.execPath,
      [guard, '--pr-file', localPrPath],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: 'true' },
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Local preflight arguments are unavailable in GitHub Actions'
    );
  });
});

async function run(responses, env = {}, rateLimit = null) {
  let index = 0;
  return runWithRealGh({
    gh: resolveRealGh(),
    script: 'cd "$GUARD_CHECKOUT" && node "$GUARD_SOURCE"',
    env: {
      GUARD_CHECKOUT: checkout,
      GUARD_SOURCE: guard,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      ...env,
    },
    route: path => {
      if (path === 'rate_limit' && rateLimit) return { body: rateLimit() };
      if (path !== 'repos/JovieInc/Jovie/pulls/20031') return null;
      return responses[Math.min(index++, responses.length - 1)];
    },
  });
}
const current = () => ({
  body: {
    head: { sha: head },
    body: '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  },
});

describe('trusted changelog metadata read with real gh', () => {
  it.each([502, 503, 504])(
    'recovers HTTP %i and evaluates current metadata at the exact head',
    async status => {
      const result = await run([
        { status, body: { message: 'temporarily unavailable' } },
        current(),
      ]);
      expect(result.code).toBe(0);
      expect(result.requests).toHaveLength(2);
      expect(JSON.parse(result.stdout)).toMatchObject({ passed: true });
    }
  );
  it('stops after three transient failures without accepting a missing decision', async () => {
    const result = await run([
      { status: 503, body: { message: 'temporarily unavailable' } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(3);
    expect(result.stderr).toContain('HTTP 503');
  });
  it.each([401, 403, 404])('fails HTTP %i immediately', async status => {
    const result = await run([
      { status, body: { message: 'permanent failure' } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(1);
  });
  it('rejects an advanced head after transient recovery', async () => {
    const result = await run([
      { status: 503, body: {} },
      { body: { ...current().body, head: { sha: 'f'.repeat(40) } } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.stderr).toContain('PR head advanced');
  });
  it('does not retry malformed successful metadata', async () => {
    const result = await run([{ body: '{invalid JSON' }]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(1);
  });
});

const quotaExhausted = {
  status: 403,
  body: {
    message:
      'API rate limit exceeded for installation. If you reach out to GitHub Support for help, please include the request ID.',
  },
};
const resetIn = seconds => () => ({
  resources: {
    core: {
      remaining: 0,
      reset: Math.ceil(Date.now() / 1000) + seconds,
    },
    graphql: { remaining: 1000, reset: Math.ceil(Date.now() / 1000) + 3600 },
  },
});

describe('GitHub quota is never a changelog verdict', () => {
  it('spends no API call on a first attempt and judges the event body', async () => {
    const result = await run([current()], { GITHUB_RUN_ATTEMPT: '1' });
    expect(result.requests).toHaveLength(0);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: true });
  });
  it('defers at once on a re-run that hits the exhausted quota, holding no runner', async () => {
    const result = await run(
      [quotaExhausted, current()],
      { GITHUB_RUN_ATTEMPT: '2' },
      resetIn(3000)
    );
    expect(result.requests.filter(r => !r.endsWith('rate_limit'))).toHaveLength(
      1
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('github-quota-deferred');
    expect(result.stderr).not.toContain('Customer outcome decision');
  });
});

const GOOD_COPY =
  'Public sign-up is open: Create your account and claim your name.';
const repoPath = path =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const WEB_RULE = repoPath('apps/web/lib/customer-changelog-editorial.ts');
const OVERLAY = repoPath('apps/web/data/customer-changelog-editorial.json');

describe('customer changelog headline rule', () => {
  it('accepts sentence-case outcomes and names each problem', () => {
    for (const headline of [
      'QR codes, drawn on your device',
      'The paid plan is now Artist Presence',
      '2 new ways to share a release',
      'Mac App',
    ])
      expect(headlineProblems(headline)).toEqual([]);
    expect(headlineProblems(undefined)).toEqual(['is empty']);
    expect(headlineProblems(' Padded')).toContain('has surrounding whitespace');
    expect(headlineProblems('x'.repeat(HEADLINE_MAX + 1))).toContain(
      `is ${HEADLINE_MAX + 1} characters (max ${HEADLINE_MAX})`
    );
    expect(headlineProblems('Sign-up is open.')).toEqual([
      'ends with punctuation',
    ]);
    expect(headlineProblems('A <b>bold</b> move')).toContain(
      'contains markup or a newline'
    );
    expect(headlineProblems('sign-up is open')).toEqual([
      'is not sentence case',
    ]);
    expect(headlineProblems('Release Links Unfurl With A Card')).toEqual([
      'is not sentence case',
    ]);
  });
  // The web rule lands with the overlay itself; compare once both exist.
  it.skipIf(!existsSync(WEB_RULE))(
    'matches the rule the web projection applies',
    () => {
      const web = readFileSync(WEB_RULE, 'utf8');
      expect(web).toContain(
        `export const CUSTOMER_CHANGELOG_HEADLINE_MAX = ${HEADLINE_MAX};`
      );
      expect(web).toContain('/[.!:;,]$/');
      expect(web).toContain('capitalised * 2 <= rest.length');
    }
  );
});

describe('customer changelog marker copy lint', () => {
  it('passes a headline, a separator and a full sentence', () => {
    expect(lintCustomerNoteCopy(GOOD_COPY)).toEqual([]);
    expect(
      lintCustomerNoteCopy('See your music before you pay — Pick your artist.')
    ).toEqual([]);
    expect(splitHeadline('No split here.')).toBeNull();
    // Ordinary words that only contain a banned one stay legal.
    expect(
      lintCustomerNoteCopy('Resend a confirmation: Flagship capital stays.')
    ).toEqual([]);
  });
  it('requires the split, a compliant headline and a capitalised explanation', () => {
    expect(lintCustomerNoteCopy(undefined)).toEqual([
      expect.stringContaining('text must read "Headline: explanation"'),
    ]);
    expect(
      lintCustomerNoteCopy('Artist profiles: the footer sits lower.')
    ).toEqual([expect.stringContaining('must start with a capital letter')]);
    expect(
      lintCustomerNoteCopy(`${'Long headline '.repeat(5).trim()}: It is long.`)
    ).toEqual([expect.stringContaining(`(max ${HEADLINE_MAX})`)]);
  });
  it.each([
    ['Faster pages: This PR trims the bundle.', 'internal word "PR"'],
    ['Faster pages: Live after the next deploy.', 'internal word "deploy"'],
    ['Faster pages: CI now checks them.', 'internal word "CI"'],
    ['New inbox: Behind a feature flag for now.', '"feature flag"'],
    ['Creator lookup: The API returns channel data.', 'internal word "API"'],
    ['Creator lookup: A new endpoint is live.', 'internal word "endpoint"'],
    ['Steady previews: A regression is gone.', 'internal word "regression"'],
    ['Faster pages: Sessions moved off Redis.', 'internal word "Redis"'],
    ['Clearer errors: Sentry sees fewer.', 'internal word "Sentry"'],
    ['Faster pages: Tracked in JOV-1234.', 'internal word "JOV-1234"'],
    ['Faster pages: Verified on staging first.', 'internal word "staging"'],
    ['Faster pages: The backend does less.', 'internal word "backend"'],
    ['Sign-up is open: You can sign up again.', 'phrasing "again"'],
    ['Previews play inline: They finally start.', 'phrasing "finally"'],
    ['Previews play inline: Playback was broken.', 'phrasing "was broken"'],
    ['Steady composer: It no longer crashes.', '"no longer crashes"'],
    ['Steady composer: A paste bug is gone.', 'phrasing "bug"'],
    ['Link previews: A card instead of an error.', '"instead of an error"'],
  ])('rejects %j', (text, problem) => {
    expect(lintCustomerNoteCopy(text).join('\n')).toContain(problem);
  });
  it('applies only to release-worthy markers created after the cutoff', () => {
    const note = { releaseWorthy: true, text: 'You can sign up again.' };
    expect(customerNoteCopyProblems(note, COPY_LINT_FROM)).not.toEqual([]);
    expect(customerNoteCopyProblems(note, '2026-11-13T23:59:59Z')).toEqual([]);
    expect(customerNoteCopyProblems(undefined, COPY_LINT_FROM)).toEqual([]);
    expect(
      customerNoteCopyProblems({ releaseWorthy: false }, COPY_LINT_FROM)
    ).toEqual([]);
  });
});

describe('customer changelog editorial overlay check', () => {
  const receipt = (date, stories) =>
    `<!-- daily-changelog-receipt/v1 ${JSON.stringify({ schema: 'daily-changelog-receipt/v1', window: { key: date }, stories })} -->`;
  const story = (key, summary) => ({
    id: key,
    entryId: `customer-update:${key}`,
    summary,
  });
  const markdown = [
    receipt('2026-11-10', [
      story('good', GOOD_COPY),
      story('plain', 'You can sign up for Jovie.'),
      story('label', 'Artist profiles: the footer sits lower.'),
    ]),
    receipt('2026-09-01', [story('old', 'An old plain sentence.')]),
    receipt('2026-10-02', [{ id: 'legacy', summary: 'Legacy: Still here.' }]),
    receipt('2026-10-03', [{ sourceIds: ['a'], summary: 'By source: Yes.' }]),
    '<!-- daily-changelog-receipt/v1 {not json -->',
    receipt(undefined, []),
  ].join('\n');
  const migrations = {
    entries: [
      {
        releaseKey: '2026-10-02',
        storyId: 'legacy',
        entryId: 'customer-update:legacy',
        sourceIds: [],
      },
      {
        releaseKey: '2026-10-03',
        storyId: 's',
        entryId: 'customer-update:by-source',
        sourceIds: ['a'],
      },
    ],
  };
  const check = entries =>
    checkEditorialOverlay({
      markdown,
      migrations,
      overlay: { schema: 'customer-changelog-editorial/v1', entries },
    }).errors;

  it('passes on an overlay headline, a withdrawal or a compliant split', () => {
    expect(
      check({
        'customer-update:plain': { headline: 'Public sign-up is open' },
        'customer-update:label': { hide: true, reason: 'Too small.' },
        'customer-update:by-source': { headline: 'Found by source' },
      })
    ).toEqual([]);
  });
  it('flags recent entries with no headline, but none outside the window', () => {
    const errors = check({});
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('customer-update:plain (2026-11-10)');
    expect(errors[0]).toContain('customer-changelog-editorial.json');
    expect(errors[1]).toContain('followed by a lowercase explanation');
  });
  it('rejects unknown keys and malformed overlay entries', () => {
    expect(
      check({
        'customer-update:plain': {
          headline: 'Public sign-up is open',
          lead: 'lowercase lead.',
          media: { kind: 'image', src: 'https://x.test/a.png', alt: 'A' },
        },
        'customer-update:label': { hide: true },
        'customer-update:ghost': { headline: 'Never published' },
        'customer-update:good': { headline: 'Ends badly.' },
        'customer-update:old': { hide: true, reason: 'x', headline: 'Both' },
        'customer-update:legacy': {},
      })
    ).toEqual([
      'customer-update:plain: lead must start with a capital letter.',
      'customer-update:plain: media src must live under /images/changelog/.',
      'customer-update:label: a hidden entry needs a reason.',
      expect.stringContaining('customer-update:ghost: not a published'),
      'customer-update:good: headline "Ends badly." ends with punctuation.',
      'customer-update:old: a hidden entry carries only its reason.',
      'customer-update:legacy: needs a headline or hide: true.',
    ]);
    expect(
      checkEditorialOverlay({ markdown: '', overlay: {}, migrations: {} })
    ).toEqual({
      errors: ['overlay schema must be customer-changelog-editorial/v1'],
      checked: 0,
    });
  });
  it('holds for the committed overlay and the published changelog', () => {
    const cli = new URL(
      '../../check-customer-changelog-editorial.mjs',
      import.meta.url
    );
    expect(
      execFileSync(process.execPath, [fileURLToPath(cli)], { encoding: 'utf8' })
    ).toMatch(
      existsSync(OVERLAY)
        ? /overlay ok \(\d+ published entries\)/
        : /No customer changelog editorial overlay to check/
    );
  });
});
