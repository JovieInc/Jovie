#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly WEB_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly FIXTURE_ROOT="${WEB_ROOT}/tests/fixtures/audio"
readonly SOURCE_WAV="${FIXTURE_ROOT}/.source.wav"

for command_name in ffmpeg ffprobe; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required to generate audio fixtures" >&2
    exit 1
  fi
done

mkdir -p "${FIXTURE_ROOT}"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=1' \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a pcm_s16le "${SOURCE_WAV}"

ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a libmp3lame -b:a 128k "${FIXTURE_ROOT}/tone.mp3"
ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a pcm_s16le "${FIXTURE_ROOT}/tone.wav"
ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a flac "${FIXTURE_ROOT}/tone.flac"
ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a pcm_s16be "${FIXTURE_ROOT}/tone.aiff"
ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a aac -b:a 128k -f adts "${FIXTURE_ROOT}/tone.aac"
ffmpeg -hide_banner -loglevel error -y -i "${SOURCE_WAV}" \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -c:a aac -b:a 128k -movflags +faststart "${FIXTURE_ROOT}/tone.m4a"

for fixture_path in \
  "${FIXTURE_ROOT}/tone.mp3" \
  "${FIXTURE_ROOT}/tone.wav" \
  "${FIXTURE_ROOT}/tone.flac" \
  "${FIXTURE_ROOT}/tone.aiff" \
  "${FIXTURE_ROOT}/tone.aac" \
  "${FIXTURE_ROOT}/tone.m4a"; do
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,sample_rate,channels \
    -of default=noprint_wrappers=1 "${fixture_path}" >/dev/null
done

for extension in mp3 wav flac aiff aac m4a; do
  head -c 32 "${FIXTURE_ROOT}/tone.${extension}" \
    >"${FIXTURE_ROOT}/truncated.${extension}"
done

rm "${SOURCE_WAV}"
