#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_BUNDLE_ID="ie.jov.Jovie"

read_plist_value() {
  local key="$1"
  local file="$2"

  if [[ -f "$file" ]]; then
    /usr/libexec/PlistBuddy -c "Print :$key" "$file" 2>/dev/null || true
  fi
}

require_https_url() {
  local name="$1"
  local value="$2"

  node --input-type=module - "$name" "$value" <<'NODE'
const [name, value] = process.argv.slice(2);
let url;
try {
  url = new URL(value);
} catch {
  console.error(`${name} must be a valid HTTPS URL; received: ${value || '<empty>'}`);
  process.exit(1);
}

if (url.protocol !== 'https:' || !url.hostname) {
  console.error(`${name} must be HTTPS for real browser auth tests; received: ${value}`);
  process.exit(1);
}
NODE
}

run_xcodebuild_test() {
  local retries="${JOVIE_IOS_XCODEBUILD_RETRIES:-1}"
  local attempt=0
  local status=0

  while true; do
    set +e
    "$SCRIPT_DIR/run-xcodebuild.sh" test "$@"
    status=$?
    set -e

    if ((status == 0)); then
      return 0
    fi

    if ((attempt >= retries)); then
      return "$status"
    fi

    attempt=$((attempt + 1))
    echo "xcodebuild test failed with status $status; retrying after simulator reset ($attempt/$retries)..." >&2
    xcrun simctl shutdown all >/dev/null 2>&1 || true
    sleep 2
  done
}

resolve_publishable_key() {
  local web_base_url="$1"
  local existing_key="${CLERK_PUBLISHABLE_KEY:-${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}}"

  if [[ -n "$existing_key" && "$existing_key" != "pk_test_ci_placeholder" ]]; then
    printf '%s' "$existing_key"
    return 0
  fi

  local discovered_key
  if discovered_key="$(node --input-type=module - "$web_base_url" <<'NODE'
const [webBaseUrl] = process.argv.slice(2);
const signinUrl = new URL('/signin', webBaseUrl);
const response = await fetch(signinUrl, { redirect: 'follow' });
const html = await response.text();
const match = html.match(/pk_(?:test|live)_[A-Za-z0-9_-]+/);
if (!match) {
  process.exit(1);
}
process.stdout.write(match[0]);
NODE
  )"; then
    printf '%s' "$discovered_key"
    return 0
  fi

  if command -v doppler >/dev/null 2>&1; then
    discovered_key="$(
      doppler run --project jovie-web --config dev -- \
        bash -lc 'printf %s "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"' 2>/dev/null || true
    )"

    if [[ -n "$discovered_key" ]]; then
      printf '%s' "$discovered_key"
      return 0
    fi
  fi

  echo "Unable to discover Clerk publishable key from $web_base_url/signin or Doppler dev config." >&2
  return 1
}

require_publishable_key() {
  local web_base_url="$1"
  local publishable_key

  publishable_key="$(resolve_publishable_key "$web_base_url" || true)"
  if [[ -z "$publishable_key" ]]; then
    echo "Unable to run iOS auth smoke without a real Clerk publishable key." >&2
    echo "Set CLERK_PUBLISHABLE_KEY/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, start WEB_BASE_URL, or ensure Doppler dev is available." >&2
    return 1
  fi

  printf '%s' "$publishable_key"
}

run_real_browser_auth_simulator_test() {
  local api_base_url="${API_BASE_URL:-}"
  local web_base_url="${WEB_BASE_URL:-}"

  require_https_url "API_BASE_URL" "$api_base_url"
  require_https_url "WEB_BASE_URL" "$web_base_url"

  local publishable_key
  publishable_key="$(require_publishable_key "$web_base_url")"
  export CLERK_PUBLISHABLE_KEY="$publishable_key"
  export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$publishable_key"
  export API_BASE_URL="$api_base_url"
  export WEB_BASE_URL="$web_base_url"
  export JOVIE_IOS_REAL_BROWSER_AUTH=1

  cat > /tmp/jovie-ios-real-browser-auth.env <<EOF
JOVIE_IOS_REAL_BROWSER_AUTH=1
JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN=${JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN:-}
JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA=${JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA:-creator-ready}
API_BASE_URL=$api_base_url
WEB_BASE_URL=$web_base_url
CLERK_PUBLISHABLE_KEY=$publishable_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$publishable_key
EOF

  echo "Running HTTPS ASWebAuthenticationSession auth test against $web_base_url..."
  run_xcodebuild_test \
    -only-testing:JovieUITests/JovieUITests/testRealBrowserAuthProviderCompleteReachesAuthenticatedShell
}

run_live_auth_simulator_smoke() {
  local destination
  local destination_id
  destination="$("$SCRIPT_DIR/run-xcodebuild.sh" destination)"
  destination_id="${destination#*id=}"
  destination_id="${destination_id%%,*}"

  local api_base_url="${API_BASE_URL:-http://localhost:3100}"
  local web_base_url="${WEB_BASE_URL:-$api_base_url}"
  local persona="${JOVIE_IOS_LIVE_AUTH_PERSONA:-creator-ready}"
  local publishable_key
  local callback_response

  publishable_key="$(require_publishable_key "$web_base_url")"

  echo "Creating dev native auth callback against $api_base_url..."
  callback_response="$(
    node --input-type=module - "$api_base_url" "$persona" <<'NODE'
const [apiBaseUrl, persona] = process.argv.slice(2);
const endpoint = new URL('/api/dev/test-auth/mobile-callback', apiBaseUrl);
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    persona,
    returnTo: '/app',
  }),
});
const text = await response.text();
if (!response.ok) {
  console.error(`Failed to create native auth callback: ${response.status}`);
  console.error(text);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  console.error('Native auth callback route did not return JSON.');
  console.error(text);
  process.exit(1);
}

