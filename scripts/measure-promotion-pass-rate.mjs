// Measures the promotion bar from real data (read-only GitHub GraphQL).
// usage: node scripts/measure-promotion-pass-rate.mjs JovieInc/Jovie 2026-11-05
// Output: promoted (READY_FOR_REVIEW events), first-pass lands, ejected, Wilson lower bound.
// api-budget: github-app-graphql 60/hr - read-only promotion cohort measurement
import { createGitHubClient } from '../packages/api-client/github.ts';
import { lowerBound } from './lib/promotion-readiness.mjs';

const [repo, since] = process.argv.slice(2);
const q = `query($q:String!,$c:String){search(type:ISSUE,query:$q,first:50,after:$c){pageInfo{hasNextPage endCursor}
 nodes{... on PullRequest{number merged headRefOid timelineItems(first:100,itemTypes:[READY_FOR_REVIEW_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,ADDED_TO_MERGE_QUEUE_EVENT,HEAD_REF_FORCE_PUSHED_EVENT]){
 nodes{__typename ... on RemovedFromMergeQueueEvent{reason createdAt} ... on ReadyForReviewEvent{createdAt}}}}}}}`;
const client = createGitHubClient({
  token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
});
let c = null,
  rows = [];
do {
  const data = await client.graphql(
    q,
    { q: `repo:${repo} is:pr updated:>=${since}`, c },
    { priority: 'report' }
  );
  const s = data.search;
  rows.push(...s.nodes);
  c = s.pageInfo.hasNextPage ? s.pageInfo.endCursor : null;
} while (c);
const promoted = rows.filter(r =>
  r.timelineItems.nodes.some(
    n => n.__typename === 'ReadyForReviewEvent' && n.createdAt >= since
  )
);
const ejectedReasons = {};
let clean = 0,
  resolved = 0;
for (const r of promoted) {
  const rem = r.timelineItems.nodes.filter(
    n => n.__typename === 'RemovedFromMergeQueueEvent'
  );
  for (const e of rem)
    ejectedReasons[e.reason || 'unknown'] =
      (ejectedReasons[e.reason || 'unknown'] || 0) + 1;
  if (r.merged || rem.length) resolved++;
  if (r.merged && rem.length === 0) clean++;
}
console.log(
  JSON.stringify(
    {
      repo,
      since,
      promoted: promoted.length,
      resolved,
      firstPassClean: clean,
      rate: resolved ? clean / resolved : null,
      lower95: lowerBound(clean, resolved),
      ejectedReasons,
    },
    null,
    1
  )
);
