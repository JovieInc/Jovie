import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { certifyArtistProfile } from './certify-artist-profile';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(path => rm(path, { recursive: true, force: true }))
  );
});
async function output() {
  const path = await mkdtemp(join(tmpdir(), 'artist-proof-test-'));
  directories.push(path);
  return path;
}
const html = `<link rel="canonical" href="https://jov.ie/tim"><script type="application/ld+json">{"@graph":[{"@id":"https://jov.ie/tim#musicgroup","sameAs":["${TIM_WHITE_PROFILE.spotifyUrl}"]}]}</script><section data-testid="profile-aeo-content"><a href="/tim">Tim White</a><a href="/broken">other</a><a href="https://example.com/">external</a></section>`;

describe('artist proof collector', () => {
  it('persists raw evidence and failure receipts, probes only same-origin links and never follows redirects', async () => {
    const directory = await output();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 404 }));
    const result = await certifyArtistProfile(['--output', directory], fetcher);
    expect(result.failed).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://jov.ie/tim',
      'https://jov.ie/broken',
      'https://jov.ie/tim',
    ]);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === 'manual')
    ).toBe(true);
    const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
    expect(report).toMatchObject({
      publicationApproved: false,
      accountOwnership: 'unverified',
      searchVisibilityScore: null,
      action: null,
      attribution: 'unverified',
    });
    expect(await readdir(directory)).toHaveLength(3);
    expect(
      await readFile(join(directory, `${report.snapshot.id}.html`), 'utf8')
    ).toBe(html);
  });
  it('records redirect provenance as failure, never a successful profile', async () => {
    const directory = await output();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { location: 'https://example.com/' },
      })
    );
    const result = await certifyArtistProfile(['--output', directory], fetcher);
    expect(result.failed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
    expect(report.response).toMatchObject({
      status: 302,
      location: 'https://example.com/',
    });
    expect(report.snapshot.checks[0].status).toBe('fail');
    const redirectedProbe = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 307 }));
    const incomplete = await certifyArtistProfile(
      ['--output', directory],
      redirectedProbe
    );
    expect(incomplete.failed).toBe(true);
  });
  it('records unknown probes, compares immutable snapshots and validates required arguments', async () => {
    const directory = await output();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        if (init?.cache === 'no-store')
          return new Response(html, { status: 200 });
        throw new Error('timeout');
      });
    const baseline = await certifyArtistProfile(
      ['--output', directory],
      fetcher
    );
    const result = await certifyArtistProfile(
      ['--output', directory, '--baseline', baseline.snapshotPath],
      fetcher
    );
    expect(result.failed).toBe(true);
    expect(result.comparison).toMatchObject({
      comparable: true,
      fixed: [],
      delta: 0,
    });
    const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
    expect(
      report.linkChecks.every(
        (check: { status: unknown }) => check.status === null
      )
    ).toBe(true);
    expect(await readdir(directory)).toHaveLength(6);
    await expect(certifyArtistProfile([], fetcher)).rejects.toThrow('--output');
    await expect(
      certifyArtistProfile(['--output', '--baseline'], fetcher)
    ).rejects.toThrow('requires a value');
  });
});
