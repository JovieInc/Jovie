import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  classifyProductLanes,
  ProductLaneClassificationError,
} from '../product-lane-classifier.mjs';

export function defineRepositoryClassificationTests() {
  it('rejects unknown paths and maps every tracked path', () => {
    expect(() => classifyProductLanes(['new-product/main.ts'])).toThrow(
      ProductLaneClassificationError
    );
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
    expect(() => classifyProductLanes(tracked)).not.toThrow();
  });
}
