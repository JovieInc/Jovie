#!/usr/bin/env node
// pen-slice.mjs <src.pen> <out.pen> <frameId...>
// Writes a small job input (target frames + referenced components). See README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { sliceDoc } from './pen-par-lib.mjs';

const [src, out, ...targets] = process.argv.slice(2);
if (!src || !out || targets.length === 0) {
  console.error('usage: pen-slice.mjs <src.pen> <out.pen> <frameId...>');
  process.exit(64);
}
if (out === src) {
  console.error('refusing to overwrite the source file');
  process.exit(9);
}
const { slice, components, nodes } = sliceDoc(
  JSON.parse(readFileSync(src, 'utf8')),
  targets
);
writeFileSync(out, JSON.stringify(slice, null, 2));
console.log(
  JSON.stringify({
    out,
    targets,
    components,
    nodes,
    bytes: JSON.stringify(slice).length,
  })
);
