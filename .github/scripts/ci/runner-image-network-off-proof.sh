#!/usr/bin/env bash
set -euo pipefail
docker run --rm --network none \
  --entrypoint bash \
  --volume "$PWD:/repo:ro" \
  "$IMAGE_TAG" -lc '
    set -euo pipefail
    test "$(node --version)" = v24.22.3
    test "$(cd / && COREPACK_ENABLE_NETWORK=0 pnpm --version)" = 9.15.9

    dependency_status=$(JOVIE_RUNNER_REPO_ROOT=/repo \
      node /repo/.github/runner-image/verify-prerequisites.mjs \
      --component dependencies)
    playwright_status=$(JOVIE_RUNNER_REPO_ROOT=/repo \
      node /repo/.github/runner-image/verify-prerequisites.mjs \
      --component playwright)
    grep -qx "dependencies_warm=true" <<< "$dependency_status"
    grep -qx "playwright_warm=true" <<< "$playwright_status"

    archive_path=$(sed -n \
      "s/^installed_tree_archive_path=//p" <<< "$dependency_status")
    archive_sha=$(sed -n \
      "s/^installed_tree_archive_sha256=//p" <<< "$dependency_status")
    test -n "$archive_path"
    [[ "$archive_sha" =~ ^[0-9a-f]{64}$ ]]
    mkdir -p /tmp/offline-workspace
    GITHUB_WORKSPACE=/tmp/offline-workspace \
      /repo/.github/runner-image/restore-installed-tree.sh \
      "$archive_path" "$archive_sha"
    test -f /tmp/offline-workspace/node_modules/.modules.yaml
    test -x /tmp/offline-workspace/node_modules/.bin/tsx
    test -e /tmp/offline-workspace/apps/web/node_modules/next
    printf "offline_image_proof=true\n"
  ' 2>&1 | tee runner-image-evidence/offline-proof.log
test "${PIPESTATUS[0]}" -eq 0
grep -qx 'offline_image_proof=true' \
  runner-image-evidence/offline-proof.log
