"""Sourced helper versus an inlined copy must keep the source and port the retry."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lanes"))
import sourced_shell_conflict as conflict  # noqa: E402

REL = "scripts/security/scan-secrets-release-fetch.sh"
SOURCE = """\
# Retry release downloads after curl 35 resets (JOV-6809). HTTP 504 falls
# back to the release asset URL inside the sourced fetcher.
SCAN_SECRETS_RETRY_DELAY="${SCAN_SECRETS_RETRY_DELAY:-2}"
# shellcheck source=scripts/security/scan-secrets-release-fetch.sh
. "$REPO_ROOT/scripts/security/scan-secrets-release-fetch.sh"
"""
INLINE = """\
# Release downloads hit resets (curl 35, JOV-6809) and HTTP 504 runs (#24269,
# #24488). Fetch to a temp file so a restart never feeds tar a concatenated
# body, abort stalls, back off with jitter (6 tries, 62-124s), fail closed.
SCAN_SECRETS_RETRY_DELAY="${SCAN_SECRETS_RETRY_DELAY:-2}"
SCAN_SECRETS_DOWNLOAD_ATTEMPTS="${SCAN_SECRETS_DOWNLOAD_ATTEMPTS:-6}"
fetch_release_tarball() {
  local url="$1" dest_dir="$2" member="$3" tmp attempt delay="$SCAN_SECRETS_RETRY_DELAY"
  tmp="$(mktemp)"
  for ((attempt = 1; attempt <= SCAN_SECRETS_DOWNLOAD_ATTEMPTS; attempt++)); do
    if curl -sSfL --connect-timeout 20 --speed-limit 1024 --speed-time 30 -o "$tmp" "$url" \\
      && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      chmod +x "$dest_dir/$member"
      rm -f "$tmp"
      return 0
    fi
    if [[ $attempt -lt $SCAN_SECRETS_DOWNLOAD_ATTEMPTS ]]; then
      echo "scanner download attempt $attempt failed; retrying" >&2
      sleep "$((delay + RANDOM % (delay + 1)))"
      delay=$((delay * 2))
    fi
  done
  rm -f "$tmp"
  echo "::error title=Secret scanner download failed::Could not fetch $member after $SCAN_SECRETS_DOWNLOAD_ATTEMPTS attempts ($url)." >&2
  return 1
}
"""
HELPER = """\
#!/usr/bin/env bash
# Sourced fetcher. HTTP 504 falls back to release metadata.
# api-budget: github-actions-token 30/hr - release metadata when the scanner CDN returns HTTP 504

