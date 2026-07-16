# Ephemeral runner image

This directory is the version-controlled source for the Ubuntu x64 ephemeral
runner image. The live autoscaler on `gem` must build this Dockerfile from a
specific Jovie commit. Do not edit or build the unversioned legacy copy at
`/home/timwhite/ci-runner-autoscaler/Dockerfile`.

## Build

Build from a clean commit so the image, prerequisite marker, and lockfile cannot
disagree:

```bash
git clone --filter=blob:none https://github.com/JovieInc/Jovie.git jovie-runner-build
cd jovie-runner-build
git checkout <commit-sha>
LOCK_SHA=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
TAG="jovie-runner:lock-${LOCK_SHA:0:12}"
./.github/runner-image/build-context.sh HEAD | \
docker buildx build --load --pull --platform linux/amd64 \
  --file .github/runner-image/Dockerfile \
  --tag "$TAG" -
```

The context script is required for streamed or remote builds. BuildKit does not
apply `Dockerfile.dockerignore` to a prebuilt tar stream, so piping a raw
`git archive` would make arbitrary source and test edits invalidate the
dependency/browser layer. The script emits only root/workspace manifests,
lockfile-declared patches, and the runner contract with deterministic metadata.

The Dockerfile installs Node 22.23.1 into the Actions toolcache, activates pnpm
9.15.4, installs the exact lockfile, stores an integrity-checked installed-tree
archive under `/opt/jovie-installed-tree`, and installs Playwright 1.60 Chromium
plus Linux system dependencies. It writes the marker only after validating the
archive and the exact browser executables.

## Verify and roll out

Adding the `runner-image-canary` label automatically runs the hosted exact-head
build, cache proof, and `--network none` installed-tree restore. That hosted
proof is a prerequisite, not a replacement, for the separate ephemeral canary
on Gem's dedicated `jovie-runner-image-canary` label. Do not change the
production `latest` tag, generic runner pool, or autoscaler image until the Gem
canary passes on the same commit.

```bash
docker run --rm --entrypoint bash "$TAG" -lc '
  node --version
  pnpm --version
  test -x /opt/ms-playwright/chromium-1223/chrome-linux64/chrome
  test -x /opt/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
  test -x /opt/ms-playwright/ffmpeg-1011/ffmpeg-linux
  test -r /opt/jovie-runner-prerequisites/manifest.json
'
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$TAG")
```

Pin `AUTOSCALER_RUNNER_IMAGE` to `IMAGE_ID` in
`/etc/systemd/system/ci-runner-autoscaler.service.d/override.conf`, then restart
the service. Keep the previous image ID for rollback. Never point production at
`jovie-runner:latest`: an immutable image ID plus the marker's lockfile SHA is
the drift boundary.

During rollout, images without a marker use the existing cold setup. Once a
marker exists, an unreadable marker or invalid schema fails closed. A valid
marker with Node, pnpm, lockfile, path, browser revision, executable, or
permission drift emits a warning and uses the existing cold setup. Rebuild and
promote the image after every lockfile change before expecting either composite
action to take its warm path.
