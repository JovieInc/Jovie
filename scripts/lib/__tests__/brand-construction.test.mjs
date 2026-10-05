import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

const source = fileURLToPath(
  new URL('../../../packages/brand/font/construction.py', import.meta.url)
);

describe('brand construction quadratic contours', () => {
  it('profiles quadratic outlines and preserves the next segment endpoint', () => {
    // Load the real dependency-free profiling code without importing font
    // builders or generating artifacts during ordinary native CI.
    execFileSync(
      'python3',
      [
        '-c',
        String.raw`
import ast, math, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
nodes = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in ('_Flatten', 'profile')]
assert len(nodes) == 2
namespace = {}
exec(compile(ast.Module(body=nodes, type_ignores=[]), sys.argv[1], 'exec'), namespace)

class QuadraticContour:
    def draw(self, pen):
        pen.moveTo((0, 0))
        pen.qCurveTo((10, 20), (20, 0))
        pen.closePath()

samples = namespace['profile'](QuadraticContour(), [2, 5, 9, 11])
for y, sample in zip([2, 5, 9], samples):
    half_width = 10 * math.sqrt(1 - y / 10)
    assert math.isclose(sample[0], 10 - half_width, abs_tol=0.04), sample
    assert math.isclose(sample[1], 10 + half_width, abs_tol=0.04), sample
assert samples[-1] is None

pen = namespace['_Flatten']()
pen.moveTo((0, 0))
pen.qCurveTo((10, 20), (20, 0))
assert len(pen.edges) == 32
assert pen.edges[15][1] == (10, 10)
pen.lineTo((30, 0))
assert pen.edges[-1] == ((20, 0), (30, 0))
pen.closePath()
assert pen.edges[-1] == ((30, 0), (0, 0))
`,
        source,
      ],
      { stdio: 'pipe' }
    );
  });
});
