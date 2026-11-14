import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectFrames, frameFromArtifactName } from './pen-draft-frames.mjs';
import {
  artifacts,
  fakeNetwork,
  fakePng,
  publish,
  sidecar,
} from './pen-draft-publish.fixtures.mjs';

test('frame names come from pen-draft-<frame> artifact names only', () => {
  assert.equal(frameFromArtifactName('pen-draft-homepage'), 'homepage');
  assert.equal(
    frameFromArtifactName('pen-draft-page-skeletons-2'),
    'page-skeletons-2'
  );
  for (const name of [
    'pen-draft-',
    'pen-draft',
    'pen-drafts-homepage',
    'quality-gaps-123',
    'pen-draft-Bad Name',
    'pen-draft-../etc',
    'pen-draft-a--b',
    'xpen-draft-homepage',
    undefined,
  ])
    assert.equal(frameFromArtifactName(name), null, String(name));
});

test('only pen-draft folders count, and a frame without a png has none', () => {
  const dir = artifacts({
    'pen-draft-homepage': ['homepage.pen', 'homepage.png', 'homepage.json'],
    'pen-draft-claim': ['claim.pen', 'receipt.json'],
    // Another frame's picture in the wrong artifact is not this frame's.
    'pen-draft-insights': ['homepage.png'],
    'coverage-report': ['coverage.png'],
  });
  assert.deepEqual(
    collectFrames(dir).map(entry => [
      entry.frame,
      entry.png?.slice(dir.length + 1) ?? null,
    ]),
    [
      ['claim', null],
      ['homepage', 'pen-draft-homepage/homepage.png'],
      ['insights', null],
    ]
  );
  assert.deepEqual(collectFrames(join(dir, 'missing')), []);
});

test('a picture of the whole canvas is refused, not uploaded', async () => {
  // Run 43568417528: every <frame>.png was the whole canvas, about 8192x7900.
  const dir = artifacts({
    'pen-draft-claim': [['claim.png', fakePng(8192, 7900)]],
    'pen-draft-homepage': ['homepage.png'],
    'pen-draft-insights': [['insights.png', fakePng(1440, 4001)]],
  });
  const network = fakeNetwork();
  const result = await publish(dir, network);
  assert.equal(result.ok, false);
  assert.deepEqual(result.frames, [
    {
      frame: 'claim',
      ok: false,
      reason: 'pen_picture_whole_canvas',
      detail: '8192x7900',
    },
    { frame: 'homepage', ok: true, action: 'created', identifier: 'JOV-900' },
    {
      frame: 'insights',
      ok: false,
      reason: 'pen_picture_whole_canvas',
      detail: '1440x4001',
    },
  ]);
  const uploaded = network.calls
    .filter(call => call.op === 'PenDraftFileUpload')
    .map(call => call.variables.filename);
  assert.deepEqual(uploaded, ['homepage.png']);
});

test('the rendered frame picture is uploaded in place of the draft export', async () => {
  const frame = fakePng(1440, 2200);
  const dir = artifacts({
    'pen-draft-claim': [
      ['claim.png', fakePng(8192, 7900)],
      ['claim.frame.png', frame],
      [
        'claim.frame.json',
        sidecar({
          frame: 'claim',
          ok: true,
          nodes: [{ id: 'n1', name: 'claim', width: 1440, height: 2200 }],
        }),
      ],
    ],
  });
  const network = fakeNetwork();
  const result = await publish(dir, network);
  assert.deepEqual(result.frames, [
    { frame: 'claim', ok: true, action: 'created', identifier: 'JOV-900' },
  ]);
  const put = network.calls.find(call => call.op === 'PUT');
  assert.deepEqual(put.body, frame);
});

test('a render that failed, or drew more than the frame, fails the frame', async () => {
  const dir = artifacts({
    // The render failed: the small draft export must not stand in for it.
    'pen-draft-claim': [
      'claim.png',
      [
        'claim.frame.json',
        sidecar({ frame: 'claim', ok: false, error: 'timed out' }),
      ],
    ],
    // Two nodes in the picture: more than the drafted frame.
    'pen-draft-homepage': [
      'homepage.frame.png',
      [
        'homepage.frame.json',
        sidecar({
          frame: 'homepage',
          ok: true,
          nodes: [
            { id: 'n1', name: 'homepage', width: 1440, height: 900 },
            { id: 'n2', name: 'pricing', width: 1440, height: 900 },
          ],
        }),
      ],
    ],
    // A node that is not the drafted frame.
    'pen-draft-insights': [
      'insights.frame.png',
      [
        'insights.frame.json',
        sidecar({
          frame: 'insights',
          ok: true,
          nodes: [{ id: 'n3', name: 'Golden Path', width: 1440, height: 900 }],
        }),
      ],
    ],
    'pen-draft-request-access': [['request-access.png', 'not a png at all']],
    'pen-draft-workspace-table': [
      ['workspace-table.frame.png', fakePng(1440, 900)],
      ['workspace-table.frame.json', '{ not json'],
    ],
  });
  const network = fakeNetwork();
  const result = await publish(dir, network);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.frames.map(row => [row.frame, 'reason' in row ? row.reason : null]),
    [
      ['claim', 'pen_picture_render_failed'],
      ['homepage', 'pen_picture_not_one_frame'],
      ['insights', 'pen_picture_not_one_frame'],
      ['request-access', 'pen_picture_not_png'],
      ['workspace-table', 'pen_picture_render_failed'],
    ]
  );
  // Nothing was uploaded, so Linear was never asked for anything.
  assert.deepEqual(network.ops(), []);
});
