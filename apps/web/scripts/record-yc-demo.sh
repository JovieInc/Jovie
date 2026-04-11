#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$WEB_ROOT/../.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/.context/outputs"
RESULT_ROOT="$WEB_ROOT/test-results"
FRAMES_ROOT="$OUTPUT_ROOT/yc-demo-frames"
AUDIT_ROOT="$OUTPUT_ROOT/yc-demo-audit"
PORT="${PORT:-3100}"
RAW_VIDEO="$RESULT_ROOT/yc-demo.webm"
MP4_VIDEO="$RESULT_ROOT/yc-demo.mp4"
OUTPUT_WEBM="$OUTPUT_ROOT/yc-demo.webm"
OUTPUT_MP4="$OUTPUT_ROOT/yc-demo.mp4"
CONTACT_SHEET="$OUTPUT_ROOT/yc-demo-contact-sheet.jpg"
SERVER_LOG="$OUTPUT_ROOT/yc-demo-server.log"
AUDIT_CHECKLIST="$OUTPUT_ROOT/yc-demo-audit.md"

if [[ -z "${DEMO_CLERK_USER_ID:-}" ]]; then
  echo "DEMO_CLERK_USER_ID is required." >&2
  exit 1
fi

for cmd in curl doppler ffmpeg ffprobe; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_ROOT" "$RESULT_ROOT"
rm -rf "$FRAMES_ROOT"
mkdir -p "$FRAMES_ROOT"
rm -rf "$AUDIT_ROOT"
mkdir -p "$AUDIT_ROOT"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

cd "$WEB_ROOT"

COMMON_ENV=(
  DEMO_RECORDING=1
  NEXT_PUBLIC_DEMO_RECORDING=1
  E2E_USE_TEST_AUTH_BYPASS=1
  NEXT_PUBLIC_E2E_MODE=1
  NEXT_DISABLE_TOOLBAR=1
  BASE_URL="http://127.0.0.1:${PORT}"
  PORT="$PORT"
)

echo "[yc-demo] Building production app..."
doppler run -- env "${COMMON_ENV[@]}" pnpm run build

echo "[yc-demo] Starting production server on port $PORT..."
doppler run -- env "${COMMON_ENV[@]}" ./node_modules/.bin/next start -p "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "Timed out waiting for the production server on port $PORT." >&2
  exit 1
fi

echo "[yc-demo] Prewarming public routes..."
PREWARM_PATHS=(
  "/"
  "/timwhite/the-deep-end?noredirect=1"
  "/timwhite"
  "/timwhite?mode=subscribe"
)

for path in "${PREWARM_PATHS[@]}"; do
  curl -sf "http://127.0.0.1:${PORT}${path}" >/dev/null || true
done

rm -f "$RAW_VIDEO" "$MP4_VIDEO" "$OUTPUT_WEBM" "$OUTPUT_MP4" "$CONTACT_SHEET"
rm -f "$AUDIT_CHECKLIST"

echo "[yc-demo] Recording Playwright demo..."
doppler run -- env "${COMMON_ENV[@]}" \
  DEMO_REUSE_SERVER=1 \
  E2E_SKIP_WARMUP=1 \
  E2E_SKIP_SEED=1 \
  ./node_modules/.bin/playwright test --config playwright.config.demo.ts --reporter=line

if [[ ! -f "$RAW_VIDEO" ]]; then
  echo "Missing expected Playwright video: $RAW_VIDEO" >&2
  exit 1
fi

RAW_SIZE="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$RAW_VIDEO")"
if [[ "$RAW_SIZE" != "1280x720" ]]; then
  echo "Unexpected raw video size: $RAW_SIZE" >&2
  exit 1
fi

echo "[yc-demo] Transcoding MP4..."
ffmpeg -y -i "$RAW_VIDEO" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 20 -preset medium "$MP4_VIDEO" >/dev/null 2>&1

MP4_SIZE="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$MP4_VIDEO")"
if [[ "$MP4_SIZE" != "1280x720" ]]; then
  echo "Unexpected MP4 video size: $MP4_SIZE" >&2
  exit 1
fi

cp "$RAW_VIDEO" "$OUTPUT_WEBM"
cp "$MP4_VIDEO" "$OUTPUT_MP4"

echo "[yc-demo] Extracting review frames..."
SAMPLE_TIMES=(3 6 8 12 14 18 24 26 32 36)

for index in "${!SAMPLE_TIMES[@]}"; do
  frame_number="$(printf '%03d' "$((index + 1))")"
  timestamp="${SAMPLE_TIMES[$index]}"
  ffmpeg -y -ss "$timestamp" -i "$MP4_VIDEO" -frames:v 1 -vf "scale=320:-1" "$FRAMES_ROOT/frame-${frame_number}.jpg" >/dev/null 2>&1
done

ffmpeg -y -framerate 1 -i "$FRAMES_ROOT/frame-%03d.jpg" -vf "tile=2x5:padding=12:margin=12:color=white" -frames:v 1 "$CONTACT_SHEET" >/dev/null 2>&1

echo "[yc-demo] Extracting full audit frames..."
ffmpeg -y -i "$MP4_VIDEO" -vf "fps=1,scale=640:-1" "$AUDIT_ROOT/sec-%03d.jpg" >/dev/null 2>&1

cat >"$AUDIT_CHECKLIST" <<'EOF'
# YC Demo Audit Checklist

- Confirm there is no `Analytics unavailable` state.
- Confirm there are no visible `localhost` or `127.0.0.1` URLs.
- Confirm there are no visible loading spinners or skeletons.
- Confirm the demo profile does not show `Profile 75%` or any incomplete profile badge.
- Confirm the featured release tasks scene avoids negative metadata workflow empty states.
- Confirm Tim White identity and the curated release sequence stay consistent.
- Confirm the public profile latest-release card shows the upcoming release countdown.
- Confirm the release drawer DSP list shows popularity ordering and the `Popular` badge when expected.

Recommended checkpoints:
- `sec-003.jpg`
- `sec-006.jpg`
- `sec-008.jpg`
- `sec-012.jpg`
- `sec-014.jpg`
- `sec-018.jpg`
- `sec-024.jpg`
- `sec-026.jpg`
- `sec-032.jpg`
- `sec-036.jpg`
EOF

echo "[yc-demo] Outputs ready:"
echo "  $OUTPUT_WEBM"
echo "  $OUTPUT_MP4"
echo "  $CONTACT_SHEET"
echo "  $AUDIT_ROOT"
echo "  $AUDIT_CHECKLIST"
