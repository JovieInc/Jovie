#!/bin/bash
set -euo pipefail
export JOVIE_AGENT_PROFILE=coder
owned_sim=7C4FF1A5-9969-4A7D-898D-45F47B5BE7F5
record_pid=''
restore() {
 if [[ -n "$record_pid" ]]; then kill -INT "$record_pid" 2>/dev/null || true; wait "$record_pid" || true; fi
 xcrun simctl ui "$owned_sim" content_size large
 xcrun simctl ui "$owned_sim" content_size > /private/tmp/sidebar-native-record-restored-text.txt
 xcrun simctl shutdown "$owned_sim"
 xcrun simctl list devices --json > /private/tmp/sidebar-native-record-restored-state.json
}
trap restore EXIT
xcrun simctl boot "$owned_sim"
xcrun simctl bootstatus "$owned_sim" -b
xcrun simctl ui "$owned_sim" content_size accessibility-extra-extra-extra-large
xcrun simctl io "$owned_sim" recordVideo --codec=h264 /private/tmp/sidebar-native-success.mov > /private/tmp/sidebar-native-record-video.log 2>&1 &
record_pid=$!
for attempt in $(seq 1 20); do
 if rg -q 'Recording started' /private/tmp/sidebar-native-record-video.log; then break; fi
 sleep 0.25
done
rg -q 'Recording started' /private/tmp/sidebar-native-record-video.log
export JOVIE_IOS_SCREENSHOT_DIR=/private/tmp/sidebar-native-record-screenshots
export JOVIE_IOS_RESET_SIMULATOR=0
pnpm exec bash apps/ios/scripts/run-xcodebuild.sh test-without-building -- \
 -only-testing:JovieUITests/JovieUITests/testDrawerUsesCanonicalRootsAndWorkChildren \
 -derivedDataPath /private/tmp/sidebar-native-derived \
 -resultBundlePath /private/tmp/sidebar-native-success-recording.xcresult \
 -parallel-testing-enabled NO
kill -INT "$record_pid"
wait "$record_pid"
record_pid=''
