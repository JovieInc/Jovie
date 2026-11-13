import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkTooltipCopy, shortTooltipTitle } from './tooltip-copy';
import {
  CHECK_COMMAND,
  compareToBaseline,
  readBaseline,
  scanAll,
  scanTooltipCopy,
  toCounts,
} from './tooltip-copy-audit';

const TSX = 'apps/web/components/Example.tsx';
const QR_NOTE =
  "What's new: Profile QR codes are now drawn right on your device. Visiting a profile no longer reaches an outside service to render them, so pages load with zero third-party requests, keeping the promise we publish on our comparison page.";
const rules = (source: string) =>
  scanTooltipCopy(TSX, source).map(finding => finding.rule);

describe('tooltip copy rule', () => {
  it.each([
    'Save changes',
    'Toggle sidebar',
    "What's new: Profile QR codes are now drawn…",
    'Refresh · updated {x}',
    'Live on DSPs. Fans can stream this release everywhere today.',
    'Fans who clicked a link in the last 30 days',
    'Requires v1.2 or later',
  ])('allows %j', text => {
    expect(checkTooltipCopy(text)).toEqual([]);
  });

  it('deliberate red: the founder-reported changelog paragraph', () => {
    expect(checkTooltipCopy(QR_NOTE)).toEqual(
      expect.arrayContaining([
        'explainer-tell',
        'too-many-sentences',
        'sentence-too-long',
      ])
    );
  });

  it.each([
    [
      'title-too-long',
      'Profile QR codes are now drawn on-device: Faster pages.',
    ],
    [
      'sentence-too-long',
      'This tooltip keeps going well past the point where anyone hovering a small icon button would still be reading.',
    ],
    ['too-many-sentences', 'Share. Copies the link. Opens the sheet.'],
    ['explainer-tell', 'Runs locally so that pages load faster'],
    ['explainer-tell', 'Zero third-party requests'],
    ['explainer-tell', 'We keep our promise'],
    ['explainer-tell', 'No longer calls an outside service'],
  ] as const)('deliberate red: %s blocks %j', (rule, text) => {
    expect(checkTooltipCopy(text)).toContain(rule);
  });

  it('shortens runtime copy to a title and leaves fitting copy alone', () => {
    expect(shortTooltipTitle('Your latest releases')).toBe(
      'Your latest releases'
    );
    const short = shortTooltipTitle(QR_NOTE.replace("What's new: ", ''));
    expect(short).toBe('Profile QR codes are now drawn…');
    expect(checkTooltipCopy(`What's new: ${short}`)).toEqual([]);
    expect(shortTooltipTitle('')).toBe('');
  });
});

