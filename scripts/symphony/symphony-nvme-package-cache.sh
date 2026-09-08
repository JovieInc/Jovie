#!/usr/bin/env bash
# Trusted Symphony workspace package-cache restore.
#
# This script is called by the official Symphony workspace hooks only. It
# restores a hash-bound immutable pnpm store archive from Gem NVMe into private
# mutable workspace state, then runs one offline, frozen, scripts-disabled
# install before the coding agent starts.
set -euo pipefail

readonly SCHEMA="symphony-nvme-package-cache/v2"
readonly RESTORE_RECEIPT_SCHEMA="symphony-nvme-package-cache-restore/v1"
readonly TEARDOWN_RECEIPT_SCHEMA="symphony-nvme-package-cache-teardown/v1"
readonly WARM_RECEIPT_SCHEMA="symphony-nvme-package-cache-warm/v1"
readonly REQUIRED_NODE_VERSION="22.23.2"
readonly REQUIRED_PNPM_VERSION="9.15.4"
readonly DEFAULT_CACHE_ROOT="/srv/git/symphony-package-cache/jovie"
readonly REPO="JovieInc/Jovie"

mode="${1:-after-create}"
workspace="$(pwd -P)"
issue="${SYMPHONY_ISSUE_IDENTIFIER:-$(basename "$workspace")}"
cache_root="${SYMPHONY_NVME_CACHE_ROOT:-$DEFAULT_CACHE_ROOT}"
allow_test_root="${SYMPHONY_NVME_ALLOW_TEST_ROOT:-0}"
mutable_root="${SYMPHONY_NVME_MUTABLE_ROOT:-$workspace/.symphony/package-cache}"
private_store="${SYMPHONY_NVME_PRIVATE_STORE:-$mutable_root/pnpm-store}"
receipt_dir="${SYMPHONY_NVME_RECEIPT_DIR:-$HOME/.local/state/symphony-nvme-package-cache}"
restore_receipt="$mutable_root/restore-receipt.json"
trusted_hook_phase="${SYMPHONY_TRUSTED_HOOK_PHASE:-}"
warm_tmp_dir=""

cleanup_warm_tmp() {
  [ -n "${warm_tmp_dir:-}" ] || return 0
  case "$warm_tmp_dir" in
    "$cache_root"/.warm-*) rm -rf -- "$warm_tmp_dir" ;;
    *) fail "unsafe-warm-temp-path" "$warm_tmp_dir" ;;
  esac
  warm_tmp_dir=""
}

fail() {
  local reason="$1"
  shift || true
  printf 'SYMPHONY_NVME_PACKAGE_CACHE_FAILURE schema=%s reason=%s' "$SCHEMA" "$reason" >&2
  if [ "$#" -gt 0 ]; then
    printf ' detail=%q' "$*" >&2
  fi
  printf '\n' >&2
  exit 78
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    fail "sha256-tool-missing"
  fi
}

read_json_field() {
  local json_path="$1"
  local field="$2"
  python3 - "$json_path" "$field" <<'PY'
import json
import sys
payload = json.loads(open(sys.argv[1], encoding="utf-8").read())
value = payload
for part in sys.argv[2].split("."):
    if not isinstance(value, dict) or part not in value:
        raise SystemExit(1)
    value = value[part]
if isinstance(value, str):
    print(value)
else:
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
PY
}

assert_file_value() {
  local path="$1"
  local expected="$2"
  [ -f "$path" ] || fail "required-file-missing" "$path"
  local actual
  actual="$(tr -d '[:space:]' < "$path")"
  [ "$actual" = "$expected" ] || fail "toolchain-file-mismatch" "$path expected $expected got $actual"
}

assert_package_contract() {
  python3 - "$REQUIRED_NODE_VERSION" "$REQUIRED_PNPM_VERSION" <<'PY'
import json
import pathlib
import sys

node = sys.argv[1]
pnpm = sys.argv[2]
package = json.loads(pathlib.Path("package.json").read_text(encoding="utf-8"))
expected_engine = f">={node} <23"
errors = []
if package.get("engines", {}).get("node") != expected_engine:
    errors.append(f"engines.node expected {expected_engine!r}")
if package.get("engines", {}).get("pnpm") != pnpm:
    errors.append(f"engines.pnpm expected {pnpm!r}")
if package.get("packageManager") != f"pnpm@{pnpm}":
    errors.append(f"packageManager expected pnpm@{pnpm}")
if errors:
    raise SystemExit("\n".join(errors))
PY
}

