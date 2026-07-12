import { describe, expect, it } from 'vitest';
import {
  parseListedFiles,
  validatePartition,
} from '@/scripts/validate-vitest-lane-partition';

describe('Vitest lane partition', () => {
  it('parses test files while ignoring tool chatter', () => {
    expect(
      parseListedFiles(
        'dotenv message\ntests/unit/a.test.ts\ncomponents/a.spec.tsx\n'
      )
    ).toEqual(['components/a.spec.tsx', 'tests/unit/a.test.ts']);
  });

  it('accepts an exact non-overlapping partition', () => {
    const node = Array.from(
      { length: 150 },
      (_, index) => `node-${index}.test.ts`
    );
    expect(
      validatePartition([...node, 'dom.test.ts'], node, ['dom.test.ts'], node)
    ).toEqual({ fastCount: 151, nodeCount: 150, domCount: 1 });
  });

  it.each([
    {
      name: 'overlap',
      node: ['a.test.ts'],
      dom: ['a.test.ts', 'b.test.ts'],
      message: 'Lane overlap',
    },
    {
      name: 'missing file',
      node: ['a.test.ts'],
      dom: [],
      message: 'DOM lane selected zero files',
    },
    {
      name: 'manifest drift',
      node: ['a.test.ts'],
      dom: ['b.test.ts'],
      manifest: ['b.test.ts'],
      message: 'explicit manifest',
    },
  ])('fails closed on $name', ({ node, dom, manifest, message }) => {
    expect(() =>
      validatePartition(['a.test.ts', 'b.test.ts'], node, dom, manifest ?? node)
    ).toThrow(message);
  });
});
