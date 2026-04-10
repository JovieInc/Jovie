#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$WEB_ROOT/../.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/.context/outputs"
RESULT_ROOT="$WEB_ROOT/test-results"
FRAMES_ROOT="$OUTPUT_ROOT/yc-demo-frames"
PORT="${PORT:-3100}"
RAW_VIDEO="$RESULT_ROOT/yc-demo.webm"
MP4_VIDEO="$RESULT_ROOT/yc-demo.mp4"
OUTPUT_WEBM="$OUTPUT_ROOT/yc-demo.webm"
OUTPUT_MP4="$OUTPUT_ROOT/yc-demo.mp4"
CONTACT_SHEET="$OUTPUT_ROOT/yc-demo-contact-sheet.jpg"
SERVER_LOG="$OUTPUT_ROOT/yc-demo-server.log"

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

rm -f "$RAW_VIDEO" "$MP4_VIDEO" "$OUTPUT_WEBM" "$OUTPUT_MP4" "$CONTACT_SHEET"

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
SAMPLE_TIMES=(1 6 10 14 22 26 30 34)

for index in "${!SAMPLE_TIMES[@]}"; do
  frame_number="$(printf '%03d' "$((index + 1))")"
  timestamp="${SAMPLE_TIMES[$index]}"
  ffmpeg -y -ss "$timestamp" -i "$MP4_VIDEO" -frames:v 1 -vf "scale=320:-1" "$FRAMES_ROOT/frame-${frame_number}.jpg" >/dev/null 2>&1
done

ffmpeg -y -framerate 1 -i "$FRAMES_ROOT/frame-%03d.jpg" -vf "tile=2x4:padding=12:margin=12:color=white" -frames:v 1 "$CONTACT_SHEET" >/dev/null 2>&1

echo "[yc-demo] Outputs ready:"
echo "  $OUTPUT_WEBM"
echo "  $OUTPUT_MP4"
echo "  $CONTACT_SHEET"