actual_node_version() {
  command -v node >/dev/null 2>&1 || fail "node-missing"
  node --version | tr -d 'v[:space:]'
}

actual_pnpm_version() {
  command -v pnpm >/dev/null 2>&1 || fail "pnpm-missing"
  pnpm --version | tr -d '[:space:]'
}

source_sha() {
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git rev-parse --verify HEAD
    return
  fi
  fail "source-sha-unavailable"
}

cache_key_for() {
  local lock_sha="$1"
  local workspace_sha="$2"
  local platform="$3"
  local arch="$4"
  python3 - "$SCHEMA" "$REPO" "$REQUIRED_NODE_VERSION" "$REQUIRED_PNPM_VERSION" "$lock_sha" "$workspace_sha" "$platform" "$arch" <<'PY'
import hashlib
import json
import sys

schema, repo, node, pnpm, lock, workspace, platform, arch = sys.argv[1:]
payload = {
    "schema": schema,
    "repo": repo,
    "nodeVersion": node,
    "pnpmVersion": pnpm,
    "lockfileSha256": lock,
    "workspaceFileSha256": workspace,
    "platform": platform,
    "arch": arch,
}
raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
print(hashlib.sha256(raw).hexdigest())
PY
}

workspace_file_sha() {
  if [ -f pnpm-workspace.yaml ]; then
    sha256_file pnpm-workspace.yaml
  else
    printf 'none\n'
  fi
}

platform_name() {
  uname -s | tr '[:upper:]' '[:lower:]'
}

archive_path_for() {
  local cache_key="$1"
  local lock_sha="$2"
  printf '%s/node-%s-pnpm-%s-lock-%s-cache-%s.tar\n' \
    "$cache_root" \
    "$REQUIRED_NODE_VERSION" \
    "$REQUIRED_PNPM_VERSION" \
    "${lock_sha:0:16}" \
    "${cache_key:0:16}"
}

mount_source_for() {
  local path="$1"
  if command -v findmnt >/dev/null 2>&1; then
    local source
    source="$(findmnt --target "$path" --output SOURCE --noheadings 2>/dev/null | head -n 1 | awk '{$1=$1; print}' || true)"
    printf '%s\n' "$source"
  fi
}

