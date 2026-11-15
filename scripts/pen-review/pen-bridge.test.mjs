import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  encodePng,
  fillRect,
  solidImage,
} from '../invariants/pen-still-diff-lib.mjs';
import {
  exportFramesHeadless,
  parseShellOutput,
  runPen,
} from './pen-bridge.mjs';

const image = () => {
  const img = solidImage(160, 96, [6, 6, 6, 255]);
  fillRect(img, 105, 65, 30, 6, [220, 220, 220, 255]);
  return img;
};

const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'pen-recovery-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('pen shell output parsing', () => {
  const out =
    '\u001b[36mpen\u001b[39m > {\n  "message": "OK\\n\\n## Print output\\nFACTS{\\"a\\":1}  \\nline2\\n"\n}\nGoodbye.';
  const [r] = parseShellOutput(out);
  assert.ok(r.ok);
  assert.deepEqual(r.lines, ['FACTS{"a":1}', 'line2']);
  assert.throws(() => parseShellOutput('nothing here'), /no result/);
  const headless =
    '[INFO] Ready.\n\u001b[36mpen\u001b[39m > [WARN] [IPC] request \'read-file\' failed\n    at x (y)\n  code: \'FILE_NOT_FOUND\'\n}\nOK\n\nGlobal variables carry over\n\n## Print output\nMAP["a","b"]\n\n[WARN] late\npen > OK\n\n## Print output\nsecond\n\nGoodbye.';
  const parsed = parseShellOutput(headless);
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every(p => p.ok));
  assert.deepEqual(parsed[0].lines, ['MAP["a","b"]']);
  assert.deepEqual(parsed[1].lines, ['second']);
});

test('headless export rejects missing frames before reading a prior PNG or snapshot', t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'F.png'), 'stale');
  for (const trees of [[{ id: 'F', missing: true }], []]) {
    assert.throws(
      () =>
        exportFramesHeadless(['F'], dir, {
          snapshot: '/does-not-exist.pen',
          treesReader: () => trees,
          run: () => {
            throw new Error('should not run');
          },
        }),
      /missing frames: F/
    );
  }
  assert.equal(readFileSync(join(dir, 'F.png'), 'utf8'), 'stale');
});

test('headless export uses fresh output, preserves assets and double export, and rejects absent mapping/output', t => {
  const dir = scratch(t);
  const ws = join(dir, 'workspace');
  const out = join(dir, 'out');
  mkdirSync(ws);
  mkdirSync(out);
  mkdirSync(join(ws, 'fonts'));
  const snapshot = join(ws, 'canonical.pen');
  writeFileSync(snapshot, 'source');
  writeFileSync(join(out, 'F.png'), 'stale');
  const opts = {
    snapshot,
    treesReader: () => [
      {
        id: 'F',
        type: 'frame',
        children: [{ id: 'child', type: 'text', content: 'current unsaved' }],
      },
    ],
    run: (snippets, { inFile }) => {
      assert.equal(readFileSync(inFile, 'utf8'), 'source');
      assert.ok(existsSync(join(dirname(inFile), 'fonts')));
      assert.equal(snippets.filter(s => s.startsWith('Export')).length, 2);
      assert.match(snippets[0], /current unsaved/);
      assert.doesNotMatch(snippets[0], /"id":"child"/);
      const rendered = join(dirname(inFile), 'rendered');
      mkdirSync(rendered);
      writeFileSync(join(rendered, 'new.png'), encodePng(image()));
      return [{ message: 'OK', ok: true, lines: ['MAP["F","new"]'] }];
    },
  };
  const [render] = exportFramesHeadless(['F'], out, opts);
  assert.deepEqual(render.buf, encodePng(image()));
  assert.equal(readFileSync(snapshot, 'utf8'), 'source');
  assert.throws(
    () => exportFramesHeadless(['F'], out, { ...opts, run: () => [] }),
    /missing export mapping/
  );
  assert.throws(
    () =>
      exportFramesHeadless(['F'], out, {
        ...opts,
        run: () => [{ message: 'OK', ok: true, lines: ['MAP["F","F"]'] }],
      }),
    /ENOENT/
  );
});

test('runPen writes and parses responses larger than 64 KiB through a file', () => {
  const large = 'x'.repeat(150_000);
  const [result] = runPen(['Print("large")'], {
    inFile: '/private/snapshot.pen',
    outFile: '/private/out.pen',
    spawn: (_bin, _args, opts) => {
      writeFileSync(
        opts.stdio[1],
        JSON.stringify({ message: `OK\n\n## Print output\n${large}\n` })
      );
      return { status: 0 };
    },
  });
  assert.equal(result.lines[0], large);
});
