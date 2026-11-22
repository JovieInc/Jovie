import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, './AddConnectionRail.tsx'),
  'utf8'
);

describe('AddConnectionRail inset (JOV-12568)', () => {
  it('insets the header by the drawer caller convention', () => {
    expect(source).toContain("<EntityHeader\n          className='px-3 pt-3'");
  });

  it('puts choice rows on the plate rule: plate at 4, content at 12', () => {
    expect(source).toContain(
      "<DrawerSection sectionKind='details' surface='plain' className='p-1'>"
    );
    expect(source).toContain(
      "'group flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left"
    );
    expect(source).not.toContain('rounded-lg px-3 py-3 text-left');
  });

  it('gives the public profile title and body one 12px inset', () => {
    expect(source).toContain("className='flex h-full min-h-0 flex-col px-3'");
    expect(source).toContain("'flex min-h-72 flex-1 flex-col gap-3 pb-2'");
    expect(source).not.toContain(
      "'flex min-h-72 flex-1 flex-col gap-3 px-3 pb-2'"
    );
  });
});
