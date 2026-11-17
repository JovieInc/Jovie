import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachWaitlistDiagnostics } from '../../e2e/fixtures/waitlist-composition-evidence';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'waitlist-evidence-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  );
});

function evidence(
  failure?: unknown,
  screenshotFailure?: unknown
): Parameters<typeof attachWaitlistDiagnostics>[3] {
  return {
    theme: 'light',
    option: 'artist',
    events: [{ key: 'Enter', isComposing: true, defaultPrevented: false }],
    pageErrors: [],
    resourceErrors: [],
    failure,
    screenshotFailure,
  };
}

describe('waitlist composition evidence retention', () => {
  it('writes filesystem evidence even when attachment fails, then rejects that failure', async () => {
    const root = await fixture();
    const attachment = new Error('attachment unavailable');
    const attach = vi.fn<TestInfo['attach']>().mockRejectedValue(attachment);
    const dir = join(root, 'evidence');

    await expect(
      attachWaitlistDiagnostics({ attach }, dir, 'proof', evidence())
    ).rejects.toBe(attachment);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(join(dir, 'proof.json'), 'utf8'))).toEqual(
      {
        ...evidence(),
        failure: null,
        screenshotFailure: null,
      }
    );
  });

  it('retains the attachment even when filesystem evidence cannot be written', async () => {
    const root = await fixture();
    const occupied = join(root, 'occupied');
    await writeFile(occupied, 'a regular file cannot contain evidence');
    const attach = vi.fn<TestInfo['attach']>().mockResolvedValue(undefined);

    await expect(
      attachWaitlistDiagnostics({ attach }, occupied, 'proof', evidence())
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(attach).toHaveBeenCalledTimes(1);
    const [name, options] = attach.mock.calls[0];
    expect(name).toBe('proof.json');
    if (!options) throw new Error('Expected JSON attachment options');
    expect(options.contentType).toBe('application/json');
    expect(JSON.parse(String(options.body))).toMatchObject({
      events: evidence().events,
      failure: null,
      screenshotFailure: null,
    });
  });

  it.each(['primary', 'screenshot'] as const)(
    'keeps the %s failure first while preserving both retention failures',
    async priority => {
      const root = await fixture();
      const occupied = join(root, 'occupied');
      await writeFile(occupied, 'a regular file cannot contain evidence');
      const primary =
        priority === 'primary'
          ? new Error('original assertion failed')
          : undefined;
      const screenshot = new Error('screenshot unavailable');
      const attachment = new Error('attachment unavailable');
      const attach = vi.fn<TestInfo['attach']>().mockRejectedValue(attachment);
      let caught: unknown;
      try {
        await attachWaitlistDiagnostics(
          { attach },
          occupied,
          'proof',
          evidence(primary, screenshot)
        );
      } catch (error) {
        caught = error;
      }
      if (!(caught instanceof AggregateError)) throw caught;

      const expected = primary ?? screenshot;
      expect(caught.cause).toBe(expected);
      expect(caught.message).toBe(expected.message);
      expect(caught.errors[0]).toBe(expected);
      expect(caught.errors).toContain(screenshot);
      expect(caught.errors).toContain(attachment);
      expect(caught.errors.at(-1)).toMatchObject({ code: 'EEXIST' });
      expect(caught.errors).toHaveLength(primary ? 4 : 3);
      expect(attach).toHaveBeenCalledTimes(1);
    }
  );
});
