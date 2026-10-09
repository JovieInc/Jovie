#!/bin/bash
set -euo pipefail
export JOVIE_AGENT_PROFILE=coder
export PATH=/Users/timwhite/.nvm/versions/node/v24.21.0/bin:$PATH
owned_sim=7C4FF1A5-9969-4A7D-898D-45F47B5BE7F5
restore() {
 xcrun simctl ui "$owned_sim" content_size large
 xcrun simctl ui "$owned_sim" content_size > /private/tmp/sidebar-native-group-red2-restored-text.txt
 xcrun simctl shutdown "$owned_sim"
 xcrun simctl list devices --json > /private/tmp/sidebar-native-group-red2-restored-state.json
}
trap restore EXIT
xcrun simctl boot "$owned_sim"
xcrun simctl bootstatus "$owned_sim" -b
xcrun simctl ui "$owned_sim" content_size accessibility-extra-extra-extra-large
export JOVIE_IOS_SCREENSHOT_DIR=/private/tmp/sidebar-native-group-red2-screenshots
export JOVIE_IOS_RESULT_BUNDLE_PATH=/private/tmp/sidebar-native-group-red2-qualified.xcresult
export JOVIE_IOS_RESET_SIMULATOR=0
export JOVIE_IOS_RUNTIME_PERFORMANCE=1
pnpm ios:test -- \
 -only-testing:JovieUITests/JovieUITests/testDrawerRecentGroupsKeepOuterAnchorsStable \
 -enableCodeCoverage YES \
 -derivedDataPath /private/tmp/sidebar-native-ci-derived \
 -parallel-testing-enabled NO
