import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Read a complete, stable snapshot of a completed run's jobs or artifacts. */
export function readExactGithubListing(readPage, endpoint, key, label) {
  const records = [];
  const ids = new Set();
  let total = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = readPage(
      `${endpoint}?per_page=${PAGE_SIZE}${page === 1 ? '' : `&page=${page}`}`
    );
    const rows = payload?.[key];
    if (
      !Number.isSafeInteger(payload?.total_count) ||
      payload.total_count < 0 ||
      payload.total_count > PAGE_SIZE * MAX_PAGES ||
      (total !== null && payload.total_count !== total) ||
      !Array.isArray(rows) ||
      rows.length !== Math.min(PAGE_SIZE, payload.total_count - records.length)
    ) {
      throw new Error(`GitHub returned an incomplete ${label} listing`);
    }
    total = payload.total_count;
    for (const row of rows) {
      if (!Number.isSafeInteger(row?.id) || row.id <= 0 || ids.has(row.id)) {
        throw new Error(
          `GitHub returned an invalid ID in the ${label} listing`
        );
      }
      ids.add(row.id);
      records.push(row);
    }
    if (records.length === total) return records;
  }
  throw new Error(`GitHub exceeded the ${label} page budget`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const pages = JSON.parse(readFileSync(0, 'utf8'));
    if (!Array.isArray(pages)) {
      throw new Error('Expected paginated exact CI job evidence');
    }
    let index = 0;
    const jobs = readExactGithubListing(
      () => pages[index++],
      '',
      'jobs',
      'exact CI jobs'
    );
    if (index !== pages.length) {
      throw new Error('GitHub returned unexpected extra CI job pages');
    }
    process.stdout.write(JSON.stringify({ total_count: jobs.length, jobs }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
