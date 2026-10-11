#!/usr/bin/env bash
set -euo pipefail

# Production-only, redacted Apple Wallet signing preflight. This validates the
# credential relationships that mere environment-variable presence cannot
# prove. It never prints a certificate, key, passphrase, or auth token.

fail() {
  echo "::error::$1" >&2
  exit 1
}

is_blank() {
  local value="${1:-}"
  [[ -z "${value//[[:space:]]/}" ]]
}

required=(
  APPLE_WALLET_PASS_TYPE_IDENTIFIER
  APPLE_WALLET_TEAM_IDENTIFIER
  APPLE_WALLET_SIGNER_CERT_PEM
  APPLE_WALLET_SIGNER_KEY_PEM
  APPLE_WALLET_WWDR_CERT_PEM
  APPLE_WALLET_AUTH_TOKEN_SECRET
  APPLE_WALLET_APNS_PRODUCTION
)

for key in "${required[@]}"; do
  is_blank "${!key:-}" && fail "Missing required Wallet release variable: $key"
done

# macOS runners ship LibreSSL as `openssl`; the checks below require real
# OpenSSL (verify -partial_chain, pkey -check, -nameopt). Prefer an explicit
# override, then PATH, then the keg-only Homebrew openssl@3 locations.
resolve_openssl() {
  local candidate
  for candidate in \
    "${APPLE_WALLET_OPENSSL:-}" \
    "$(command -v openssl 2>/dev/null || true)" \
    /opt/homebrew/opt/openssl@3/bin/openssl \
    /usr/local/opt/openssl@3/bin/openssl \
    "$(command -v brew >/dev/null 2>&1 && brew --prefix openssl@3 2>/dev/null || true)/bin/openssl"; do
    is_blank "$candidate" && continue
    [ -x "$candidate" ] || continue
    "$candidate" version 2>/dev/null | grep -q '^OpenSSL ' || continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

openssl="$(resolve_openssl)" || fail 'OpenSSL (not LibreSSL) is required for Wallet release validation.'
command -v cmp >/dev/null 2>&1 || fail 'cmp is required for Wallet release validation.'

pass_type_id="$APPLE_WALLET_PASS_TYPE_IDENTIFIER"
team_id="$APPLE_WALLET_TEAM_IDENTIFIER"
[[ "$pass_type_id" =~ ^pass\.[A-Za-z0-9.-]+$ ]] || fail 'Wallet Pass Type ID is malformed.'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Wallet Team ID must be 10 uppercase letters or digits.'
[[ ${#APPLE_WALLET_AUTH_TOKEN_SECRET} -ge 32 ]] || fail 'Wallet auth-token secret must contain at least 32 characters.'
[[ "$APPLE_WALLET_APNS_PRODUCTION" == 'true' ]] || fail 'Production Wallet updates require APPLE_WALLET_APNS_PRODUCTION=true.'

umask 077
wallet_tmp_dir="$(mktemp -d)"
cleanup() {
  find "$wallet_tmp_dir" -type f -delete
  rmdir "$wallet_tmp_dir"
}
trap cleanup EXIT

write_pem() {
  local key="$1"
  local target="$2"
  local value="${!key}"
  value="${value//\\n/$'\n'}"
  printf '%s\n' "$value" > "$target"
}

signer_cert="$wallet_tmp_dir/signer.pem"
signer_key="$wallet_tmp_dir/signer-key.pem"
wwdr_cert="$wallet_tmp_dir/wwdr.pem"
write_pem APPLE_WALLET_SIGNER_CERT_PEM "$signer_cert"
write_pem APPLE_WALLET_SIGNER_KEY_PEM "$signer_key"
write_pem APPLE_WALLET_WWDR_CERT_PEM "$wwdr_cert"

"$openssl" x509 -in "$signer_cert" -noout >/dev/null 2>&1 || fail 'Wallet signer certificate is not valid PEM.'
"$openssl" x509 -in "$wwdr_cert" -noout >/dev/null 2>&1 || fail 'Wallet WWDR certificate is not valid PEM.'
"$openssl" x509 -in "$signer_cert" -checkend 0 -noout >/dev/null 2>&1 || fail 'Wallet signer certificate is expired.'
"$openssl" x509 -in "$wwdr_cert" -checkend 0 -noout >/dev/null 2>&1 || fail 'Wallet WWDR certificate is expired.'

subject="$($openssl x509 -in "$signer_cert" -noout -subject -nameopt RFC2253)"
subject=",${subject#subject=},"
[[ "$subject" == *",UID=$pass_type_id,"* ]] || fail 'Wallet Pass Type ID does not match the signer certificate UID.'
[[ "$subject" == *",OU=$team_id,"* ]] || fail 'Wallet Team ID does not match the signer certificate OU.'

signer_issuer="$($openssl x509 -in "$signer_cert" -noout -issuer -nameopt RFC2253)"
wwdr_subject="$($openssl x509 -in "$wwdr_cert" -noout -subject -nameopt RFC2253)"
[[ "${signer_issuer#issuer=}" == "${wwdr_subject#subject=}" ]] || fail 'Wallet signer issuer does not match the supplied WWDR certificate.'
"$openssl" verify -partial_chain -CAfile "$wwdr_cert" "$signer_cert" >/dev/null 2>&1 || fail 'Wallet signer certificate does not verify against the supplied WWDR certificate.'

passin_args=()
if ! is_blank "${APPLE_WALLET_SIGNER_KEY_PASSPHRASE:-}"; then
  passin_args=(-passin env:APPLE_WALLET_SIGNER_KEY_PASSPHRASE)
fi
# macOS ships bash 3.2, where "${arr[@]}" on an empty array is an unbound
# variable error under set -u. The "${arr[@]+...}" idiom expands safely.
"$openssl" pkey -in "$signer_key" ${passin_args[@]+"${passin_args[@]}"} -check -noout >/dev/null 2>&1 || fail 'Wallet signer private key or passphrase is invalid.'
"$openssl" x509 -in "$signer_cert" -pubkey -noout \
  | "$openssl" pkey -pubin -outform DER > "$wallet_tmp_dir/cert-public.der" 2>/dev/null
"$openssl" pkey -in "$signer_key" ${passin_args[@]+"${passin_args[@]}"} -pubout -outform DER \
  > "$wallet_tmp_dir/key-public.der" 2>/dev/null
cmp -s "$wallet_tmp_dir/cert-public.der" "$wallet_tmp_dir/key-public.der" || fail 'Wallet signer certificate and private key do not match.'

echo 'Validated redacted production Wallet signing configuration.'