if (!payload.callbackUrl || !payload.codeVerifier) {
  console.error('Native auth callback route returned an incomplete payload.');
  console.error(JSON.stringify(payload));
  process.exit(1);
}

process.stdout.write(JSON.stringify(payload));
NODE
  )"

  local callback_url
  local code_verifier
  callback_url="$(
    node -e "const data = JSON.parse(process.argv[1]); process.stdout.write(data.callbackUrl);" "$callback_response"
  )"
  code_verifier="$(
    node -e "const data = JSON.parse(process.argv[1]); process.stdout.write(data.codeVerifier);" "$callback_response"
  )"

  echo "Launching native exchange iOS auth smoke in simulator $destination_id..."
  xcrun simctl boot "$destination_id" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$destination_id" -b >/dev/null
  xcrun simctl terminate "$destination_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true

  local existing_data_container
  local existing_prefs_file
  existing_data_container="$(xcrun simctl get_app_container "$destination_id" "$APP_BUNDLE_ID" data 2>/dev/null || true)"
  existing_prefs_file="$existing_data_container/Library/Preferences/$APP_BUNDLE_ID.plist"
  if [[ -f "$existing_prefs_file" ]]; then
    /usr/libexec/PlistBuddy -c "Delete :liveAuthUITestStatus" "$existing_prefs_file" >/dev/null 2>&1 || true
    /usr/libexec/PlistBuddy -c "Delete :liveAuthUITestError" "$existing_prefs_file" >/dev/null 2>&1 || true
    /usr/libexec/PlistBuddy -c "Delete :liveAuthUITestUserID" "$existing_prefs_file" >/dev/null 2>&1 || true
  fi

  local launch_env=(
    "SIMCTL_CHILD_API_BASE_URL=$api_base_url"
    "SIMCTL_CHILD_WEB_BASE_URL=$web_base_url"
    "SIMCTL_CHILD_JOVIE_IOS_PENDING_CODE_VERIFIER=$code_verifier"
    "SIMCTL_CHILD_JOVIE_IOS_LIVE_AUTH_STATUS=1"
  )

  if [[ -n "$publishable_key" ]]; then
    launch_env+=("SIMCTL_CHILD_CLERK_PUBLISHABLE_KEY=$publishable_key")
    launch_env+=("SIMCTL_CHILD_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$publishable_key")
  fi

  env "${launch_env[@]}" xcrun simctl launch \
    --terminate-running-process \
    "$destination_id" \
    "$APP_BUNDLE_ID" \
    -ui-testing-live-auth \
    -ui-testing-allow-exit \
    -ui-testing-open-auth-callback \
    "$callback_url" \
    >/dev/null

  local data_container=""
  local prefs_file=""
  local status=""
  local error_message=""
  local screenshot_dir="$PROJECT_ROOT/.build/ios-auth-callback"
  local timeout_seconds="${JOVIE_IOS_LIVE_AUTH_TIMEOUT:-60}"
  local deadline=$((SECONDS + timeout_seconds))

  while ((SECONDS < deadline)); do
    data_container="$(xcrun simctl get_app_container "$destination_id" "$APP_BUNDLE_ID" data 2>/dev/null || true)"
    prefs_file="$data_container/Library/Preferences/$APP_BUNDLE_ID.plist"
    status="$(read_plist_value liveAuthUITestStatus "$prefs_file")"

    case "$status" in
      ready|needs_onboarding)
        mkdir -p "$screenshot_dir"
        xcrun simctl io "$destination_id" screenshot "$screenshot_dir/live-auth-smoke.png" >/dev/null 2>&1 || true
        xcrun simctl terminate "$destination_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
        echo "Native exchange iOS auth smoke reached $status."
        echo "Captured simulator screenshot: $screenshot_dir/live-auth-smoke.png"
        return 0
        ;;
      error)
        error_message="$(read_plist_value liveAuthUITestError "$prefs_file")"
        xcrun simctl terminate "$destination_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
        echo "Native exchange iOS auth smoke failed: ${error_message:-unknown error}"
        return 1
        ;;
    esac

    sleep 1
  done

  mkdir -p "$screenshot_dir"
  xcrun simctl io "$destination_id" screenshot "$screenshot_dir/live-auth-timeout.png" >/dev/null 2>&1 || true
  xcrun simctl terminate "$destination_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
  echo "Timed out waiting for native exchange iOS auth smoke. Last status: ${status:-missing}"
  echo "Captured timeout screenshot: $screenshot_dir/live-auth-timeout.png"
  return 1
}

"$SCRIPT_DIR/ensure-configuration.sh"

echo "Running iOS auth callback unit tests..."
run_xcodebuild_test \
  -only-testing:JovieTests/AppStateTests

echo "Running deterministic custom-scheme callback simulator tests..."
run_xcodebuild_test \
  -only-testing:JovieUITests/JovieUITests/testAuthCallbackDeepLinkCompletesHarness \
  -only-testing:JovieUITests/JovieUITests/testAuthCallbackProviderErrorShowsAuthError

if [[ "${JOVIE_IOS_LIVE_AUTH_UI:-0}" == "1" ]]; then
  echo "Running native exchange iOS auth smoke tests..."
  run_live_auth_simulator_smoke
else
  echo "Skipping native exchange iOS auth smoke tests; set JOVIE_IOS_LIVE_AUTH_UI=1 to enable."
fi

if [[ "${JOVIE_IOS_REAL_BROWSER_AUTH:-0}" == "1" ]]; then
  run_real_browser_auth_simulator_test
else
  echo "Skipping HTTPS browser auth tests; set JOVIE_IOS_REAL_BROWSER_AUTH=1 to enable."
fi
