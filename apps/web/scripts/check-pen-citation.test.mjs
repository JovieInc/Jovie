import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPenCitation, main } from './check-pen-citation.mjs';

/** @param {string[]} files @param {string} body */
function run(files, body, lenient = false) {
  return checkPenCitation({
    files,
    body,
    lenient,
    log: () => {},
    error: () => {},
  });
}

const VISUAL = 'apps/web/components/marketing/Hero.tsx';
const NON_VISUAL = 'apps/web/lib/some-helper.ts';
const TEST_FILE = 'apps/web/components/marketing/Hero.test.tsx';

describe('pen citation check (JOV-13066)', () => {
  /** @type {string | undefined} */
  let dir;

  afterEach(() => {
    if (dir) {
      // fixtures are throwaway tmp dirs; nothing to assert on cleanup
      dir = undefined;
    }
  });

  it('passes when no marketing visual surface changed', () => {
    const r = run([NON_VISUAL, TEST_FILE], '');
    expect(r).toEqual({ code: 0, reason: 'no-visual-diff' });
  });

  it('passes when the body cites a Pen node', () => {
    const r = run(
      [VISUAL],
      'Design: approved Pen node ZiaWI (file 01M7KTWMXH4J5N38VKMZFKAAWW).'
    );
    expect(r).toEqual({ code: 0, reason: 'pen-cited' });
  });

  it('passes when the body states no visual change', () => {
    const r = run([VISUAL], 'Copy-only PR — no visual change.');
    expect(r).toEqual({ code: 0, reason: 'no-visual-change' });
  });

  it('fails closed when a visual diff has neither a Pen cite nor a no-visual-change statement', () => {
    const r = run(
      [VISUAL],
      'Looks right in the Figma file UDjBSqpsyjZf8azmurmRHX.'
    );
    expect(r.code).toBe(1);
    expect(r.reason).toBe('missing-citation');
  });

  it('reports and exits 0 in lenient (informational) mode', () => {
    const r = run([VISUAL], '', true);
    expect(r).toEqual({ code: 0, reason: 'missing-citation-lenient' });
  });

  it('reads the inputs from files via main()', () => {
    dir = mkdtempSync(join(tmpdir(), 'pen-cite-'));
    const filesPath = join(dir, 'files.txt');
    const bodyPath = join(dir, 'body.md');
    writeFileSync(filesPath, `${VISUAL}\n`);
    writeFileSync(bodyPath, 'no visual change');
    expect(main(['--files-file', filesPath, '--body-file', bodyPath])).toBe(0);
    writeFileSync(bodyPath, 'Figma is canonical now');
    expect(main(['--files-file', filesPath, '--body-file', bodyPath])).toBe(1);
    expect(main([])).toBe(2);
  });
});
