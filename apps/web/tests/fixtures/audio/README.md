# Generated audio fixtures

These files are one-second, 440 Hz synthetic tones generated locally by
`apps/web/scripts/generate-audio-test-fixtures.sh`. They contain no third-party
music, speech, metadata, user data, URLs, or credentials.

`long-vbr-tone.mp3` is a 60-second, 220 Hz variable-bitrate stress fixture. It
keeps long-file cue jumps and scrubbing on a real MP3 seek table while remaining
small enough for deterministic browser CI.

The corpus intentionally covers every format in `AUDIO_FORMAT_REGISTRY`, plus a
32-byte truncated copy of each container. Browser decode expectations live in
`manifest.ts`; acceptance and direct playback are separate capabilities. In
particular, Chromium accepts an AIFF upload by name and MIME but cannot decode
the valid AIFF fixture through `decodeAudioData`.

Regenerate only when intentionally changing the corpus. The checked-in manifest
hashes make accidental fixture replacement fail closed.
