#!/usr/bin/env bash
# Run the pinned Symphony selector against the governor-bounded-codex workflow.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

PIN="$(
  python3 - <<'PY'
import pathlib, re
text = pathlib.Path("scripts/symphony/symphony_official_runtime.py").read_text()
match = re.search(r'OFFICIAL_SYMPHONY_GIT_SHA = "([0-9a-f]{40})"', text)
if not match:
    raise SystemExit("OFFICIAL_SYMPHONY_GIT_SHA missing")
print(match.group(1))
PY
)"
OTP_VERSION="27.3.4"
ELIXIR_VERSION="1.19.5"

# The CI cache key is derived from this output, so every input that changes
# the cached BEAM toolchain, Mix home or build outputs must be printed here.
if [[ "${1:-}" == "--print-cache-key" ]]; then
  echo "pin=${PIN}"
  echo "otp=${OTP_VERSION}"
  echo "elixir=${ELIXIR_VERSION}"
  echo "platform=$(. /etc/os-release && printf '%s-%s' "$ID" "$VERSION_ID")-$(uname -m)"
  exit 0
fi

WORKFLOW="$ROOT/scripts/symphony/profiles/governor-bounded-codex/WORKFLOW.md"
TEST_SOURCE="$ROOT/scripts/symphony/tests/governor_bounded_codex_intake_test.exs"
test -f "$WORKFLOW"
test -f "$TEST_SOURCE"

beam_matches_pin() {
  local prefix="$1"
  [[ -x "$prefix/bin/elixir" && -x "$prefix/otp/bin/erl" ]] || return 1
  [[ "$(cat "$prefix/otp/releases/${OTP_VERSION%%.*}/OTP_VERSION" 2>/dev/null)" == "$OTP_VERSION" ]] || return 1
  local version
  version="$(PATH="$prefix/otp/bin:$prefix/bin:$PATH" elixir --version 2>/dev/null)" || return 1
  grep -q "^Elixir ${ELIXIR_VERSION} " <<<"$version"
}

install_elixir() {
  local prefix="${SYMPHONY_ELIXIR_PREFIX:-${RUNNER_TEMP:-/tmp}/symphony-selector-beam}"
  if beam_matches_pin "$prefix"; then
    echo "symphony-selector-beam=warm otp=${OTP_VERSION} elixir=${ELIXIR_VERSION}"
    export PATH="$prefix/otp/bin:$prefix/bin:$PATH"
    return
  fi
  # A partial or mismatched prefix is reinstalled and re-verified below.
  mkdir -p "$prefix"
  local version_id
  version_id="$(. /etc/os-release && printf '%s' "$VERSION_ID")"
  local otp_url="https://builds.hex.pm/builds/otp/ubuntu-${version_id}/OTP-${OTP_VERSION}.tar.gz"
  if ! curl -fsI "$otp_url" >/dev/null; then
    otp_url="https://builds.hex.pm/builds/otp/ubuntu-24.04/OTP-${OTP_VERSION}.tar.gz"
  fi
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "$otp_url" | tar -xz -C "$tmp"
  local extracted
  extracted="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'OTP-*' -print -quit)"
  "$extracted/Install" -minimal "$extracted"
  rm -rf "$prefix/otp"
  mv "$extracted" "$prefix/otp"
  curl -fsSL "https://builds.hex.pm/builds/elixir/v${ELIXIR_VERSION}-otp-${OTP_VERSION%%.*}.zip" -o "$tmp/elixir.zip"
  unzip -qo "$tmp/elixir.zip" -d "$prefix"
  rm -rf "$tmp"
  beam_matches_pin "$prefix"
  export PATH="$prefix/otp/bin:$prefix/bin:$PATH"
}

if ! command -v elixir >/dev/null 2>&1 || ! elixir --version | grep -q 'Elixir 1.19'; then
  install_elixir
fi

CHECKOUT="${SYMPHONY_SELECTOR_CHECKOUT:-}"
if [[ -z "$CHECKOUT" ]]; then
  CHECKOUT="${RUNNER_TEMP:-/tmp}/symphony-selector-src"
  if [[ ! -d "$CHECKOUT/.git" ]]; then
    # CI may restore pin-keyed elixir/deps and elixir/_build before the clone.
    # Park them beside the checkout (same filesystem) and put them back below.
    rm -rf "${CHECKOUT}.restored"
    if [[ -d "$CHECKOUT/elixir" ]]; then
      mv "$CHECKOUT/elixir" "${CHECKOUT}.restored"
    fi
    rm -rf "$CHECKOUT"
    git clone --filter=blob:none --no-checkout https://github.com/JovieInc/symphony.git "$CHECKOUT"
  fi
  git -C "$CHECKOUT" fetch --depth 1 origin "$PIN"
  git -C "$CHECKOUT" checkout --detach --force FETCH_HEAD
  if [[ -d "${CHECKOUT}.restored" ]]; then
    for output in deps _build; do
      if [[ -d "${CHECKOUT}.restored/$output" && ! -e "$CHECKOUT/elixir/$output" ]]; then
        mv "${CHECKOUT}.restored/$output" "$CHECKOUT/elixir/$output"
      fi
    done
    rm -rf "${CHECKOUT}.restored"
  fi
fi

test "$(git -C "$CHECKOUT" rev-parse HEAD)" = "$PIN"
cp "$TEST_SOURCE" "$CHECKOUT/elixir/test/symphony_elixir/governor_bounded_codex_intake_test.exs"

# openai/symphony v0.0.3. This runner does not execute that installed binary.
HOST_INSTALLED_SHA="1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb"
echo "selector-under-test=${PIN} host-installed-not-under-test=${HOST_INSTALLED_SHA}"

export JOVIE_CODEX_WORKFLOW="$WORKFLOW"
export SYMPHONY_SELECTOR_SHA="$PIN"
export SYMPHONY_HOST_INSTALLED_SHA="$HOST_INSTALLED_SHA"
export MIX_ENV=test
export LINEAR_API_KEY="${LINEAR_API_KEY:-fixture-token}"
cd "$CHECKOUT/elixir"
# --if-missing installs exactly as before on a cold MIX_HOME and reuses a
# restored one; deps.get and the test compile are no-ops for current outputs.
mix local.hex --force --if-missing
mix local.rebar --force --if-missing
mix deps.get
mix test --trace test/symphony_elixir/governor_bounded_codex_intake_test.exs
