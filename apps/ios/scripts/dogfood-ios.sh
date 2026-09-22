#!/usr/bin/env bash
# JOV-4572 foundation slice: deterministic iOS dogfood exploration driver.
#
# Runs DogfoodExplorationUITests on an iOS Simulator via run-xcodebuild.sh and
# assembles a structured run report under artifacts/ios-dogfood/<run-id>/:
#
#   report.json          schema jovie-ios-dogfood/v1 — machine-readable verdict,
#                        per-surface checks, crashes, artifact paths
#   events.jsonl         raw surface/test events emitted by the test process
#   screenshots/*.png    per-surface captures (JOVIE_IOS_SCREENSHOT_DIR)
#   dogfood.xcresult     full xcodebuild result bundle (attachments incl.)
#   crashes/             simulator crash reports (Jovie*.ips) from the run window
#   logs/xcodebuild.log  captured xcodebuild output
#
# Out of scope for this slice (documented in docs/IOS_DOGFOOD.md):
#   - automatic Linear issue filing (Symphony's lane — report.json is the
#     integration artifact it would consume)
#   - nightly/merge-queue scheduling (plug-in point documented there too)
#
# Env overrides:
#   JOVIE_IOS_DOGFOOD_OUTPUT_DIR   output root (default: artifacts/ios-dogfood/<ts>-<sha>)
#   JOVIE_IOS_DOGFOOD_ONLY_TESTING  -only-testing selector (default: DogfoodExplorationUITests)
#   JOVIE_IOS_DOGFOOD_CRASH_DIR     crash-report dir (default: ~/Library/Logs/DiagnosticReports)
#   JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS  forwarded to run-xcodebuild.sh
#   JOVIE_IOS_RESET_SIMULATOR      0 to keep prior simulator state (default: 1)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
GIT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${GIT_SHA}"
OUTPUT_DIR="${JOVIE_IOS_DOGFOOD_OUTPUT_DIR:-$REPO_ROOT/artifacts/ios-dogfood/$RUN_ID}"
ONLY_TESTING="${JOVIE_IOS_DOGFOOD_ONLY_TESTING:-JovieUITests/DogfoodExplorationUITests}"
CRASH_DIR="${JOVIE_IOS_DOGFOOD_CRASH_DIR:-$HOME/Library/Logs/DiagnosticReports}"

mkdir -p "$OUTPUT_DIR/screenshots" "$OUTPUT_DIR/crashes" "$OUTPUT_DIR/logs"

EVENTS_PATH="$OUTPUT_DIR/events.jsonl"
REPORT_PATH="$OUTPUT_DIR/report.json"
RESULT_BUNDLE="$OUTPUT_DIR/dogfood.xcresult"
XCODEBUILD_LOG="$OUTPUT_DIR/logs/xcodebuild.log"
START_EPOCH="$(date +%s)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "dogfood: run_id=$RUN_ID"
echo "dogfood: output=$OUTPUT_DIR"

# Snapshot the crash-report directory so we only attribute reports created
# during this run window.
CRASH_SNAPSHOT="$OUTPUT_DIR/logs/diagnostic-reports.before.txt"
ls "$CRASH_DIR" 2>/dev/null | sort >"$CRASH_SNAPSHOT" || true

# Reuse the canonical destination resolution + simulator reset path. The
# destination action emits phase logs before the destination line — keep only
# the `platform=...` line.
DESTINATION="$(
  JOVIE_IOS_RESET_SIMULATOR=0 bash "$SCRIPT_DIR/run-xcodebuild.sh" destination \
    | awk '/^platform=/{d=$0} END{print d}'
)"
if [[ -z "$DESTINATION" ]]; then
  echo "dogfood: no iOS Simulator destination resolved" >&2
  exit 1
fi
DESTINATION_ID="${DESTINATION#*id=}"
DESTINATION_ID="${DESTINATION_ID%%,*}"
echo "dogfood: destination=$DESTINATION"

set +e
JOVIE_IOS_SCREENSHOT_DIR="$OUTPUT_DIR/screenshots" \
JOVIE_IOS_DOGFOOD_EVENTS_PATH="$EVENTS_PATH" \
JOVIE_IOS_RESULT_BUNDLE_PATH="$RESULT_BUNDLE" \
  bash "$SCRIPT_DIR/run-xcodebuild.sh" test \
    -only-testing:"$ONLY_TESTING" \
    2>&1 | tee "$XCODEBUILD_LOG"
XCODEBUILD_STATUS="${PIPESTATUS[0]}"
set -e

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
END_EPOCH="$(date +%s)"

# Attribute only reports that did not exist before the run.
NEW_CRASHES=()
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  if ! grep -qxF "$name" "$CRASH_SNAPSHOT"; then
    cp "$CRASH_DIR/$name" "$OUTPUT_DIR/crashes/" 2>/dev/null || true
    NEW_CRASHES+=("$name")
  fi
