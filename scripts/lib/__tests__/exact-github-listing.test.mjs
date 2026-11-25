import { describe, expect, it, vi } from 'vitest';
import { readExactGithubListing } from '../exact-github-listing.mjs';

const endpoint = 'repos/JovieInc/Jovie/actions/runs/42/attempts/3/jobs';
const firstPage = {
  total_count: 102,
  jobs: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
};
const secondPage = {
  total_count: 102,
  jobs: [{ id: 101 }, { id: 102, name: 'Main Release Ready' }],
};

function listing(second = secondPage) {
  const readPage = vi
    .fn()
    .mockReturnValueOnce(firstPage)
    .mockReturnValueOnce(second);
  return {
    readPage,
    read: () => readExactGithubListing(readPage, endpoint, 'jobs', 'CI jobs'),
  };
}

describe('exact GitHub listings', () => {
  it('reads both pages from the same exact CI attempt', () => {
    const { read, readPage } = listing();
    expect(read()).toEqual([...firstPage.jobs, ...secondPage.jobs]);
    expect(readPage.mock.calls).toEqual([
      [`${endpoint}?per_page=100`],
      [`${endpoint}?per_page=100&page=2`],
    ]);
  });

  it('rejects incomplete and inconsistent snapshots', () => {
    expect(() =>
      listing({ ...secondPage, jobs: [{ id: 101 }] }).read()
    ).toThrow('incomplete CI jobs listing');
    expect(() => listing({ ...secondPage, total_count: 103 }).read()).toThrow(
      'incomplete CI jobs listing'
    );
  });

  it('rejects repeated IDs across page boundaries', () => {
    expect(() =>
      listing({ ...secondPage, jobs: [{ id: 100 }, { id: 102 }] }).read()
    ).toThrow('invalid ID');
  });
});
