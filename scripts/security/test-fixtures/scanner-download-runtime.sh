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
  [[ "$prev" == '-o' ]] && out="$arg"
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
  chmod +x "$fixture_bin/curl" "$fixture_bin/tar"
  # Keep scanner discovery isolated while retaining the actual Node runtime.
  ln -s "$(node -p 'process.execPath')" "$fixture_bin/node"
}