done < <(ls "$CRASH_DIR" 2>/dev/null | grep -E '^Jovie.*\.(ips|crash)$' || true)

CRASH_LIST="$(printf '%s\n' "${NEW_CRASHES[@]+"${NEW_CRASHES[@]}"}")"

OUTPUT_DIR="$OUTPUT_DIR" \
EVENTS_PATH="$EVENTS_PATH" \
REPORT_PATH="$REPORT_PATH" \
RESULT_BUNDLE="$RESULT_BUNDLE" \
XCODEBUILD_LOG="$XCODEBUILD_LOG" \
XCODEBUILD_STATUS="$XCODEBUILD_STATUS" \
CRASH_LIST="$CRASH_LIST" \
RUN_ID="$RUN_ID" \
GIT_SHA="$GIT_SHA" \
GIT_BRANCH="$GIT_BRANCH" \
DESTINATION="$DESTINATION" \
DESTINATION_ID="$DESTINATION_ID" \
STARTED_AT="$STARTED_AT" \
FINISHED_AT="$FINISHED_AT" \
DURATION_SECONDS="$((END_EPOCH - START_EPOCH))" \
ONLY_TESTING="$ONLY_TESTING" \
LC_ALL=en_US.UTF-8 RUBYOPT= ruby -EUTF-8:UTF-8 -rjson -e '
  def read_jsonl(path)
    return [] unless File.exist?(path)
    File.readlines(path).map do |line|
      line = line.strip
      next if line.empty?
      begin
        JSON.parse(line)
      rescue JSON::ParserError
        nil
      end
    end.compact
  end

  output_dir = ENV.fetch("OUTPUT_DIR")
  events = read_jsonl(ENV.fetch("EVENTS_PATH"))
  surfaces = events.select { |e| e["type"] == "surface" }
  crashes = ENV.fetch("CRASH_LIST", "").split("\n").map(&:strip).reject(&:empty?)
  xcodebuild_status = ENV.fetch("XCODEBUILD_STATUS", "1").to_i

  verdict =
    if events.empty?
      "inconclusive"
    elsif xcodebuild_status != 0 || crashes.any? || surfaces.any? { |s| s["status"] == "fail" }
      "fail"
    else
      "pass"
    end

  report = {
    "schema" => "jovie-ios-dogfood/v1",
    "issue" => "JOV-4572",
    "generated_at" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "verdict" => verdict,
    "run" => {
      "id" => ENV.fetch("RUN_ID"),
      "started_at" => ENV.fetch("STARTED_AT"),
      "finished_at" => ENV.fetch("FINISHED_AT"),
      "duration_seconds" => ENV.fetch("DURATION_SECONDS", "0").to_i,
      "git_sha" => ENV.fetch("GIT_SHA"),
      "git_branch" => ENV.fetch("GIT_BRANCH"),
      "test_selector" => ENV.fetch("ONLY_TESTING"),
      "xcodebuild_exit" => xcodebuild_status
    },
    "device" => {
      "destination" => ENV.fetch("DESTINATION"),
      "simulator_udid" => ENV.fetch("DESTINATION_ID")
    },
    "surfaces" => surfaces,
    "surface_summary" => {
      "total" => surfaces.length,
      "passed" => surfaces.count { |s| s["status"] == "pass" },
      "failed" => surfaces.count { |s| s["status"] == "fail" }
    },
    "issues" => surfaces.flat_map { |s| (s["issues"] || []).map { |i| { "surface" => s["name"], "issue" => i } } },
    "crashes" => crashes.map { |name| { "report" => "crashes/#{name}", "process" => "Jovie" } },
    "artifacts" => {
      "report" => "report.json",
      "events" => "events.jsonl",
      "screenshots_dir" => "screenshots",
      "xcresult" => File.exist?(ENV.fetch("RESULT_BUNDLE")) ? "dogfood.xcresult" : nil,
      "xcodebuild_log" => "logs/xcodebuild.log",
      "crashes_dir" => "crashes"
    }.compact,
    "integration" => {
      "linear_filing" => "not-wired — Symphony consumes report.json to propose issues; see docs/IOS_DOGFOOD.md",
      "scheduling" => "not-wired — intended nightly lane; see docs/IOS_DOGFOOD.md"
    }
  }

  File.write(ENV.fetch("REPORT_PATH"), JSON.pretty_generate(report) + "\n")
  puts "dogfood: verdict=#{verdict} surfaces=#{surfaces.count { |s| s["status"] == "pass" }}/#{surfaces.length} crashes=#{crashes.length}"
  puts "dogfood: report=#{ENV.fetch("REPORT_PATH")}"
'

if [[ "$XCODEBUILD_STATUS" -ne 0 ]]; then
  exit "$XCODEBUILD_STATUS"
fi

# A clean xcodebuild that still produced crash reports is a dogfood finding.
if [[ "${#NEW_CRASHES[@]}" -gt 0 ]]; then
  echo "dogfood: crash reports captured — failing the run" >&2
  exit 1
fi
