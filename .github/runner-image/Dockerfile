# syntax=docker/dockerfile:1.7

ARG RUNNER_VERSION=2.335.1
ARG RUNNER_AMD64_DIGEST=sha256:f546db5932b903c81cf269a712dad679fdf139dc08b7676c08f391a11258de5e
ARG RUNNER_PLATFORM=linux/amd64
FROM --platform=${RUNNER_PLATFORM} myoung34/github-runner:${RUNNER_VERSION}@${RUNNER_AMD64_DIGEST} AS runner-base

ARG NODE_VERSION=22.23.1
ARG NODE_LINUX_X64_SHA256=9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578
ARG PNPM_VERSION=9.15.4

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    jq \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# actions/setup-node recognizes this layout and completion marker. The PATH and
# symlink also make the baked runtime available before setup actions execute.
RUN mkdir -p "/opt/hostedtoolcache/node/${NODE_VERSION}/x64" \
    && curl --fail --location --retry 3 \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      --output /tmp/node-linux-x64.tar.xz \
    && echo "${NODE_LINUX_X64_SHA256}  /tmp/node-linux-x64.tar.xz" \
      | sha256sum --check --strict \
    && tar -xJ --strip-components=1 \
        -C "/opt/hostedtoolcache/node/${NODE_VERSION}/x64" \
        -f /tmp/node-linux-x64.tar.xz \
    && rm /tmp/node-linux-x64.tar.xz \
    && touch "/opt/hostedtoolcache/node/${NODE_VERSION}/x64.complete" \
    && ln -sf "/opt/hostedtoolcache/node/${NODE_VERSION}/x64/bin/node" /usr/local/bin/node

ENV PATH="/opt/hostedtoolcache/node/${NODE_VERSION}/x64/bin:${PATH}"

RUN corepack enable \
    && corepack install --global "pnpm@${PNPM_VERSION}" \
    && test "$(cd / && COREPACK_ENABLE_NETWORK=0 pnpm --version)" = "${PNPM_VERSION}" \
    && pnpm dlx "playwright@1.60.0" install-deps chromium

FROM runner-base AS prerequisites

ENV HUSKY=0 \
    ONNXRUNTIME_NODE_INSTALL=skip \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

WORKDIR /tmp/jovie
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches patches
COPY apps apps
COPY packages packages
COPY workers workers

# The git-archive build context makes pnpm-lock.yaml part of the image digest.
# Keep the expensive dependency and browser layer addressed only by workspace
# manifests. Runner contract/docs edits must not invalidate this layer.
RUN pnpm config set store-dir /opt/jovie-pnpm-store \
    && pnpm fetch --frozen-lockfile \
    && pnpm install --offline --frozen-lockfile \
    && pnpm --filter=@jovie/web exec playwright install chromium

COPY .github/runner-image/create-installed-tree.mjs \
  .github/runner-image/create-installed-tree.mjs
COPY .github/runner-image/prerequisites.json \
  .github/runner-image/prerequisites.json
COPY .github/runner-image/verify-prerequisites.mjs \
  .github/runner-image/verify-prerequisites.mjs

RUN node .github/runner-image/create-installed-tree.mjs \
      /tmp/jovie /opt/jovie-installed-tree \
    && mkdir -p /opt/jovie-runner-prerequisites \
    && node .github/runner-image/verify-prerequisites.mjs \
      --write-marker /opt/jovie-runner-prerequisites/manifest.json

FROM runner-base

# Corepack's default home is user-specific. Keep the final runner's pinned pnpm
# state system-wide so the non-root job user never needs registry discovery.
ENV COREPACK_HOME=/opt/corepack

RUN mkdir -p "${COREPACK_HOME}" \
    && chmod 0755 "${COREPACK_HOME}" \
    && corepack install --global "pnpm@${PNPM_VERSION}" \
    && test "$(su -s /bin/bash runner -c \
      'cd / && COREPACK_ENABLE_NETWORK=0 \
      /opt/hostedtoolcache/node/22.23.1/x64/bin/pnpm --version')" = "${PNPM_VERSION}"

COPY --from=prerequisites --chown=runner:runner \
  /opt/jovie-installed-tree /opt/jovie-installed-tree
COPY --from=prerequisites --chown=runner:runner \
  /opt/ms-playwright /opt/ms-playwright
COPY --from=prerequisites --chown=runner:runner \
  /opt/jovie-runner-prerequisites /opt/jovie-runner-prerequisites

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

USER runner

RUN test "$(cd / && COREPACK_ENABLE_NETWORK=0 pnpm --version)" = "${PNPM_VERSION}"

LABEL ci.jovie.base="myoung34/github-runner@sha256:f546db5932b903c81cf269a712dad679fdf139dc08b7676c08f391a11258de5e" \
      ci.jovie.version="2.335.1" \
      ci.jovie.prerequisites="lockfile-addressed" \
      ci.jovie.description="Jovie ephemeral self-hosted runner"
