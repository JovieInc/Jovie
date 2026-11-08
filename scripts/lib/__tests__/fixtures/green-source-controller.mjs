import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function createGreenSourceController({
  repoRoot,
  head,
  writerBody,
  checks,
}) {
  const greenChecksJson = JSON.stringify(checks);

  function readFileSyncSafe(path) {
    try {
      return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  function runController(snapshot, env = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'green-source-'));
    try {
      const states = Object.fromEntries(
        snapshot.map(pr => [
          String(pr.number),
          {
            data: {
              repository: {
                pullRequest: {
                  isDraft: pr.isDraft,
                  headRefOid: head,
                  headRefName: pr.headRefName,
                  baseRefName: pr.baseRefName,
                  body: pr.body ?? writerBody(pr.number),
                  author: Object.hasOwn(pr, 'rawAuthor')
                    ? pr.rawAuthor
                    : {
                        __typename: 'User',
                        login: pr.authorLogin ?? 'itstimwhite',
                      },
                  title: pr.title,
                  state: 'OPEN',
                  mergeable: pr.mergeable,
                  mergeStateStatus: pr.mergeStateStatus,
                  labels: { nodes: pr.labels },
                  timelineItems: { nodes: pr.timeline ?? [] },
                },
              },
            },
          },
        ])
      );
      writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
      writeFileSync(join(dir, 'states.json'), JSON.stringify(states));
      writeFileSync(join(dir, 'checks.json'), greenChecksJson);
      const fakeGh = `#!/usr/bin/env bash
set -euo pipefail
D="${dir}"
echo "$1 $2 $3" >> "$D/calls.log"
args=("$@")
jq_expr=""
query=""
cursor=""
for ((i=0; i<\${#args[@]}; i++)); do
  if [[ "\${args[$i]}" == "--jq" ]]; then jq_expr="\${args[$((i+1))]}"; fi
done
for a in "$@"; do
  [[ "$a" == query=* ]] && query="\${a#query=}"
  [[ "$a" == endCursor=* ]] && cursor="\${a#endCursor=}"
done
emit() { if [[ -n "$jq_expr" ]]; then jq -r "$jq_expr"; else cat; fi; }
case "$1 $2" in
  "pr list")
    if [[ "\${COHORT_RESOURCE_LIMIT:-}" == "1" ]]; then
      echo 'GraphQL: Resource limits for this query exceeded. (repository.pullRequests.nodes.1.number)' >&2
      exit 1
    fi
    cat "$D/snapshot.json" | emit ;;
  "pr checks") cat "$D/checks.json" ;;
  "api graphql")
    if [[ "$query" == *"pullRequests("* ]]; then
      page_size="$(sed -nE 's/.*pullRequests\\(first:([0-9]+).*/\\1/p' <<<"$query")"
      if [[ -z "$page_size" || "$page_size" -gt 20 ]]; then
        echo 'GraphQL: Resource limits for this query exceeded' >&2
        exit 1
      fi
      start="\${cursor:-0}"
      echo "$start" >> "$D/pages.log"
      if [[ "\${FAIL_COHORT_PAGE:-}" == "$start" ]]; then
        echo 'GraphQL: discovery page unavailable' >&2
        exit 1
      fi
      jq --argjson start "$start" --argjson size "$page_size" '
        {data: {repository: {pullRequests: {
          nodes: (.[$start:$start + $size] | map(.labels = {nodes: .labels})),
          pageInfo: {hasNextPage: (length > $start + $size), endCursor: (($start + $size) | tostring)}
        }}}}
      ' "$D/snapshot.json" | emit
      exit 0
    fi
    n=""
    for a in "$@"; do [[ "$a" == number=* ]] && n="\${a#number=}"; done
    count=0
    [[ -f "$D/reads-$n" ]] && count="$(cat "$D/reads-$n")"
    count=$((count + 1)); echo "$count" > "$D/reads-$n"
    state="$(jq -c --arg n "$n" '.[$n]' "$D/states.json")"
    if [[ "$count" -ge 2 && -n "\${STATE_AFTER_FIRST_READ:-}" ]]; then
      state="$(jq --argjson patch "$STATE_AFTER_FIRST_READ" '.data.repository.pullRequest += $patch' <<<"$state")"
    fi
    emit <<<"$state" ;;
  "pr ready")
    draft=false
    [[ " $* " == *" --undo "* ]] && draft=true
    jq --arg n "$3" --argjson draft "$draft" '.[$n].data.repository.pullRequest.isDraft = $draft' "$D/states.json" > "$D/next.json"
    mv "$D/next.json" "$D/states.json" ;;
  *)
    if [[ "$1" == "api" && "$2" == repos/*/commits/*/pulls ]]; then
      sha="\${2%/pulls}"; sha="\${sha##*/}"
      jq -c --arg sha "$sha" '[.[] | {number, state: "open", base: {ref: .baseRefName}, head: {sha: $sha}}]' "$D/snapshot.json" | emit
    fi ;;
esac
`;
      writeFileSync(join(dir, 'gh'), fakeGh);
      chmodSync(join(dir, 'gh'), 0o755);
      /** @type {NodeJS.ProcessEnv} */
      const spawnEnv = {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        DRY_RUN: '1',
        MISSED_COHORT: '3',
        RUN_OFFSET: '0',
        TARGET_PR: '',
        TARGET_HEAD: '',
        GH_RETRY_ATTEMPTS: '1',
        STATE_AFTER_FIRST_READ: '',
        COHORT_RESOURCE_LIMIT: '',
        FAIL_COHORT_PAGE: '',
        ...env,
      };
      if (env.HEAD_PR_CACHE_DIR) {
        const cacheDir = join(dir, env.HEAD_PR_CACHE_DIR);
        mkdirSync(cacheDir, { recursive: true });
        spawnEnv.HEAD_PR_CACHE_DIR = cacheDir;
        if (env.SEED_HEAD_PR && env.TARGET_HEAD) {
          writeFileSync(
            join(cacheDir, String(env.TARGET_HEAD).toLowerCase()),
            `${env.SEED_HEAD_PR}\n`
          );
        }
      }
      delete spawnEnv.SEED_HEAD_PR;
      const result = spawnSync(
        'bash',
        [resolve(repoRoot, 'scripts/auto-ready-green-drafts.sh')],
        {
          encoding: 'utf8',
          env: spawnEnv,
        }
      );
      let calls = [];
      try {
        calls = readFileSync(join(dir, 'calls.log'), 'utf8')
          .split('\n')
          .filter(Boolean);
      } catch {}
      const pageStarts = readFileSyncSafe(join(dir, 'pages.log'));
      return { ...result, calls, pageStarts };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return runController;
}
