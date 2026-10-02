import { createHash } from 'node:crypto';
import { extractDailyReceipts } from './daily-changelog.mjs';
import { readCustomerNote } from './daily-changelog-publication.mjs';

/** Batch PR reads; no per-commit API polling and no title-to-copy fallback. */
export async function collectCustomerCandidates({
  markdown,
  marker,
  seed = [],
  git,
  graphql,
  fetchPage,
  observedAt,
}) {
  const receipts = extractDailyReceipts(markdown);
  const publication = receipts.find(receipt => receipt.publicationHead);
  const baseline = publication?.publicationHead;
  const range = baseline ? `${baseline}..${marker.sha}` : marker.sha;
  const args = ['log', '--first-parent', '--format=%s', '--max-count=5001'];
  if (!baseline) args.push('--since=2026-08-31T00:00:00Z');
  args.push(range);
  const subjects = (await git(args)).trim().split('\n');
  if (subjects.length > 5000)
    throw new Error(
      'Changelog recovery range exceeds bounded collection budget'
    );
  const numbers = new Set(
    subjects.flatMap(subject => {
      const number = /\(#(\d+)\)$/.exec(subject)?.[1];
      return number ? [Number(number)] : [];
    })
  );
  // Carry explicit overflow forward even after advancing the publication cursor.
  for (const id of [
    ...(publication?.deferred ?? []),
    ...(publication?.pending ?? []),
  ]) {
    const number = /#(\d+)@/.exec(id)?.[1];
    if (number) numbers.add(Number(number));
  }
  for (const entry of seed) {
    if (!Number.isSafeInteger(entry.number) || entry.number < 1)
      throw new Error('Invalid recovery PR number');
    numbers.add(entry.number);
  }
  const seeds = new Map(seed.map(entry => [entry.number, entry.note]));
  const candidates = [];
  const ordered = [...numbers].sort((a, b) => a - b);
  for (let offset = 0; offset < ordered.length; offset += 50) {
    const batch = ordered.slice(offset, offset + 50);
    const fields = batch
      .map(
        number =>
          `p${number}:pullRequest(number:${number}){number state baseRefName url body mergeCommit{oid}}`
      )
      .join('\n');
    const response = await graphql(
      `query { repository(owner:"JovieInc",name:"Jovie") { ${fields} } }`
    );
    if (response.errors || !response.data?.repository)
      throw new Error('PR provenance collection failed');
    for (const number of batch) {
      const pr = response.data.repository[`p${number}`];
      if (!pr) throw new Error(`Missing PR provenance #${number}`);
      if (seeds.has(number))
        pr.body = `${pr.body ?? ''}\n<!-- customer-changelog/v1 ${JSON.stringify(seeds.get(number))} -->`;
      const { note } = readCustomerNote(pr.body);
      const candidate = {
        pr,
        ancestor: false,
        evidencePassed: false,
        evidenceReceipts: [],
      };
      if (
        note &&
        pr.state === 'MERGED' &&
        /^[a-f0-9]{40}$/.test(pr.mergeCommit?.oid ?? '')
      ) {
        candidate.ancestor =
          (await git(
            ['merge-base', '--is-ancestor', pr.mergeCommit.oid, marker.sha],
            { status: true }
          )) === 0;
        if (candidate.ancestor) {
          candidate.evidencePassed = true;
          for (const evidence of note.evidence) {
            try {
              const page = await fetchPage(evidence.url);
              const text = await page.text();
              const passed = page.ok && text.includes(evidence.contains);
              candidate.evidencePassed &&= passed;
              candidate.evidenceReceipts.push({
                url: evidence.url,
                status: page.status,
                passed,
                observedAt,
                sha256: createHash('sha256').update(text).digest('hex'),
              });
            } catch {
              candidate.evidencePassed = false;
              candidate.evidenceReceipts.push({
                url: evidence.url,
                passed: false,
                observedAt,
              });
            }
          }
        }
      }
      candidates.push(candidate);
    }
  }
  return candidates;
}
