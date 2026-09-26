#!/usr/bin/env bash
# Firecrawl full-site crawl + dedupe registry (JOV-4880).
# /v1/map -> diff vs url->{lastCrawledAt,contentHash} -> /v1/batch/scrape the
# delta -> update registry, so repeat runs only fetch new/stale URLs.
# Needs FIRECRAWL_API_KEY; it is never printed. Requires curl + jq.
set -euo pipefail

API=https://api.firecrawl.dev
REGISTRY_DIR="$(cd "$(dirname "$0")" && pwd)/.cache/firecrawl-registry" # gitignored .cache/
LIMIT=100; MAX_AGE_DAYS=7; SITEMAP=include; IGNORE_QP=false; CONCURRENCY=4
POLL_S=5; TIMEOUT_S=1800

usage() { sed -n '2,5p' "$0"; echo "Usage: $0 map|crawl <url> [--limit n] [--max-age-days n] [--sitemap include|only|skip] [--ignore-query-params] [--max-concurrency n] [--dry-run]"; }
die() { echo "firecrawl-crawl: $*" >&2; exit 1; }

cmd=${1:-}; url=${2:-}; EXTRA=()
[ $# -ge 1 ] && shift 2 || true
while [ $# -gt 0 ]; do
  case "$1" in
    --limit) LIMIT=$2; shift 2;;
    --max-age-days) MAX_AGE_DAYS=$2; shift 2;;
    --sitemap) SITEMAP=$2; shift 2;;
    --ignore-query-params) IGNORE_QP=true; shift;;
    --max-concurrency) CONCURRENCY=$2; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) usage; exit 0;;
    -*) die "unknown argument: $1";;
    *) EXTRA+=("$1"); shift;;
  esac
done
case " include only skip " in *" $SITEMAP "*) ;; *) die "--sitemap must be include|only|skip";; esac
[ "$LIMIT" -gt 0 ] 2>/dev/null || die "--limit must be > 0"

site=$(echo "$url" | sed -E 's#^https?://([^/]+).*#\1#')
reg="$REGISTRY_DIR/$site.json"
now=$(date -u +%s)

# diff <urls-file> -> due URL list (pure; no network)
diff_urls() {
  cutoff=$((now - MAX_AGE_DAYS * 86400))
  jq -nR --arg cutoff "$cutoff" --slurpfile reg "$reg" '
    ([inputs] | unique) as $urls
    | ($reg[0].pages // {}) as $p
    | { due: [$urls[] | select(
          ($p[.] == null) or (($p[.].lastCrawledAt | sub("\\..*Z$";"Z") | fromdateiso8601) <= ($cutoff | tonumber)))],
        fresh: [$urls[] | select(
          ($p[.] != null) and (($p[.].lastCrawledAt | sub("\\..*Z$";"Z") | fromdateiso8601) > ($cutoff | tonumber)))] }'
}

fc() { # fc <method> <path> [json-body] -> response body on stdout
  local m=$1 p=$2 b=${3:-} out
  out=$(curl -sfS -X "$m" "$API$p" -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
    -H 'Content-Type: application/json' ${b:+-d "$b"}) || die "Firecrawl $p failed"
  echo "$out" | jq -e '.success != false' > /dev/null || die "Firecrawl $p failed"
  echo "$out"
}

# diff <urls-file> is a pure registry-vs-URL diff (no network, no key needed)
if [ "$cmd" = diff ]; then
  reg=${EXTRA[0]:-${REG_FILE:-}}
  [ -n "$reg" ] || die "diff needs REG_FILE=<registry.json> or a path arg"
  [ -f "$reg" ] || echo '{"version":1,"pages":{}}' > "$reg"
  now=$(date -u +%s)
  diff_urls < "${url:?usage: diff <urls-file> <registry.json>}"
  exit 0
fi

case "$cmd" in
  map|crawl) :;;
  *) usage; exit 1;;
esac
[ -n "$url" ] || die "missing <url>"
[ -n "${FIRECRAWL_API_KEY:-}" ] || die "FIRECRAWL_API_KEY is not set"
mkdir -p "$REGISTRY_DIR"
[ -f "$reg" ] || echo '{"version":1,"pages":{}}' > "$reg"

links=$(fc POST /v1/map "$(jq -nc --arg u "$url" --arg s "$SITEMAP" --argjson q "$IGNORE_QP" \
  '{url:$u, sitemap:$s} + (if $q then {ignoreQueryParameters:true} else {} end)')" | jq -r '.links[]? | if type=="string" then . else .url end')
delta=$(echo "$links" | diff_urls)
due=$(echo "$delta" | jq -r '.due[]')
due_n=$(echo "$delta" | jq '.due | length')
[ "$due_n" -gt "$LIMIT" ] && { due=$(echo "$due" | head -n "$LIMIT"); due_n=$LIMIT; }
jq -n --arg s "$site" --arg r "$reg" --argjson m "$(echo "$links" | grep -c . || true)" \
  --argjson d "$due_n" --argjson f "$(echo "$delta" | jq '.fresh | length')" \
  '{site:$s, registry:$r, mapped:$m, due:$d, fresh:$f, estimatedCredits:$d}'
[ "$cmd" = map ] && { echo "$due"; exit 0; }
[ "${DRY_RUN:-}" = 1 ] || [ "$due_n" -eq 0 ] && exit 0

job=$(fc POST /v1/batch/scrape "$(jq -nc --argjson u "$(echo "$due" | jq -Rn '[inputs]')" \
  --argjson c "$CONCURRENCY" '{urls:$u, formats:["markdown"], maxConcurrency:$c}')")
job_id=$(echo "$job" | jq -r '.id // .jobId')
[ -n "$job_id" ] && [ "$job_id" != null ] || die "no job id returned"
echo "batch scrape job: $job_id ($due_n pages)"

deadline=$((now + TIMEOUT_S))
while :; do
  sleep "$POLL_S"
  st=$(fc GET "/v1/batch/scrape/$job_id")
  s=$(echo "$st" | jq -r '.status')
  [ "$s" = completed ] && break
  [ "$s" = failed ] || [ "$s" = cancelled ] && die "job $job_id $s"
  [ "$(date -u +%s)" -lt "$deadline" ] || die "job $job_id timed out ($s)"
done

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
entries='{}'
while IFS= read -r row; do
  u=$(echo "$row" | jq -r '.url // empty'); md=$(echo "$row" | jq -r '.markdown // empty')
  [ -n "$u" ] && [ -n "$md" ] || continue
  h=$(printf %s "$md" | sha256sum | cut -d' ' -f1)
  entries=$(echo "$entries" | jq --arg u "$u" --arg h "$h" '.[$u]=$h')
done < <(echo "$st" | jq -c '.data[] | {url:(.metadata.sourceURL // .url), markdown}')
jq --arg ts "$ts" --argjson e "$entries" \
  '.updatedAt = $ts | .pages = (.pages + ($e | with_entries(.value = {lastCrawledAt:$ts, contentHash:.value})))' \
  "$reg" > "$reg.tmp" && mv "$reg.tmp" "$reg"
echo "done: $(echo "$entries" | jq length) pages recorded in $reg"
