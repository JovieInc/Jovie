#!/usr/bin/env bash
# Test-only scanner acquisition mocks, owned by scan-secrets.test.sh.
setup_scanner_download_fixture() {
  local fixture_bin="$1"
  cat >"$fixture_bin/curl" <<'EOF'
#!/usr/bin/env bash
count=0
[[ -f "$CURL_COUNT" ]] && count="$(cat "$CURL_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" >"$CURL_COUNT"
if [[ "${CURL_ALWAYS_FAIL:-}" == "1" || $count -eq 1 ]]; then
  echo "curl: (35) Recv failure: Connection reset by peer" >&2
  exit 35
fi
out=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-o' || "$prev" == '--output' ]] && out="$arg"
  prev="$arg"
done
printf 'fake-tarball' >"$out"
EOF
  cat >"$fixture_bin/tar" <<'EOF'
#!/usr/bin/env bash
dest=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-C' ]] && dest="$arg"
  prev="$arg"
done
member="${!#}"
printf '#!/usr/bin/env bash\nexit 0\n' >"$dest/$member"
EOF
  # Authenticated fallback: log token and args, write the asset to -O.
  cat >"$fixture_bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s %s\n' "${GH_TOKEN:-}" "$*" >>"$GH_CALLS"
while [[ $# -gt 0 ]]; do [[ "$1" == -O ]] && out="$2"; shift; done
printf 'fake-tarball' >"$out"
EOF
  # No container fallback in this fixture: the release path alone is under test.
  printf '#!/usr/bin/env bash\nexit 1\n' >"$fixture_bin/docker"
  chmod +x "$fixture_bin/curl" "$fixture_bin/tar" "$fixture_bin/docker" "$fixture_bin/gh"
  # Keep scanner discovery isolated while retaining the actual Node runtime.
  ln -s "$(node -p 'process.execPath')" "$fixture_bin/node"
}

# Pins matching the fake binary the stub tar lays down, for this host platform,
# so the sha256 verification in fetch-scanner.sh is exercised, not bypassed.
write_scanner_download_pins() {
  local pins_file="$1" fake sum os arch
  fake="$(mktemp)"
  printf '#!/usr/bin/env bash\nexit 0\n' >"$fake"
  sum="$(shasum -a 256 "$fake" | cut -d' ' -f1)"
  rm -f "$fake"
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in aarch64 | arm64) arch=arm64 ;; *) arch=amd64 ;; esac
  {
    printf 'gitleaks %s %s/%s %s\n' "${GITLEAKS_VERSION:-8.21.2}" "$os" "$arch" "$sum"
    printf 'trufflehog %s %s/%s %s\n' "${TRUFFLEHOG_VERSION:-3.99.8}" "$os" "$arch" "$sum"
  } >"$pins_file"
}