assert_nvme_archive_path() {
  local archive_path="$1"
  if [ "$allow_test_root" = "1" ]; then
    case "$workspace" in
      /tmp/*|/private/tmp/*|/private/var/folders/*/*/T/*) ;;
      *) fail "test-root-override-outside-tmp" "$workspace" ;;
    esac
    return
  fi
  case "$archive_path" in
    /srv/git/*) ;;
    *) fail "archive-not-under-nvme-root" "$archive_path" ;;
  esac
  local source
  source="$(mount_source_for "$archive_path")"
  [ -n "$source" ] || fail "archive-device-unavailable" "$archive_path"
  case "$source" in
    /dev/nvme*|/dev/disk/by-id/*nvme*) ;;
    *) fail "archive-not-on-nvme" "$archive_path source $source" ;;
  esac
}

assert_trusted_hook_phase() {
  local expected="$1"
  [ "$trusted_hook_phase" = "$expected" ] || fail "trusted-hook-phase-mismatch" "expected $expected got ${trusted_hook_phase:-missing}"
}

assert_private_state_inside_workspace() {
  python3 - "$workspace" "$mutable_root" "$private_store" <<'PY'
import pathlib
import sys

workspace = pathlib.Path(sys.argv[1]).resolve()
for raw in sys.argv[2:]:
    path = pathlib.Path(raw).resolve()
    try:
        path.relative_to(workspace)
    except ValueError:
        raise SystemExit(f"private package state escapes workspace: {path}")
PY
}

assert_immutable_file() {
  local path="$1"
  [ -f "$path" ] || fail "archive-file-missing" "$path"
  if [ "$allow_test_root" = "1" ]; then
    return
  fi
  if ! command -v lsattr >/dev/null 2>&1; then
    fail "immutability-tool-missing" "$path"
  fi
  local attrs
  attrs="$(lsattr -d "$path" 2>/dev/null | awk '{print $1}')"
  case "$attrs" in
    *i*) ;;
    *) fail "archive-not-immutable" "$path attrs $attrs" ;;
  esac
}

assert_archive_entries_safe() {
  local archive_path="$1"
  local listing
  listing="$(tar -tf "$archive_path")" || fail "archive-list-failed" "$archive_path"
  python3 -c '
import sys
bad = []
for raw in sys.stdin:
    path = raw.rstrip("\n")
    parts = [part for part in path.split("/") if part not in ("", ".")]
    if path.startswith("/") or ".." in parts:
        bad.append(path)
    if parts and parts[0] == "node_modules":
        bad.append(path)
if bad:
    raise SystemExit("unsafe archive entries: " + ", ".join(bad[:5]))
' <<<"$listing"
}

assert_manifest() {
  local manifest_path="$1"
  local archive_path="$2"
  local archive_sha="$3"
  local lock_sha="$4"
  local workspace_sha="$5"
  local platform="$6"
  local arch="$7"
  local cache_key="$8"

  [ -f "$manifest_path" ] || fail "cache-manifest-missing" "$manifest_path"
  local schema repo manifest_node manifest_pnpm manifest_lock manifest_workspace manifest_platform manifest_arch manifest_key manifest_archive manifest_hash
  schema="$(read_json_field "$manifest_path" schema)" || fail "cache-manifest-malformed" "$manifest_path"
  repo="$(read_json_field "$manifest_path" repo)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_node="$(read_json_field "$manifest_path" nodeVersion)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_pnpm="$(read_json_field "$manifest_path" pnpmVersion)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_lock="$(read_json_field "$manifest_path" lockfileSha256)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_workspace="$(read_json_field "$manifest_path" workspaceFileSha256)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_platform="$(read_json_field "$manifest_path" platform)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_arch="$(read_json_field "$manifest_path" arch)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_key="$(read_json_field "$manifest_path" cacheKey)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_archive="$(read_json_field "$manifest_path" archivePath)" || fail "cache-manifest-malformed" "$manifest_path"
  manifest_hash="$(read_json_field "$manifest_path" archiveSha256)" || fail "cache-manifest-malformed" "$manifest_path"

  [ "$schema" = "$SCHEMA" ] || fail "cache-schema-mismatch" "$schema"
  [ "$repo" = "$REPO" ] || fail "cache-repo-mismatch" "$repo"
  [ "$manifest_node" = "$REQUIRED_NODE_VERSION" ] || fail "node-version-mismatch" "$manifest_node"
  [ "$manifest_pnpm" = "$REQUIRED_PNPM_VERSION" ] || fail "pnpm-version-mismatch" "$manifest_pnpm"
  [ "$manifest_lock" = "$lock_sha" ] || fail "lockfile-hash-mismatch" "$manifest_lock expected $lock_sha"
  [ "$manifest_workspace" = "$workspace_sha" ] || fail "workspace-file-hash-mismatch" "$manifest_workspace expected $workspace_sha"
  [ "$manifest_platform" = "$platform" ] || fail "platform-mismatch" "$manifest_platform expected $platform"
  [ "$manifest_arch" = "$arch" ] || fail "arch-mismatch" "$manifest_arch expected $arch"
  [ "$manifest_key" = "$cache_key" ] || fail "cache-key-mismatch" "$manifest_key expected $cache_key"
  [ "$manifest_archive" = "$archive_path" ] || fail "archive-path-mismatch" "$manifest_archive expected $archive_path"
  [ "$manifest_hash" = "$archive_sha" ] || fail "archive-hash-mismatch" "$manifest_hash expected $archive_sha"
}

assert_checksum_sidecar() {
  local sidecar="$1"
  local archive_path="$2"
  local archive_sha="$3"
  [ -f "$sidecar" ] || fail "archive-checksum-missing" "$sidecar"
  python3 - "$sidecar" "$archive_path" "$archive_sha" <<'PY'
import pathlib
import sys

sidecar = pathlib.Path(sys.argv[1])
archive_path = pathlib.Path(sys.argv[2])
expected = sys.argv[3]
parts = sidecar.read_text(encoding="utf-8").strip().split()
if len(parts) < 2 or parts[0] != expected or pathlib.Path(parts[1]).name != archive_path.name:
    raise SystemExit(1)
PY
}

assert_no_existing_mutable_package_state() {
  [ ! -e "$private_store" ] || fail "private-store-already-exists" "$private_store"
  if find "$workspace" \
    -path "$workspace/.git" -prune -o \
    -type d -name node_modules -print -quit | grep -q .; then
    fail "node-modules-already-exists" "$workspace"
  fi
}

parse_network_trace() {
  local trace_dir="$1"
  python3 - "$trace_dir" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
offenders = []
for path in root.glob("pnpm*"):
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        if re.search(r"\bAF_INET6?\b", line):
            offenders.append(f"{path.name}:{line.strip()}")
if offenders:
    print("\n".join(offenders[:10]))
    raise SystemExit(1)
PY
}

run_install_with_network_proof() {
  local trace_dir="$1"
  mkdir -p "$trace_dir"
  local command=(
    pnpm install
    --offline
    --frozen-lockfile
    --ignore-scripts
    --store-dir "$private_store"
  )
  export COREPACK_ENABLE_NETWORK=0
  export npm_config_audit=false
  export npm_config_fund=false
  export npm_config_frozen_lockfile=true
  export npm_config_ignore_scripts=true
  export npm_config_offline=true
  export npm_config_registry="${SYMPHONY_NVME_PACKAGE_REGISTRY:-http://127.0.0.1:9}"
  export npm_config_store_dir="$private_store"
  export npm_config_update_notifier=false
  export ONNXRUNTIME_NODE_INSTALL=skip

  command -v strace >/dev/null 2>&1 || fail "network-proof-tool-missing" "strace"
  strace -ff -e trace=network -o "$trace_dir/pnpm" "${command[@]}" \
    || fail "offline-install-failed" "pnpm install --offline --frozen-lockfile --ignore-scripts"
  if ! parse_network_trace "$trace_dir"; then
    fail "network-access-detected" "$trace_dir"
  fi
}

ownership_json() {
  local path="$1"
  if [ -e "$path" ]; then
    python3 - "$path" <<'PY'
import json
import os
import pathlib
import pwd
import grp
import sys

path = pathlib.Path(sys.argv[1])
stat = path.stat()
try:
    owner = pwd.getpwuid(stat.st_uid).pw_name
except KeyError:
    owner = str(stat.st_uid)
try:
    group = grp.getgrgid(stat.st_gid).gr_name
except KeyError:
    group = str(stat.st_gid)
print(json.dumps({
    "path": str(path),
    "uid": stat.st_uid,
    "gid": stat.st_gid,
    "owner": owner,
    "group": group,
    "mode": oct(stat.st_mode & 0o777),
    "device": stat.st_dev,
    "inode": stat.st_ino,
}, sort_keys=True))
PY
  else
    # Interpolated into a Python object literal before json.dumps serializes it.
    printf 'None\n'
  fi
}

write_restore_receipt() {
  local receipt="$1"
  local archive_path="$2"
  local archive_sha="$3"
  local source="$4"
  local lock_sha="$5"
  local workspace_sha="$6"
  local platform="$7"
  local arch="$8"
  local cache_key="$9"
  local elapsed_ms="${10}"
  local trace_dir="${11}"
  local workspace_mount archive_mount
  workspace_mount="$(mount_source_for "$workspace")"
  archive_mount="$(mount_source_for "$archive_path")"
  python3 - "$receipt" <<PY
import json
import pathlib
from datetime import datetime, timezone

payload = {
    "schema": "$RESTORE_RECEIPT_SCHEMA",
    "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "repo": "$REPO",
    "issue": "$issue",
    "sourceSha": "$source",
    "workspace": {
        "path": "$workspace",
        "mountSource": "$workspace_mount",
        "ownership": $(ownership_json "$workspace"),
    },
    "archive": {
        "path": "$archive_path",
        "mountSource": "$archive_mount",
        "sha256": "$archive_sha",
        "ownership": $(ownership_json "$archive_path"),
    },
    "toolchain": {
        "nodeVersion": "$REQUIRED_NODE_VERSION",
        "pnpmVersion": "$REQUIRED_PNPM_VERSION",
        "lockfileSha256": "$lock_sha",
        "workspaceFileSha256": "$workspace_sha",
        "platform": "$platform",
        "arch": "$arch",
        "cacheKey": "$cache_key",
    },
    "restore": {
        "elapsedMs": int("$elapsed_ms"),
        "privateStorePath": "$private_store",
        "nodeModulesPath": "$workspace/node_modules",
        "command": "pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir <private-store>",
        "serialized": True,
        "networkProof": {
            "tool": "strace",
            "traceDirectory": "$trace_dir",
            "afInetEvents": 0,
        },
        "lifecycleScripts": "disabled",
    },
    "commandPolicy": {
        "trustedHookOnly": True,
        "agentInstallOrFetchAllowed": False,
        "agentWorkspaceStoreCreationAllowed": False,
    },
}
path = pathlib.Path("$receipt")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
PY
}

write_teardown_receipt() {
  local receipt="$1"
  local archive_path="$2"
  local archive_sha="$3"
  local removed_json="$4"
  local preserved_json="$5"
  local workspace_mount archive_mount
  workspace_mount="$(mount_source_for "$workspace")"
  archive_mount="$(mount_source_for "$archive_path")"
  python3 - "$receipt" "$removed_json" "$preserved_json" "$archive_sha" <<PY
import json
import pathlib
import sys
from datetime import datetime, timezone

removed = json.loads(sys.argv[2])
preserved = json.loads(sys.argv[3])
archive_sha = sys.argv[4] or None
payload = {
    "schema": "$TEARDOWN_RECEIPT_SCHEMA",
    "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "repo": "$REPO",
    "issue": "$issue",
    "workspace": {
        "path": "$workspace",
        "mountSource": "$workspace_mount",
        "ownership": $(ownership_json "$workspace"),
    },
    "archive": {
        "path": "$archive_path",
        "mountSource": "$archive_mount",
        "sha256": archive_sha,
        "ownership": $(ownership_json "$archive_path"),
    },
    "removed": removed,
    "preserved": preserved,
}
path = pathlib.Path("$receipt")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
PY
}

copy_receipt() {
  local receipt="$1"
  local name="$2"
  mkdir -p "$receipt_dir"
  install -m 0644 "$receipt" "$receipt_dir/$name"
}

write_cache_manifest() {
  local path="$1" source="$2" lock_sha="$3" workspace_sha="$4" platform="$5" arch="$6" cache_key="$7" archive_path="$8" archive_sha="$9"
  python3 - "$path" "$source" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key" "$archive_path" "$archive_sha" <<PY
import json
import pathlib
import sys
from datetime import datetime, timezone

path, source, lock_sha, workspace_sha, platform, arch, cache_key, archive_path, archive_sha = sys.argv[1:]
payload = {
    "schema": "$SCHEMA",
    "repo": "$REPO",
    "warmedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "warmedFromSourceSha": source,
    "nodeVersion": "$REQUIRED_NODE_VERSION",
    "pnpmVersion": "$REQUIRED_PNPM_VERSION",
    "lockfileSha256": lock_sha,
    "workspaceFileSha256": workspace_sha,
    "platform": platform,
    "arch": arch,
    "cacheKey": cache_key,
    "archivePath": archive_path,
    "archiveSha256": archive_sha,
}
pathlib.Path(path).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

write_warm_receipt() {
  local path="$1" source="$2" lock_sha="$3" workspace_sha="$4" platform="$5" arch="$6" cache_key="$7" archive_path="$8" archive_sha="$9" cache_hit="${10}"
  python3 - "$path" "$source" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key" "$archive_path" "$archive_sha" "$cache_hit" <<PY
import json
import pathlib
import sys
from datetime import datetime, timezone

path, source, lock_sha, workspace_sha, platform, arch, cache_key, archive_path, archive_sha, cache_hit = sys.argv[1:]
payload = {
    "schema": "$WARM_RECEIPT_SCHEMA",
    "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "repo": "$REPO",
    "sourceSha": source,
    "toolchain": {
        "nodeVersion": "$REQUIRED_NODE_VERSION",
        "pnpmVersion": "$REQUIRED_PNPM_VERSION",
        "lockfileSha256": lock_sha,
        "workspaceFileSha256": workspace_sha,
        "platform": platform,
        "arch": arch,
        "cacheKey": cache_key,
    },
    "archive": {
        "path": archive_path,
        "sha256": archive_sha,
        "immutable": True,
        "cacheHit": cache_hit == "true",
    },
}
pathlib.Path(path).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
}

warm_cache() {
  assert_trusted_hook_phase "cache_warm"
  if [ "$allow_test_root" != "1" ] && [ "$(id -u)" -ne 0 ]; then
    fail "cache-warm-requires-root"
  fi
  [ -f package.json ] || fail "package-json-missing" "$workspace"
  [ -f pnpm-lock.yaml ] || fail "lockfile-missing" "$workspace"
  assert_file_value .nvmrc "$REQUIRED_NODE_VERSION"
  assert_file_value .node-version "$REQUIRED_NODE_VERSION"
  if ! assert_package_contract; then
    fail "package-contract-mismatch"
  fi
  [ "$(actual_node_version)" = "$REQUIRED_NODE_VERSION" ] || fail "node-version-mismatch" "$(actual_node_version) expected $REQUIRED_NODE_VERSION"
  [ "$(actual_pnpm_version)" = "$REQUIRED_PNPM_VERSION" ] || fail "pnpm-version-mismatch" "$(actual_pnpm_version) expected $REQUIRED_PNPM_VERSION"

  local source lock_sha workspace_sha platform arch cache_key archive_path manifest_path checksum_path
  local archive_sha lock_path tmp_dir store_dir tmp_archive tmp_manifest tmp_checksum receipt cache_hit=false
  source="$(source_sha)"
  lock_sha="$(sha256_file pnpm-lock.yaml)"
  workspace_sha="$(workspace_file_sha)"
  platform="$(platform_name)"
  arch="$(uname -m)"
  cache_key="$(cache_key_for "$lock_sha" "$workspace_sha" "$platform" "$arch")"
  archive_path="$(archive_path_for "$cache_key" "$lock_sha")"
  manifest_path="${archive_path}.json"
  checksum_path="${archive_path}.sha256"
  install -d -m 0755 "$cache_root" "$receipt_dir"
  assert_nvme_archive_path "$cache_root"
  command -v flock >/dev/null 2>&1 || fail "flock-missing"
  lock_path="$cache_root/.warm.lock"
  exec 8>"$lock_path"
  flock -x 8

  if [ -f "$archive_path" ] && [ -f "$manifest_path" ] && [ -f "$checksum_path" ]; then
    archive_sha="$(sha256_file "$archive_path")"
    assert_checksum_sidecar "$checksum_path" "$archive_path" "$archive_sha" || fail "archive-checksum-mismatch" "$checksum_path"
    assert_manifest "$manifest_path" "$archive_path" "$archive_sha" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key"
    assert_immutable_file "$archive_path"
    assert_immutable_file "$manifest_path"
    assert_immutable_file "$checksum_path"
    cache_hit=true
  elif [ -e "$archive_path" ] || [ -e "$manifest_path" ] || [ -e "$checksum_path" ]; then
    fail "partial-cache-entry" "$archive_path"
  else
    tmp_dir="$(mktemp -d "$cache_root/.warm-${cache_key}.XXXXXX")"
    warm_tmp_dir="$tmp_dir"
    store_dir="$tmp_dir/store"
    tmp_archive="$tmp_dir/$(basename "$archive_path")"
    tmp_manifest="$tmp_dir/$(basename "$manifest_path")"
    tmp_checksum="$tmp_dir/$(basename "$checksum_path")"
    trap cleanup_warm_tmp EXIT
    install -d -m 0755 "$store_dir"
    install -m 0644 "$workspace/package.json" "$tmp_dir/package.json"
    install -m 0644 "$workspace/pnpm-lock.yaml" "$tmp_dir/pnpm-lock.yaml"
    if [ -f "$workspace/pnpm-workspace.yaml" ]; then
      install -m 0644 "$workspace/pnpm-workspace.yaml" "$tmp_dir/pnpm-workspace.yaml"
    fi
    if [ -d "$workspace/patches" ]; then
      cp -a -- "$workspace/patches" "$tmp_dir/patches"
    fi
    (
      cd "$tmp_dir"
      COREPACK_ENABLE_NETWORK=0 pnpm fetch --frozen-lockfile --ignore-scripts --store-dir "$store_dir"
    )
    [ ! -e "$workspace/node_modules" ] || fail "cache-warm-mutated-source-workspace" "$workspace/node_modules"
    tar -cf "$tmp_archive" -C "$store_dir" .
    archive_sha="$(sha256_file "$tmp_archive")"
    printf '%s  %s\n' "$archive_sha" "$(basename "$archive_path")" >"$tmp_checksum"
    write_cache_manifest "$tmp_manifest" "$source" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key" "$archive_path" "$archive_sha"
    chmod 0444 "$tmp_archive" "$tmp_manifest" "$tmp_checksum"
    mv "$tmp_archive" "$archive_path"
    mv "$tmp_manifest" "$manifest_path"
    mv "$tmp_checksum" "$checksum_path"
    trap - EXIT
    cleanup_warm_tmp
    assert_archive_entries_safe "$archive_path" || fail "archive-entry-unsafe" "$archive_path"
    assert_checksum_sidecar "$checksum_path" "$archive_path" "$archive_sha" || fail "archive-checksum-mismatch" "$checksum_path"
    assert_manifest "$manifest_path" "$archive_path" "$archive_sha" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key"
    if [ "$allow_test_root" != "1" ]; then
      chattr +i "$archive_path" "$manifest_path" "$checksum_path" || fail "cache-immutability-seal-failed" "$archive_path"
    fi
    assert_immutable_file "$archive_path"
    assert_immutable_file "$manifest_path"
    assert_immutable_file "$checksum_path"
  fi

  receipt="$receipt_dir/cache-warm-${source}-${cache_key:0:16}-$(date -u +%Y%m%dT%H%M%SZ).json"
  write_warm_receipt "$receipt" "$source" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key" "$archive_path" "$archive_sha" "$cache_hit"
  printf 'SYMPHONY_NVME_PACKAGE_CACHE_WARM schema=%s source=%s cache_key=%s cache_hit=%s archive=%s receipt=%s\n' \
    "$WARM_RECEIPT_SCHEMA" "$source" "$cache_key" "$cache_hit" "$archive_path" "$receipt"
}

after_create() {
  assert_trusted_hook_phase "after_create"
  assert_private_state_inside_workspace || fail "private-state-escapes-workspace"
  [ -f package.json ] || fail "package-json-missing" "$workspace"
  [ -f pnpm-lock.yaml ] || fail "lockfile-missing" "$workspace"
  assert_file_value .nvmrc "$REQUIRED_NODE_VERSION"
  assert_file_value .node-version "$REQUIRED_NODE_VERSION"
  if ! assert_package_contract; then
    fail "package-contract-mismatch"
  fi

  local node_version pnpm_version source lock_sha workspace_sha platform arch cache_key archive_path manifest_path checksum_path archive_sha
  node_version="$(actual_node_version)"
  [ "$node_version" = "$REQUIRED_NODE_VERSION" ] || fail "node-version-mismatch" "$node_version expected $REQUIRED_NODE_VERSION"
  pnpm_version="$(actual_pnpm_version)"
  [ "$pnpm_version" = "$REQUIRED_PNPM_VERSION" ] || fail "pnpm-version-mismatch" "$pnpm_version expected $REQUIRED_PNPM_VERSION"
  source="$(source_sha)"
  lock_sha="$(sha256_file pnpm-lock.yaml)"
  workspace_sha="$(workspace_file_sha)"
  platform="$(platform_name)"
  arch="$(uname -m)"
  cache_key="$(cache_key_for "$lock_sha" "$workspace_sha" "$platform" "$arch")"
  archive_path="$(archive_path_for "$cache_key" "$lock_sha")"
  manifest_path="${archive_path}.json"
  checksum_path="${archive_path}.sha256"

  assert_nvme_archive_path "$archive_path"
  assert_immutable_file "$archive_path"
  assert_immutable_file "$manifest_path"
  assert_immutable_file "$checksum_path"
  assert_archive_entries_safe "$archive_path" || fail "archive-entry-unsafe" "$archive_path"
  archive_sha="$(sha256_file "$archive_path")"
  assert_checksum_sidecar "$checksum_path" "$archive_path" "$archive_sha" || fail "archive-checksum-mismatch" "$checksum_path"
  assert_manifest "$manifest_path" "$archive_path" "$archive_sha" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key"
  assert_no_existing_mutable_package_state

  local lock_path start end elapsed trace_dir
  lock_path="${SYMPHONY_NVME_RESTORE_LOCK:-/tmp/symphony-nvme-package-cache-restore.lock}"
  trace_dir="$mutable_root/network-trace"
  command -v flock >/dev/null 2>&1 || fail "flock-missing"
  start="$(date +%s%3N)"
  (
    flock -x 9
    mkdir -p "$private_store" "$mutable_root"
    tar --extract --file "$archive_path" --directory "$private_store" --no-same-owner
    run_install_with_network_proof "$trace_dir"
  ) 9>"$lock_path"
  end="$(date +%s%3N)"
  elapsed=$((end - start))

  [ -f "$workspace/node_modules/.modules.yaml" ] || fail "node-modules-proof-missing" "$workspace/node_modules/.modules.yaml"
  write_restore_receipt "$restore_receipt" "$archive_path" "$archive_sha" "$source" "$lock_sha" "$workspace_sha" "$platform" "$arch" "$cache_key" "$elapsed" "$trace_dir"
  copy_receipt "$restore_receipt" "${issue}-${source}-${cache_key:0:16}-restore.json"
  printf 'SYMPHONY_NVME_PACKAGE_CACHE_OK schema=%s issue=%s cache_key=%s elapsed_ms=%s archive=%s\n' \
    "$RESTORE_RECEIPT_SCHEMA" "$issue" "$cache_key" "$elapsed" "$archive_path"
}

before_remove() {
  assert_trusted_hook_phase "before_remove"
  assert_private_state_inside_workspace || fail "private-state-escapes-workspace"
  local archive_path archive_sha
  archive_path="$(read_json_field "$restore_receipt" archive.path 2>/dev/null || true)"
  archive_sha="$(read_json_field "$restore_receipt" archive.sha256 2>/dev/null || true)"
  if [ -z "$archive_path" ]; then
    archive_path="${SYMPHONY_NVME_CACHE_ARCHIVE:-unknown}"
  fi
  if [ "$archive_path" != "unknown" ] && [ -f "$archive_path" ]; then
    archive_sha="$(sha256_file "$archive_path")"
  fi

  local targets=()
  [ -e "$private_store" ] && targets+=("$private_store")
  [ -e "$workspace/node_modules" ] && targets+=("$workspace/node_modules")
  for scope in apps packages workers; do
    if [ -d "$workspace/$scope" ]; then
      while IFS= read -r -d '' path; do
        targets+=("$path")
      done < <(find "$workspace/$scope" -mindepth 2 -maxdepth 2 -type d -name node_modules -print0)
    fi
  done

  local removed_json preserved_json teardown_receipt
  if [ "${#targets[@]}" -gt 0 ]; then
    removed_json="$(python3 - "$workspace" "${targets[@]}" <<'PY'
import json
import pathlib
import sys
workspace = pathlib.Path(sys.argv[1])
items = []
for raw in sys.argv[2:]:
    path = pathlib.Path(raw)
    if path.exists():
        items.append({"path": str(path), "relativePath": str(path.relative_to(workspace))})
print(json.dumps(items, sort_keys=True))
PY
)"
  else
    removed_json="[]"
  fi
  if [ "${#targets[@]}" -gt 0 ]; then
    rm -rf -- "${targets[@]}"
  fi
  preserved_json="$(python3 - "$archive_path" "$workspace" <<'PY'
import json
import pathlib
import sys
archive = pathlib.Path(sys.argv[1])
workspace = pathlib.Path(sys.argv[2])
print(json.dumps({
    "immutableArchiveExists": archive.exists() if str(archive) != "unknown" else None,
    "workspaceExists": workspace.exists(),
}, sort_keys=True))
PY
)"
  mkdir -p "$mutable_root"
  teardown_receipt="$mutable_root/teardown-receipt.json"
  write_teardown_receipt "$teardown_receipt" "$archive_path" "$archive_sha" "$removed_json" "$preserved_json"
  copy_receipt "$teardown_receipt" "${issue}-teardown-$(date +%s).json"
  printf 'SYMPHONY_NVME_PACKAGE_CACHE_TEARDOWN schema=%s issue=%s removed=%s archive=%s\n' \
    "$TEARDOWN_RECEIPT_SCHEMA" "$issue" "${#targets[@]}" "$archive_path"
}

case "$mode" in
  warm)
    warm_cache
    ;;
  after-create|after_create)
    after_create
    ;;
  before-remove|before_remove)
    before_remove
    ;;
  *)
    printf 'usage: %s [warm|after-create|before-remove]\n' "$0" >&2
    exit 64
    ;;
esac
