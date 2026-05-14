#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$WEB_ROOT/../.." && pwd)"
OUTPUT_ROOT="$REPO_ROOT/.context/outputs"
RESULT_ROOT="$WEB_ROOT/test-results"
FRAMES_ROOT="$OUTPUT_ROOT/founder-demo-frames"
PORT="${PORT:-3100}"
VOICEOVER_SOURCE="${DEMO_VOICEOVER_SOURCE:-/Users/timwhite/Downloads/N Bronson Ave 17.m4a}"
CLEAN_AUDIO="$OUTPUT_ROOT/founder-demo-voiceover-clean.m4a"
RAW_VIDEO="$RESULT_ROOT/founder-demo.webm"
MP4_VIDEO="$RESULT_ROOT/founder-demo.mp4"
OUTPUT_WEBM="$OUTPUT_ROOT/founder-demo.webm"
OUTPUT_MP4="$OUTPUT_ROOT/founder-demo.mp4"
PUBLIC_MP4="$WEB_ROOT/public/demo/jovie-demo.mp4"
PUBLIC_POSTER="$WEB_ROOT/public/demo/jovie-demo-poster.jpg"
CONTACT_SHEET="$OUTPUT_ROOT/founder-demo-contact-sheet.jpg"
SERVER_LOG="$OUTPUT_ROOT/founder-demo-server.log"
AUDIO_FILTER="${DEMO_AUDIO_FILTER:-silenceremove=start_periods=1:start_duration=0.1:start_threshold=-30dB:start_silence=0.05:stop_periods=-1:stop_duration=0.25:stop_threshold=-30dB:stop_silence=0.12,atempo=1.025,loudnorm=I=-16:TP=-1.5:LRA=11}"

for cmd in curl doppler ffmpeg ffprobe; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [[ ! -f "$VOICEOVER_SOURCE" ]]; then
  echo "Missing voiceover source: $VOICEOVER_SOURCE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_ROOT" "$RESULT_ROOT" "$(dirname "$PUBLIC_MP4")"
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

if [[ "${DEMO_SKIP_BUILD:-0}" == "1" ]]; then
  echo "[founder-demo] Skipping production build; using existing .next output."
else
  echo "[founder-demo] Building production app..."
  doppler run -- env "${COMMON_ENV[@]}" pnpm run build
fi

echo "[founder-demo] Starting production server on port $PORT..."
doppler run -- env "${COMMON_ENV[@]}" ./node_modules/.bin/next start -p "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Production server exited before it became ready." >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi
  if curl -sf "http://127.0.0.1:${PORT}/demo/founder-video" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://127.0.0.1:${PORT}/demo/founder-video" >/dev/null; then
  echo "Timed out waiting for the production demo route on port $PORT." >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

rm -f "$RAW_VIDEO" "$MP4_VIDEO" "$OUTPUT_WEBM" "$OUTPUT_MP4" "$CONTACT_SHEET"

echo "[founder-demo] Cleaning voiceover..."
ffmpeg -y -i "$VOICEOVER_SOURCE" -af "$AUDIO_FILTER" -c:a aac -b:a 160k "$CLEAN_AUDIO" >/dev/null 2>&1
CLEAN_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$CLEAN_AUDIO")"

echo "[founder-demo] Recording Playwright demo for ${CLEAN_DURATION}s..."
doppler run -- env "${COMMON_ENV[@]}" \
  DEMO_REUSE_SERVER=1 \
  E2E_SKIP_WARMUP=1 \
  E2E_SKIP_SEED=1 \
  FOUNDER_DEMO_RECORDING_SECONDS="$CLEAN_DURATION" \
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

echo "[founder-demo] Transcoding MP4..."
ffmpeg -y -i "$RAW_VIDEO" -i "$CLEAN_AUDIO" -map 0:v:0 -map 1:a:0 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 20 -preset medium -c:a aac -b:a 160k -shortest "$MP4_VIDEO" >/dev/null 2>&1

MP4_SIZE="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$MP4_VIDEO")"
if [[ "$MP4_SIZE" != "1280x720" ]]; then
  echo "Unexpected MP4 video size: $MP4_SIZE" >&2
  exit 1
fi

cp "$RAW_VIDEO" "$OUTPUT_WEBM"
cp "$MP4_VIDEO" "$OUTPUT_MP4"
cp "$MP4_VIDEO" "$PUBLIC_MP4"

echo "[founder-demo] Extracting poster and review frames..."
ffmpeg -y -ss 1 -i "$MP4_VIDEO" -frames:v 1 -q:v 2 "$PUBLIC_POSTER" >/dev/null 2>&1
SAMPLE_TIMES=(1 8 16 24 32 40 48 56 64 72 80 88)

for index in "${!SAMPLE_TIMES[@]}"; do
  frame_number="$(printf '%03d' "$((index + 1))")"
  timestamp="${SAMPLE_TIMES[$index]}"
  ffmpeg -y -ss "$timestamp" -i "$MP4_VIDEO" -frames:v 1 -vf "scale=320:-1" "$FRAMES_ROOT/frame-${frame_number}.jpg" >/dev/null 2>&1
done

ffmpeg -y -framerate 1 -i "$FRAMES_ROOT/frame-%03d.jpg" -vf "tile=3x4:padding=12:margin=12:color=white" -frames:v 1 "$CONTACT_SHEET" >/dev/null 2>&1

echo "[founder-demo] Outputs ready:"
echo "  $OUTPUT_WEBM"
echo "  $OUTPUT_MP4"
echo "  $PUBLIC_MP4"
echo "  $PUBLIC_POSTER"
echo "  $CONTACT_SHEET"
