#!/usr/bin/env bash
set -euo pipefail
cleanup() {
  docker buildx rm runner-image-first runner-image-second \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker buildx create --name runner-image-first \
  --driver docker-container --use
docker buildx inspect --bootstrap
docker buildx build \
  --progress=plain \
  --platform linux/amd64 \
  --file .github/runner-image/Dockerfile \
  --cache-from "type=gha,scope=$CACHE_SCOPE,version=2" \
  --cache-to "type=gha,scope=$CACHE_SCOPE,mode=max,version=2" \
  --metadata-file runner-image-evidence/first-build-metadata.json \
  - < runner-image-evidence/context.tar \
  2>&1 | tee runner-image-evidence/first-build.log
test "${PIPESTATUS[0]}" -eq 0

docker buildx rm runner-image-first
docker buildx create --name runner-image-second \
  --driver docker-container --use
docker buildx inspect --bootstrap
docker buildx build \
  --progress=plain \
  --platform linux/amd64 \
  --file .github/runner-image/Dockerfile \
  --cache-from "type=gha,scope=$CACHE_SCOPE,version=2" \
  --load \
  --tag "$IMAGE_TAG" \
  --metadata-file runner-image-evidence/second-build-metadata.json \
  - < runner-image-evidence/context.tar \
  2>&1 | tee runner-image-evidence/second-build.log
test "${PIPESTATUS[0]}" -eq 0

node .github/runner-image/verify-build-cache.mjs \
  runner-image-evidence/second-build.log \
  runner-image-evidence/cache-proof.json
docker image inspect "$IMAGE_TAG" \
  > runner-image-evidence/image-inspect.json