if [[ -z "${REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

fetch_release_asset_via_api() {
  curl -sSfL "${headers[@]}" -o "$dest" "$asset_url"
}

fetch_release_tarball() {
  local url="$1" dest_dir="$2" member="$3"
  local tmp attempt status
  tmp="$(mktemp)"
  for attempt in 1 2 3; do
    status=0
    curl -sSfL -o "$tmp" "$url" || status=$?
    if [[ $status -eq 0 ]] && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      return 0
    fi
    if [[ $status -eq 22 ]] && fetch_release_asset_via_api "$url" "$tmp" \\
      && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      return 0
    fi
    if [[ $attempt -lt 3 ]]; then
      echo "scanner download attempt $attempt failed; retrying" >&2
      sleep "${SCAN_SECRETS_RETRY_DELAY:-2}"
    fi
  done
  rm -f "$tmp"
  echo "::error title=Secret scanner download failed::Could not fetch $member after 3 attempts ($url)." >&2
  return 1
}
"""


def _hunk(ours: str, theirs: str) -> str:
    return f"kept-before\n<<<<<<< HEAD\n{ours}=======\n{theirs}>>>>>>> origin/main\nkept-after\n"


class SourcedShellConflictTest(unittest.TestCase):
    def _resolve(self, text: str, helper: str = HELPER):
        extras: list[str] = []
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / REL
            path.parent.mkdir(parents=True)
            path.write_text(helper)
            path.chmod(0o755)
            resolved = conflict.resolve_shell_conflict(text, root, extras)
            body = path.read_text() if path.exists() else ""
            mode = path.stat().st_mode if path.exists() else 0
        return resolved, extras, body, mode

    def test_either_orientation_keeps_the_source_and_ports_retry_into_the_helper(self):
        for ours, theirs in ((SOURCE, INLINE), (INLINE, SOURCE)):
            with self.subTest(source_first=ours is SOURCE):
                resolved, extras, helper, mode = self._resolve(_hunk(ours, theirs))
                self.assertEqual(resolved, f"kept-before\n{SOURCE}kept-after\n")
                self.assertNotIn("fetch_release_tarball() {", resolved)
                self.assertNotIn("SCAN_SECRETS_DOWNLOAD_ATTEMPTS", resolved)
                self.assertEqual(extras, [REL])
                self.assertIn("fetch_release_asset_via_api() {", helper)
                self.assertEqual(helper.count("--speed-time 30"), 2)
                self.assertIn("--connect-timeout 20 --speed-limit 1024 --speed-time 30", helper)
                self.assertIn(conflict._ARITHMETIC, helper)
                self.assertIn(conflict._JITTER, helper)
                self.assertIn(conflict._DOUBLING, helper)
                self.assertIn('SCAN_SECRETS_DOWNLOAD_ATTEMPTS="${SCAN_SECRETS_DOWNLOAD_ATTEMPTS:-6}"', helper)
                self.assertIn('local tmp attempt status delay="${SCAN_SECRETS_RETRY_DELAY:-2}"', helper)
                self.assertIn("[[ $status -eq 22 ]]", helper)
                self.assertIn("after $SCAN_SECRETS_DOWNLOAD_ATTEMPTS attempts", helper)
                self.assertIn(conflict._NOTE, helper)
                self.assertNotIn("for attempt in 1 2 3", helper)
                self.assertNotIn("after 3 attempts", helper)
                self.assertTrue(mode & 0o111)
                again = conflict._upgrade_helper(helper, INLINE)
                self.assertEqual(again, helper)

    def test_and_chain_still_resolves_without_writing_a_helper(self):
        ours = ("pnpm --filter @jovie/extension test && node --experimental-strip-types "
                "--test workers/cron-hub/src/index.test.mjs")
        theirs = "pnpm --filter @jovie/extension test && pnpm --filter @jovie/mesh-hub test"
        text = (f"<<<<<<< HEAD\n        run: {ours}\n=======\n"
                f"        run: {theirs}\n>>>>>>> origin/main\n")
        resolved, extras, helper, _mode = self._resolve(text)
        self.assertEqual(
            resolved,
            "        run: "
            f"{theirs} && node --experimental-strip-types --test workers/cron-hub/src/index.test.mjs\n",
        )
        self.assertEqual(extras, [])
        self.assertEqual(helper, HELPER)

    def test_unknown_hunks_and_a_helper_that_cannot_take_the_port_stay_unresolved(self):
        prose = "<<<<<<< HEAD\nthis is prose\n=======\nalso prose\n>>>>>>> origin/main\n"
        resolved, extras, helper, _mode = self._resolve(prose)
        self.assertIsNone(resolved)
        self.assertEqual(extras, [])
        self.assertEqual(helper, HELPER)

        no_flags = INLINE.replace(" --connect-timeout 20 --speed-limit 1024 --speed-time 30", "")
        resolved, extras, helper, _mode = self._resolve(_hunk(SOURCE, no_flags))
        self.assertIsNone(resolved)
        self.assertEqual(helper, HELPER)

        bare = HELPER.replace("fetch_release_asset_via_api() {", "download_asset() {")
        resolved, extras, helper, _mode = self._resolve(_hunk(SOURCE, INLINE), bare)
        self.assertIsNone(resolved)
        self.assertEqual(helper, bare)

        escaped = SOURCE.replace(REL, "scripts/../scan-secrets-release-fetch.sh")
        resolved, extras, _helper, _mode = self._resolve(_hunk(escaped, INLINE))
        self.assertIsNone(resolved)
        self.assertEqual(extras, [])

        marked = HELPER.replace("local tmp", "<<<<<<<\nlocal tmp", 1)
        resolved, extras, helper, _mode = self._resolve(_hunk(SOURCE, INLINE), marked)
        self.assertIsNone(resolved)
        self.assertEqual(helper, marked)


if __name__ == "__main__":
    unittest.main()
