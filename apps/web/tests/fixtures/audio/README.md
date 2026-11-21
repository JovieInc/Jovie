# Generated audio fixtures

Decodable formats (mp3/wav/flac/aac/m4a) are one-second, 440 Hz synthetic tones
from `apps/web/scripts/generate-audio-test-fixtures.sh`. They contain no
third-party music, speech, metadata, user data, URLs, or credentials.

`tone.aiff` is a minimal valid AIFF (COMM+SSND) kept tiny on purpose: Chromium
accepts AIFF by name/MIME but cannot `decodeAudioData` it, so a full-second PCM
tone only burned tracked bytes. Sniff/acceptance still require a real container.

The corpus covers every `AUDIO_FORMAT_REGISTRY` format plus a 32-byte truncated
copy of each. Manifest hashes fail closed on accidental replacement.
