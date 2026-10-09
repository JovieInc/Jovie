#!/bin/bash
set -euo pipefail
export JOVIE_AGENT_PROFILE=coder
export PATH=/Users/timwhite/.nvm/versions/node/v24.21.0/bin:$PATH
owned_sim=7C4FF1A5-9969-4A7D-898D-45F47B5BE7F5
restore() {
 /usr/bin/plutil -replace WebBaseUrl -string http://localhost:3100 apps/ios/Jovie/Configuration.local.plist
 xcrun simctl ui "$owned_sim" content_size large
 xcrun simctl ui "$owned_sim" content_size > /private/tmp/sidebar-native-ovie-final-restored-text.txt
 xcrun simctl shutdown "$owned_sim"
 xcrun simctl list devices --json > /private/tmp/sidebar-native-ovie-final-restored-state.json
}
trap restore EXIT
/usr/bin/plutil -replace WebBaseUrl -string https://jov.ie apps/ios/Jovie/Configuration.local.plist
xcrun simctl boot "$owned_sim"
xcrun simctl bootstatus "$owned_sim" -b
xcrun simctl ui "$owned_sim" content_size accessibility-extra-extra-extra-large
export JOVIE_IOS_SCREENSHOT_DIR=/private/tmp/sidebar-native-ovie-final-screenshots
export JOVIE_IOS_RESULT_BUNDLE_PATH=/private/tmp/sidebar-native-ovie-final-qualified.xcresult
export JOVIE_IOS_RESET_SIMULATOR=0
export JOVIE_IOS_RUNTIME_PERFORMANCE=1
pnpm ios:test -- \
 -only-testing:JovieTests/AppShellOperatorNavigationTests \
 -only-testing:JovieTests/AppShellDrawerThreadsFilterTests \
 -only-testing:JovieTests/AppShellDrawerThreadsSkeletonTests \
 -only-testing:JovieTests/AppShellDrawerRecentPolicyTests \
 -only-testing:JovieTests/AppShellDrawerPinsPolicyTests \
 -only-testing:JovieTests/AppShellDrawerSurfaceLayoutTests \
 -only-testing:JovieUITests/JovieUITests/testOvieDrawerUsesOperatorRootsBoundedMoreAndScopedPins \
 -only-testing:JovieUITests/JovieUITests/testAdminSettingsWorkspaceSwitchUpdatesOvieAndRestoresJovie \
 -only-testing:JovieUITests/JovieUITests/testDrawerRecentGroupsKeepOuterAnchorsStable \
 -only-testing:JovieUITests/JovieUITests/testDrawerUsesCanonicalRootsAndWorkChildren \
 -only-testing:JovieUITests/JovieUITests/testShellDrawerAndSettingsNavigation \
 -only-testing:JovieUITests/JovieUITests/testDrawerBasePlaneOccludedWhenClosed \
 -only-testing:JovieUITests/JovieUITests/testOfflineStatusReservesToolbarGeometry \
 -only-testing:JovieUITests/JovieUITests/testChatComposerPreservesDraftAcrossShellNavigation \
 -only-testing:JovieUITests/JovieUITests/testDrawerOpenMakesContentCardInert \
 -only-testing:JovieUITests/JovieUITests/testEdgeDragDoesNotOpenDrawerWhileComposerFocused \
 -only-testing:JovieUITests/JovieUITests/testDrawerSurfaceSwitcherLabelsStaySingleLine \
 -only-testing:JovieUITests/JovieUITests/testShellNavigationRuntimePerformance \
 -enableCodeCoverage YES \
 -derivedDataPath /private/tmp/sidebar-native-ci-derived \
 -parallel-testing-enabled NO
