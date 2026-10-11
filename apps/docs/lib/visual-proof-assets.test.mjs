import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  auditVisualProofAssets,
  buildVisualProofIssue,
  findUnsafeCaptureText,
  MIN_ASSET_HEIGHT,
  MIN_ASSET_WIDTH,
  parsePngDimensions,
  selectAffectedPlanEntries,
} from './visual-proof-assets.mjs';

function pngBuffer(width, height, label = 'x') {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.from(label)]);
}

function assetEntry(width, height, label) {
  const bytes = pngBuffer(width, height, label);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width,
    height,
  };
}

const planEntries = [
  {
    id: 'edit-smart-link-links-dashboard',
    articleId: 'edit-smart-link',
    step: 'links-dashboard',
    title: 'Links list',
    alt: 'The Links screen.',
    route: '/app/dashboard/links',
  },
];

function article({ visualProofRefs = [], lastVerifiedAt = null } = {}) {
  return {
    id: 'edit-smart-link',
    status: 'uncertified',
    lastVerifiedAt,
    visualProofRefs,
  };
}

function manifestFor(ref, overrides = {}) {
  return {
    ref,
    capturedAt: '2026-09-27T12:00:00.000Z',
    gitSha: 'a'.repeat(40),
    captureTarget: 'page',
    viewportCss: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    width: 2880,
    height: 1800,
    ...overrides,
  };
}

test('parsePngDimensions reads IHDR and rejects non-PNG input', () => {
  assert.deepEqual(parsePngDimensions(pngBuffer(2880, 1800)), {
    width: 2880,
    height: 1800,
  });
  assert.equal(parsePngDimensions(Buffer.from('not a png')), null);
  assert.equal(parsePngDimensions(Buffer.alloc(4)), null);
});

test('audit reports missing assets for refs and plan entries', () => {
  const findings = auditVisualProofAssets({
    articles: [
      article({
        visualProofRefs: ['proof/edit-smart-link-links-dashboard.png'],
      }),
    ],
    planEntries,
    assets: new Map(),
    manifestEntries: [],
  });
  const codes = findings.map(f => f.code);
  assert.equal(codes.filter(c => c === 'missing-asset').length, 2);
});

test('audit reports orphaned and duplicate assets', () => {
  const dup = assetEntry(2880, 1800, 'same');
  const findings = auditVisualProofAssets({
    articles: [article({ visualProofRefs: ['proof/a-one.png'] })],
    planEntries: [],
    assets: new Map([
      ['proof/a-one.png', dup],
      ['proof/orphan.png', assetEntry(2880, 1800, 'orphan')],
      ['proof/dup-a.png', assetEntry(2880, 1800, 'dupe')],
      ['proof/dup-b.png', assetEntry(2880, 1800, 'dupe')],
    ]),
    manifestEntries: [
      manifestFor('proof/a-one.png'),
      manifestFor('proof/orphan.png'),
      manifestFor('proof/dup-a.png'),
      manifestFor('proof/dup-b.png'),
    ],
  });
  const codes = findings.map(f => f.code);
  assert.ok(codes.includes('orphaned-asset'));
  assert.ok(codes.includes('duplicate-asset'));
});

test('audit flags dimensionally invalid assets and manifest mismatches', () => {
  const findings = auditVisualProofAssets({
    articles: [
      article({ visualProofRefs: ['proof/tiny.png', 'proof/mismatch.png'] }),
    ],
    planEntries: [],
    assets: new Map([
      ['proof/tiny.png', assetEntry(100, 100, 'tiny')],
      ['proof/mismatch.png', assetEntry(2880, 1800, 'mismatch')],
    ]),
    manifestEntries: [
      manifestFor('proof/tiny.png', { width: 100, height: 100 }),
      manifestFor('proof/mismatch.png', { sha256: 'f'.repeat(64) }),
    ],
  });
  const tiny = findings.filter(f => f.ref === 'proof/tiny.png');
  assert.ok(tiny.some(f => f.code === 'invalid-dimensions'));
  assert.ok(
    findings.some(
      f => f.ref === 'proof/mismatch.png' && f.code === 'manifest-mismatch'
    )
  );
});

test('audit flags captures older than article verification and stale builds', () => {
  const ref = 'proof/edit-smart-link-links-dashboard.png';
  const findings = auditVisualProofAssets({
    articles: [
      article({ visualProofRefs: [ref], lastVerifiedAt: '2026-09-30' }),
    ],
    planEntries: [],
    assets: new Map([[ref, assetEntry(2880, 1800)]]),
    manifestEntries: [manifestFor(ref)],
    currentGitSha: 'b'.repeat(40),
  });
  const codes = findings.map(f => f.code);
  assert.ok(codes.includes('stale-capture'));
  assert.ok(codes.includes('stale-build'));
});

test('a clean audit returns no findings and is deterministic', () => {
  const ref = 'proof/edit-smart-link-links-dashboard.png';
  const asset = assetEntry(2880, 1800);
  const input = {
    articles: [article({ visualProofRefs: [ref] })],
    planEntries,
    assets: new Map([[ref, asset]]),
    manifestEntries: [
      manifestFor(ref, { sha256: asset.sha256, gitSha: 'a'.repeat(40) }),
    ],
    currentGitSha: 'a'.repeat(40),
  };
  const first = auditVisualProofAssets(input);
  const second = auditVisualProofAssets(input);
  assert.deepEqual(first, []);
  assert.deepEqual(first, second);
});

test('findUnsafeCaptureText rejects sensitive fixtures', () => {
  assert.deepEqual(findUnsafeCaptureText('Contact me at artist@example.com'), [
    'email',
  ]);
  assert.deepEqual(findUnsafeCaptureText('use sk_live_abc123xyz key'), [
    'secret-token',
  ]);
  assert.deepEqual(findUnsafeCaptureText('plain step title'), []);
});

test('selectAffectedPlanEntries scopes to affected articles', () => {
  const other = {
    ...planEntries[0],
    id: 'other-step',
    articleId: 'other-guide',
    step: 'x',
  };
  const selected = selectAffectedPlanEntries(
    [...planEntries, other],
    [
      {
        articleId: 'edit-smart-link',
        reasons: ['product-route-changed:APP_ROUTES.DASHBOARD_LINKS'],
      },
    ]
  );
  assert.deepEqual(selected, planEntries);
});

test('buildVisualProofIssue fingerprints per article with evidence', () => {
  const issue = buildVisualProofIssue({
    articleId: 'edit-smart-link',
    findings: [
      {
        code: 'missing-asset',
        ref: 'proof/edit-smart-link-x.png',
        detail: 'not captured',
        articleId: 'edit-smart-link',
      },
    ],
  });
  assert.equal(issue.fingerprint, 'docs-visual-proof:edit-smart-link');
  assert.match(issue.title, /edit-smart-link/);
  assert.match(issue.body, /missing-asset/);
});

test('dimension floors are enforced constants', () => {
  assert.equal(MIN_ASSET_WIDTH, 640);
  assert.equal(MIN_ASSET_HEIGHT, 320);
});
