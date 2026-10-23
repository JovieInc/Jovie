// biome-ignore-all format: compact test for the advisory triptych comment.
// biome-ignore-all assist/source/organizeImports: compact test keeps imports together.
import assert from 'node:assert/strict'; import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { test } from 'node:test';
import { COMMENT_MARKER, upsertTriptychComment } from './pen-still-diff-comment.mjs';
test('upsert posts the triptych then deletes the previous marker comment', () => {
const dir = mkdtempSync(join(tmpdir(), 'pen-comment-')); const bodyFile = join(dir, 'comment.md');
const image = join(dir, 'triptych.png');
writeFileSync(bodyFile, `${COMMENT_MARKER}\n![Pen, render, and diff](triptych.png)\n`);
writeFileSync(image, 'png'); const calls = []; const exec = (_cmd, args) => { calls.push(args);
if (args[0] === 'api' && args[1] === '--paginate') {
return JSON.stringify([{ id: 7, body: `old\n${COMMENT_MARKER}` }, { id: 8, body: 'unrelated' }]); } return '';
}; const result = upsertTriptychComment({ pr: '12', repo: 'JovieInc/Jovie', bodyFile, image, exec });
assert.deepEqual(result, { posted: true, removed: 1 });
assert.deepEqual(calls[1].slice(0, 4), ['pr', 'comment', '12', '--repo']);
assert.ok(calls[1].includes('--attach')); assert.equal(calls[2][1], '-X');
assert.match(calls[2].at(-1), /comments\/7$/); });
