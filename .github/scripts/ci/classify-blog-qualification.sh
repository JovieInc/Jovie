#!/usr/bin/env bash
set -euo pipefail
[[ "$BASE_SHA" =~ ^[0-9a-f]{40}$ && "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]
root="$RUNNER_TEMP/product-lane-classification"
blog_receipt="$root/blog-content-receipt.json"
trusted_blog="$root/blog-content-ci.mjs"
if git cat-file -e "${BASE_SHA}:scripts/lib/blog-content-ci.mjs" 2>/dev/null; then
  git show "${BASE_SHA}:scripts/lib/blog-content-ci.mjs" > "$trusted_blog"
  node "$trusted_blog" \
    --base "$BASE_SHA" --head "$HEAD_SHA" --policy-ref "$BASE_SHA" \
    --json-out "$blog_receipt" --github-output "$GITHUB_OUTPUT"
else
  jq -n --arg base "$BASE_SHA" --arg head "$HEAD_SHA" \
    '{schema:"jovie-blog-content-ci/v1",profile:"full",contentOnly:false,baseSha:$base,headSha:$head,changedPaths:[],changes:[],changedPostSlugs:[],removedPostSlugs:[],changedAssets:[],affectedOutputs:[],selectedChecks:["applicable-broader-qualification"],rejections:[{status:null,path:null,oldPath:null,reason:"trusted-classifier-unavailable"}]}' \
    > "$blog_receipt"
  {
    echo "blog_content_only=false"
    echo "blog_qualification_profile=full"
    echo "blog_changed_posts_json=[]"
    echo 'blog_selected_checks_json=["applicable-broader-qualification"]'
  } >> "$GITHUB_OUTPUT"
fi
profile=$(jq -er '.profile | select(. == "full" or . == "content-only")' "$blog_receipt")
trusted_product="$root/product-lane-classifier.mjs"
git show "${BASE_SHA}:scripts/lib/product-lane-classifier.mjs" > "$trusted_product"
node "$trusted_product" \
  --files-from "$root/changed-paths.txt" \
  --base-ref "$BASE_SHA" --head-ref "$HEAD_SHA" \
  --qualification-profile "$profile" \
  --json-out "$root/receipt.json" --summary-out "$root/summary.md"
for receipt in receipt.json blog-content-receipt.json; do
  jq --arg sha "$GITHUB_SHA" --arg run_id "$GITHUB_RUN_ID" \
    --arg run_attempt "$GITHUB_RUN_ATTEMPT" \
    '. + {provenance: {sha: $sha, runId: $run_id, runAttempt: $run_attempt}}' \
    "$root/$receipt" > "$root/sealed.json"
  mv "$root/sealed.json" "$root/$receipt"
done
cat "$root/summary.md" >> "$GITHUB_STEP_SUMMARY"
printf "\n### Blog content qualification\n\n- Profile: \`%s\`\n- Receipt: \`blog-content-receipt.json\`\n" \
  "$profile" >> "$GITHUB_STEP_SUMMARY"
