import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  checkBans,
  checkCleanFrame,
  checkContentAxis,
  checkPenParity,
  checkSubpixel,
  evaluateSnapshot,
} from './invariants.mjs';
import { checkPrBody, extractImages, repoPathOf } from './pr-body-check.mjs';
import { parseVisionVerdict } from './vision.mjs';

const column = {
  left: 240,
  right: 1432,
  top: 8,
  bottom: 892,
  width: 1192,
  height: 884,
};
const atom = (left, top, extra = {}) => ({
  kind: 'text',
  left,
  right: left + 60,
  top,
  bottom: top + 16,
  label: `atom@${left}`,
  ...extra,
});
const snap = (atoms, extra = {}) => ({
  viewport: { width: 1440, height: 900 },
  column,
  atoms,
  shellRows: [
    { y: 0, height: 44 },
    { y: 52, height: 40 },
  ],
  ...extra,
});
const pen = {
  column: { width: 1192 },
  rows: [
    { name: 'header', y: 0, height: 44 },
    { name: 'toolbar', y: 52, height: 40 },
  ],
};

describe('content axis', () => {
  it('passes rows that start on column + 20', () => {
    assert.deepEqual(
      checkContentAxis(snap([atom(260, 20), atom(260, 70), atom(400, 70)])),
      []
    );
  });

  it('fails the rejected PR #23710 audit: title 252, tabs 282, table 300', () => {
    const failures = checkContentAxis(
      snap([atom(252, 20), atom(282, 70), atom(300, 200)])
    );
    assert.equal(failures.length, 3);
    assert.ok(failures.every(f => f.rule === 'content-axis'));
  });

  it('accepts centred rows and end-anchored rows', () => {
    const centred = { ...atom(786, 300), right: 886 }; // centre 836
    const endAnchored = { ...atom(1352, 400), right: 1412 };
    assert.deepEqual(checkContentAxis(snap([centred, endAnchored])), []);
  });

  it('accepts a header label aligned with its column cells, rejects an empty leading track', () => {
    const head = atom(336, 120, { table: 'head', column: 2 });
    const cell = atom(336, 150, { table: 'body', column: 2 });
    const lead = atom(260, 150, { kind: 'glyph' });
    assert.deepEqual(checkContentAxis(snap([head, cell, lead])), []);
    const orphan = atom(300, 120, { table: 'head', column: 1 });
    assert.match(
      checkContentAxis(snap([orphan]))[0].message,
      /empty leading track/
    );
  });
});

describe('bans and frame', () => {
  it('fails emoji, icon tiles, plated empty states and oversized tabs', () => {
    const failures = checkBans(
      snap([atom(260, 20, { text: 'Launch 🚀' })], {
        iconTiles: [{ width: 32, height: 32, label: 'tile' }],
        emptyStatePlates: [{ reason: 'bordered card', label: 'card' }],
        tabs: [{ text: 'Overview', fontSize: 16, height: 40, label: 'tab' }],
      })
    );
    assert.deepEqual(failures.map(f => f.rule).sort(), [
      'ban-bordered-empty-card',
      'ban-emoji',
      'ban-icon-tile',
      'ban-oversized-tab',
    ]);
  });

  it('fails dev chrome and horizontal overflow', () => {
    const failures = checkCleanFrame(
      snap([], {
        devChrome: ['[data-testid="dev-toolbar"]'],
        horizontalOverflow: 12,
      })
    );
    assert.deepEqual(
      failures.map(f => f.rule),
      ['dev-chrome', 'horizontal-overflow']
    );
  });

  it('fails a left-anchored painted box on a fractional pixel', () => {
    assert.equal(
      checkSubpixel(snap([atom(260.4, 20, { kind: 'box' })])).length,
      1
    );
    assert.equal(
      checkSubpixel(snap([atom(743.64, 300, { kind: 'box' })])).length,
      0
    );
  });
});

describe('Pen parity', () => {
  it('passes matching shell rows and fails an 8px drift', () => {
    assert.deepEqual(checkPenParity(snap([]), pen), []);
    const drifted = snap([], {
      shellRows: [
        { y: 0, height: 44 },
        { y: 60, height: 40 },
      ],
    });
    assert.equal(checkPenParity(drifted, pen)[0].rule, 'pen-parity');
  });

  it('evaluates everything together', () => {
    assert.equal(
      evaluateSnapshot(snap([atom(260, 20)]), pen, { axisInset: 20 }).pass,
      true
    );
    assert.equal(
      evaluateSnapshot(snap([atom(252, 20)]), pen, { axisInset: 20 }).pass,
      false
    );
  });
});

describe('vision verdict', () => {
  it('turns any blocking finding into a fail', () => {
    const v = parseVisionVerdict(
      '{"status":"pass","findings":[{"category":"misalignment","severity":"blocking","note":"tabs off edge"}]}'
    );
    assert.equal(v.status, 'fail');
  });

  it('rejects malformed judge output', () => {
    assert.throws(() => parseVisionVerdict('looks good to me'));
  });
});

describe('PR body check', () => {
  it('finds markdown, html and bare image links', () => {
    const body =
      '![a](docs/x.png) <img src="https://e.com/b.jpg"> see https://e.com/c.webp';
    assert.equal(extractImages(body).length, 3);
    assert.equal(
      repoPathOf(
        'https://github.com/JovieInc/Jovie/blob/abc123/docs/design-present/app-shell/after/home.png?raw=true'
      ),
      'docs/design-present/app-shell/after/home.png'
    );
  });

  it('passes a body without screenshots', () => {
    assert.equal(checkPrBody('Refactor only.').ok, true);
  });

  it('fails screenshots with no receipt', () => {
    const result = checkPrBody(
      '![after](https://user-images.example/after.png)'
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /without a design-present receipt/);
  });

  it('fails a receipt that is not on the head', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-'));
    const body =
      '<!-- design-present/v1 receipt=docs/design-present/x/receipt.json -->\n![a](docs/design-present/x/after/home.png)';
    const result = checkPrBody(body, root);
    assert.equal(result.ok, false);
    assert.match(result.message, /not on the PR head/);
  });

  it('fails a hand-edited receipt that claims pass', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-'));
    const set = join(root, 'docs/design-present/x');
    mkdirSync(join(set, 'after'), { recursive: true });
    mkdirSync(join(set, 'pen'), { recursive: true });
    writeFileSync(
      join(set, 'manifest.json'),
      JSON.stringify({
        set: 'x',
        axisInset: 20,
        pen: { geometry: 'pen/ref.json' },
        screens: [{ id: 'home' }],
      })
    );
    writeFileSync(
      join(set, 'pen/ref.json'),
      JSON.stringify({ screens: { home: pen } })
    );
    writeFileSync(
      join(set, 'after/home.geometry.json'),
      JSON.stringify(snap([atom(252, 20)]))
    );
    writeFileSync(
      join(set, 'receipt.json'),
      JSON.stringify({
        schema: 'design-present-receipt/v1',
        gateVersion: 'forged',
        manifest: 'docs/design-present/x/manifest.json',
        pass: true,
        screens: [{ id: 'home', vision: { status: 'skipped' }, files: {} }],
      })
    );
    const body =
      '<!-- design-present/v1 receipt=docs/design-present/x/receipt.json -->\n![a](docs/design-present/x/after/home.png)';
    const result = checkPrBody(body, root);
    assert.equal(result.ok, false);
    assert.match(result.message, /gate forged/);
    assert.match(result.message, /vision critique is skipped/);
    assert.match(result.message, /invariants fail on committed geometry/);
    assert.match(
      result.message,
      /not an artifact of a passing design-present receipt/
    );
  });
});
