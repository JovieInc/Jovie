#!/usr/bin/env bash

# Shared fail-closed installer for Hermes launchd Python and plist artifacts.
# Callers render/copy every artifact into one stage, then pass install triplets:
#   <staged path> <destination path> <mode>

hermes_sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

hermes_create_launchd_stage() {
  mktemp -d "${TMPDIR:-/tmp}/jovie-hermes-launchd.XXXXXX"
}

hermes_remove_launchd_stage() {
  local stage_dir="$1"

  if [[ -d "$stage_dir" && "$(basename "$stage_dir")" == jovie-hermes-launchd.* ]]; then
    rm -rf -- "$stage_dir"
    return
  fi

  printf 'Refusing to remove unexpected launchd stage: %s\n' "$stage_dir" >&2
  return 1
}

hermes_stage_artifact() {
  local source_path="$1"
  local staged_path="$2"
  local mode="$3"

  mkdir -p "$(dirname "$staged_path")"
  install -m "$mode" "$source_path" "$staged_path"
}

hermes_validate_launchd_stage() {
  local stage_dir="$1"
  local python_bin="${HERMES_PYTHON_BIN:-python3}"
  local plutil_bin="${HERMES_PLUTIL_BIN:-plutil}"
  local python_count=0
  local plist_count=0
  local artifact

  command -v "$python_bin" >/dev/null 2>&1 || {
    printf 'Missing Python validator: %s\n' "$python_bin" >&2
    return 1
  }
  command -v "$plutil_bin" >/dev/null 2>&1 || {
    printf 'Missing plist validator: %s\n' "$plutil_bin" >&2
    return 1
  }

  while IFS= read -r -d '' artifact; do
    if ! PYTHONPYCACHEPREFIX="${stage_dir}/.pycache" \
      "$python_bin" -m py_compile "$artifact"; then
      printf 'Invalid Python launchd entrypoint: %s\n' "$artifact" >&2
      return 1
    fi
    python_count=$((python_count + 1))
  done < <(find "$stage_dir" -type f -name '*.py' -print0)

  while IFS= read -r -d '' artifact; do
    if ! "$plutil_bin" -lint "$artifact" >/dev/null; then
      printf 'Invalid launchd plist: %s\n' "$artifact" >&2
      return 1
    fi
    plist_count=$((plist_count + 1))
  done < <(find "$stage_dir" -type f -name '*.plist' -print0)

  if (( python_count == 0 )); then
    printf 'Launchd stage contains no Python entrypoint: %s\n' "$stage_dir" >&2
    return 1
  fi
  if (( plist_count == 0 )); then
    printf 'Launchd stage contains no plist: %s\n' "$stage_dir" >&2
    return 1
  fi
}

hermes_atomic_install_artifact() {
  local staged_path="$1"
  local destination_path="$2"
  local mode="$3"
  local destination_dir
  local install_tmp
  local staged_sha
  local installed_sha

  destination_dir="$(dirname "$destination_path")"
  mkdir -p "$destination_dir"
  install_tmp="$(mktemp "${destination_dir}/.jovie-install.$(basename "$destination_path").XXXXXX")"

  if ! install -m "$mode" "$staged_path" "$install_tmp"; then
    rm -f "$install_tmp"
    return 1
  fi

  staged_sha="$(hermes_sha256 "$staged_path")" || return 1
  installed_sha="$(hermes_sha256 "$install_tmp")" || return 1
  if [[ "$staged_sha" != "$installed_sha" ]]; then
    printf 'Staged artifact checksum mismatch before install: %s\n' "$destination_path" >&2
    rm -f "$install_tmp"
    return 1
  fi

  if ! mv -f "$install_tmp" "$destination_path"; then
    rm -f "$install_tmp"
    return 1
  fi
  installed_sha="$(hermes_sha256 "$destination_path")" || return 1
  if [[ "$staged_sha" != "$installed_sha" ]]; then
    printf 'Installed artifact checksum mismatch: %s\n' "$destination_path" >&2
    return 1
  fi
}

hermes_install_validated_launchd_artifacts() {
  local stage_dir="$1"
  shift

  if (( $# == 0 || $# % 3 != 0 )); then
    printf 'Expected one or more <staged> <destination> <mode> triplets\n' >&2
    return 2
  fi

  # This must complete before the first destination is touched.
  hermes_validate_launchd_stage "$stage_dir"

  while (( $# > 0 )); do
    hermes_atomic_install_artifact "$1" "$2" "$3"
    shift 3
  done
}