describe('tooltip copy scanner', () => {
  it('reads every tooltip surface', () => {
    const long =
      'This tooltip keeps going well past the point where anyone hovering a small icon button would still be reading.';
    for (const source of [
      `<SimpleTooltip content='${long}'><b /></SimpleTooltip>`,
      `<SimpleTooltip content={\`${long}\`}><b /></SimpleTooltip>`,
      `<Tooltip label={on ? 'Hide' : '${long}'}><b /></Tooltip>`,
      `<TooltipShortcut label='${long}' shortcut='⌘B'><b /></TooltipShortcut>`,
      `<Tooltip><TooltipContent>${long}</TooltipContent></Tooltip>`,
      `<IconButton tooltip='${long}' />`,
      `<StatusGlyph tooltipLabel='${long}' />`,
      `const badge = { tooltip: '${long}' };`,
    ]) {
      expect(rules(source), source).toEqual(['sentence-too-long']);
    }
  });

  it('counts an interpolation as one word and skips dynamic copy', () => {
    expect(rules('<Tooltip label={`Refresh · updated ${ago}`} />')).toEqual([]);
    expect(rules('<Tooltip label={label} />')).toEqual([]);
    expect(rules("<Tooltip label={label ?? 'Open user menu'} />")).toEqual([]);
  });

  it('reads the right-hand copy of && on every tooltip surface', () => {
    for (const source of [
      `<Tooltip label={on && 'Zero requests'} />`,
      `<SimpleTooltip content={on && <span>Zero requests</span>} />`,
      `<TooltipContent>{on && 'Zero requests'}</TooltipContent>`,
      `<IconButton tooltip={on && 'Zero requests'} />`,
      `const badge = { tooltip: on && 'Zero requests' };`,
    ]) {
      expect(rules(source), source).toEqual(['explainer-tell']);
    }
    expect(rules(`<Tooltip label={'Zero requests' && 'Open'} />`)).toEqual([]);
  });

  it('checks both JSX ternary branches separately with surrounding copy', () => {
    for (const branches of [
      `on ? 'Open' : 'Zero requests'`,
      `on ? 'Zero requests' : 'Open'`,
    ]) {
      expect(
        scanTooltipCopy(
          TSX,
          `<TooltipContent>Action: {${branches}}</TooltipContent>`
        )
      ).toEqual([
        {
          path: TSX,
          rule: 'explainer-tell',
          value: 'Action: Zero requests',
          line: 1,
        },
      ]);
    }
    expect(
      rules(
        `<TooltipContent>{on ? 'Open. View the release.' : 'Close. Hide the release.'}</TooltipContent>`
      )
    ).toEqual([]);
  });

  it('checks every nested ternary branch through JSX and fragments', () => {
    expect(
      scanTooltipCopy(
        TSX,
        `<SimpleTooltip content={<>{a ? <span>{b ? 'Open' : 'Zero requests'}</span> : <>{c ? 'We promise' : 'No longer calls'}</>}</>} />`
      ).map(({ rule, value }) => ({ rule, value }))
    ).toEqual([
      { rule: 'explainer-tell', value: 'Zero requests' },
      { rule: 'explainer-tell', value: 'We promise' },
      { rule: 'explainer-tell', value: 'No longer calls' },
    ]);
    expect(
      rules(
        `<TooltipContent>{on && (other ? 'Open' : 'Zero requests')}</TooltipContent>`
      )
    ).toEqual(['explainer-tell']);
  });

  it('combines sibling alternatives with the rest of each rendering', () => {
    expect(
      rules(
        `<TooltipContent>{a ? 'Open' : 'One two three four five six'} {b ? 'menu' : 'seven'}: Details.</TooltipContent>`
      )
    ).toEqual(['title-too-long', 'title-too-long']);
    expect(
      rules(
        `<TooltipContent>{label} {/* no copy */} {on ? 'Open' : 'Close'}</TooltipContent>`
      )
    ).toEqual([]);
  });

  it('preserves interactive and list rules in later rich branches', () => {
    expect(
      rules(
        `<TooltipContent>{on ? <span>Open</span> : <button>Open</button>}</TooltipContent>`
      )
    ).toEqual(['rich-interactive']);
    expect(
      rules(
        `<TooltipContent><ul><li>A</li>{on ? <li>B</li> : <><li>B</li><li>C</li><li>D</li></>}</ul></TooltipContent>`
      )
    ).toEqual(['rich-list-too-long']);
    expect(
      rules(
        `<TooltipContent>{on ? <ul><li>A</li><li>B</li></ul> : <ul><li>C</li><li>D</li></ul>}</TooltipContent>`
      )
    ).toEqual([]);
  });

  it('allows kbd and a short list, blocks interactive and long rich content', () => {
    expect(
      rules(
        '<TooltipContent><span>Toggle sidebar</span><Kbd>⌘B</Kbd></TooltipContent>'
      )
    ).toEqual([]);
    expect(
      rules(
        '<SimpleTooltip content={<ul><li>Spotify</li><li>Apple Music</li><li>Tidal</li></ul>}><b /></SimpleTooltip>'
      )
    ).toEqual([]);
    expect(
      rules(
        '<SimpleTooltip content={<ul><li>A</li><li>B</li><li>C</li><li>D</li></ul>}><b /></SimpleTooltip>'
      )
    ).toEqual(['rich-list-too-long']);
    expect(
      rules(
        "<TooltipContent>Learn more <a href='/changelog'>here</a></TooltipContent>"
      )
    ).toEqual(['rich-interactive']);
  });

  it('ratchets per file and rule', () => {
    const findings = scanTooltipCopy(
      TSX,
      "<Tooltip label='Share. Copies the link. Opens the sheet.' />"
    );
    const files = toCounts(findings);
    expect(compareToBaseline(files, { files: {} }).regressions).toEqual([
      `${TSX}: too-many-sentences (0 allowed, 1 found)`,
    ]);
    expect(compareToBaseline({}, { files }).shrinks).toEqual([
      `${TSX}: too-many-sentences 1 -> 0`,
    ]);
  });

  it('the repo matches its baseline exactly', () => {
    const { regressions, shrinks } = compareToBaseline(
      toCounts(scanAll()),
      readBaseline()
    );
    expect(regressions).toEqual([]);
    expect(shrinks).toEqual([]);
  });

  it('is wired into the design gate and the web design-system guards', () => {
    const read = (path: string) =>
      readFileSync(
        fileURLToPath(new URL(`../../${path}`, import.meta.url)),
        'utf8'
      );
    const scripts = JSON.parse(read('package.json')).scripts;
    expect(scripts['design:tooltip-copy:check']).toBe(
      'tsx packages/copy/tooltip-copy-audit.ts check'
    );
    expect(scripts['design:conformance:gate']).toContain(CHECK_COMMAND);
    expect(
      read('apps/web/tests/unit/design-system/tooltip-copy.test.ts')
    ).toContain('scanAll');
  });
});
