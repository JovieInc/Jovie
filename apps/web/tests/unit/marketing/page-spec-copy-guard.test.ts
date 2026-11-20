import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_SPEC_COPY_GUARDED_FILES } from '@/data/marketing/pageSpecMigrated';
import { findHardcodedCopy } from '@/lib/content-records/page-spec-guard';

describe('page-spec hardcoded copy guard', () => {
  it('flags JSX sentences and copy props, and honors copy-allow', () => {
    const source = [
      'const a = <p>Hello there friend</p>;',
      "const b = <Card title='A fresh headline' />;",
      "const c = <Card aria-label='Footer' />;",
      '// copy-allow: legal text',
      'const d = <p>All rights reserved</p>;',
    ].join('\n');
    expect(findHardcodedCopy(source).map(f => [f.line, f.kind])).toEqual([
      [1, 'jsx-text'],
      [2, 'prop'],
    ]);
  });

  it.each(PAGE_SPEC_COPY_GUARDED_FILES)(
    '%s carries no hardcoded copy (it renders from a content record)',
    file => {
      const source = readFileSync(resolve(__dirname, '../../..', file), 'utf8');
      expect(findHardcodedCopy(source, file)).toEqual([]);
    }
  );
});
