import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareToBaseline,
  makeResolver,
  scanAll,
  scanCode,
  scanCopy,
  scanLinks,
  toCounts,
} from './dead-ends';

const TSX = 'apps/web/components/Example.tsx';
const rules = (path: string, source: string) =>
  scanCopy(path, source).map(finding => finding.rule);

describe('dead-end copy (JOV-INV-046)', () => {
  it.each([
    [
      'dead-end-not-available',
      "<p>Dictation isn't available in the desktop app.</p>",
    ],
    ['dead-end-not-available', "const label = 'Export is unavailable';"],
    ['dead-end-not-available', '<p>Not supported in this browser.</p>'],
    ['dead-end-coming-soon', '<Badge>Coming soon</Badge>'],
    ['dead-end-coming-soon', "const note = 'Check back soon for updates';"],
    [
      'dead-end-use-instead',
      "const hint = 'Use macOS dictation: press Fn twice';",
    ],
    ['dead-end-only-on-platform', '<p>Only available on the web app.</p>'],
  ])('deliberate red: %s blocks %j', (rule, source) => {
    expect(rules(TSX, source)).toContain(rule);
  });

  it('allows working copy, retryable errors and explicit opt-outs', () => {
    expect(rules(TSX, '<p>Allow microphone to start dictating.</p>')).toEqual(
      []
    );
    expect(rules(TSX, '<p>Upload failed. Try again.</p>')).toEqual([]);
    expect(
      rules(TSX, '<p>Service temporarily unavailable. Please retry.</p>')
    ).toEqual([]);
    expect(
      rules(
        TSX,
        '// dead-end-ok: permission prompt that opens system settings\n<p>Camera is not available until you allow it.</p>'
      )
    ).toEqual([]);
  });

  it('ignores identifiers, logs and non-UI files', () => {
    expect(rules(TSX, "const state = 'unavailable';")).toEqual([]);
    expect(rules(TSX, "logger.warn('Feature is not available here');")).toEqual(
      []
    );
    expect(
      rules('apps/web/lib/server/util.ts', "const m = 'Coming soon today';")
    ).toEqual([]);
  });
});

describe('dead-end code patterns', () => {
  const codeRules = (source: string) =>
    scanCode(TSX, source).map(finding => finding.rule);

  it.each([
    ['noop-handler', '<Button onClick={() => {}}>Save</Button>'],
    ['noop-handler', '<Button onClick={noop}>Save</Button>'],
    ['noop-handler', '<Button onClick={() => undefined}>Save</Button>'],
    ['disabled-no-reason', '<Button disabled>Export</Button>'],
    ['dead-href', "<a href='#'>Settings</a>"],
  ])('deliberate red: %s blocks %j', (rule, source) => {
    expect(codeRules(source)).toContain(rule);
  });

  it('allows conditional disabled, reasoned disabled and real handlers', () => {
    expect(codeRules('<Button disabled={isPending}>Save</Button>')).toEqual([]);
    expect(
      codeRules("<Button disabled title='Pick a file first'>Go</Button>")
    ).toEqual([]);
    expect(codeRules('<Button onClick={() => save()}>Save</Button>')).toEqual(
      []
    );
  });
});

describe('dead-end link check', () => {
  const resolves = makeResolver(
    [['app', 'chat'], ['app', 'chat', '[id]'], ['pricing']],
    path => path === '/robots.txt'
  );
  const links = (source: string) =>
    scanLinks(TSX, source, resolves).map(finding => finding.value);

  it('deliberate red: flags hrefs that resolve to no route', () => {
    expect(links("<Link href='/app/ghost-page'>Go</Link>")).toEqual([
      '/app/ghost-page',
    ]);
    expect(links("router.push('/not/built')")).toEqual(['/not/built']);
  });

  it('passes static, dynamic, query and public-file hrefs', () => {
    expect(links("<Link href='/app/chat'>x</Link>")).toEqual([]);
    expect(links("<Link href='/app/chat/abc?x=1#top'>x</Link>")).toEqual([]);
    expect(links("<a href='/robots.txt'>x</a>")).toEqual([]);
  });
});

describe('dead-end ratchet', () => {
  const found = (n: number) =>
    toCounts(
      Array.from({ length: n }, () => ({
        path: 'a.tsx',
        kind: 'copy' as const,
        rule: 'dead-end-coming-soon',
        value: 'Coming soon',
        line: 1,
      }))
    );

  it('deliberate red: rejects growth and new files, accepts shrink', () => {
    const baseline = { files: found(2) };
    expect(compareToBaseline(found(3), baseline).regressions).toHaveLength(1);
    expect(
      compareToBaseline({ 'b.tsx': found(1)['a.tsx'] ?? {} }, baseline)
        .regressions
    ).toHaveLength(1);
    const shrunk = compareToBaseline(found(1), baseline);
    expect(shrunk.regressions).toEqual([]);
    expect(shrunk.shrinks).toHaveLength(1);
  });

  it('holds the checked-in source at or below the committed baseline', () => {
    const baseline = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./dead-ends.baseline.json', import.meta.url)),
        'utf8'
      )
    );
    expect(
      compareToBaseline(toCounts(scanAll()), baseline).regressions
    ).toEqual([]);
  });
});
