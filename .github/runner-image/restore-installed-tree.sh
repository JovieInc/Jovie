#!/usr/bin/env bash
set -euo pipefail

archive_path=${1:?installed-tree archive path is required}
expected_sha=${2:?installed-tree archive SHA-256 is required}
workspace=${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}

[[ "${expected_sha}" =~ ^[0-9a-f]{64}$ ]]
test -f "${archive_path}"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Neither sha256sum nor shasum is available." >&2
    return 127
  fi
}

if find "${workspace}" -type d -name node_modules -print -quit | grep -q .; then
  echo "Refusing to restore installed tree over an existing node_modules directory." >&2
  exit 1
fi

actual_sha=$(sha256_file "${archive_path}")
if [[ "${actual_sha}" != "${expected_sha}" ]]; then
  printf '%s: FAILED\n' "${archive_path}"
  exit 1
fi
printf '%s: OK\n' "${archive_path}"
tar \
  --extract \
  --file "${archive_path}" \
  --directory "${workspace}" \
  --no-same-owner \
  --keep-old-files

test -f "${workspace}/node_modules/.modules.yaml"
test -x "${workspace}/node_modules/.bin/tsx"
test -e "${workspace}/apps/web/node_modules/next"
