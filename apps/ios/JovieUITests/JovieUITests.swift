import XCTest

final class JovieUITests: XCTestCase {
  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  func testCinematicSplashLaunchShowsLoadingState() {
    let app = launchMockApp(launchArgument: "-ui-testing-splash", expectedElementDescription: "\"Jovie is loading\"") {
      $0.images["cinematic-loading"]
    }

    XCTAssertTrue(app.images["cinematic-loading"].exists)
    attachScreenshot(named: "cinematic-loading", app: app)
  }

  func testSignedOutLaunchShowsAuthScreen() {
    let app = launchMockApp(launchArgument: "-ui-testing-signed-out", expectedElementDescription: "\"Continue in Browser\"") {
      $0.buttons["Continue in Browser"]
    }

    XCTAssertTrue(app.buttons["Continue in Browser"].exists)
    XCTAssertFalse(app.buttons["Continue with Google"].exists)
    XCTAssertFalse(app.buttons["Continue with Apple"].exists)
    XCTAssertFalse(app.staticTexts["Email"].exists)
    XCTAssertFalse(app.buttons["Open Jovie on web"].exists)
    attachScreenshot(named: "signed-out", app: app)
  }

  func testChatFirstHomeAndWhatsNewTestCard() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-whats-new",
      expectedElementDescription: "\"What’s New\"",
      timeout: 8
    ) {
      $0.staticTexts["What’s New"]
    }

    XCTAssertTrue(app.staticTexts["Chat is home"].waitForExistence(timeout: 3))
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Ask Jovie")).firstMatch.exists
    )
    XCTAssertTrue(
      app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "bottom tab")).firstMatch.exists
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-bar"),
      "What’s New launch must not restore the bottom tab bar.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "whats-new-test-card", app: app)

    app.buttons["whats-new-done"].tap()
    XCTAssertTrue(
      app.textFields["Ask Jovie"].waitForExistence(timeout: 5),
      "Dismissing What’s New must land on chat home.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat-first-home", app: app)
  }

  func testSignedOutLaunchPerformance() throws {
    guard testEnvironmentValue("JOVIE_IOS_LAUNCH_PERFORMANCE") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LAUNCH_PERFORMANCE=1 to run launch performance evidence.")
    }

    let timeoutSeconds =
      Double(testEnvironmentValue("JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS") ?? "") ?? 4
    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-signed-out")
    app.launchArguments.append("-ui-testing-allow-exit")
    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)]) {
      app.launch()
      XCTAssertTrue(
        app.buttons["Continue in Browser"].waitForExistence(timeout: timeoutSeconds),
        "Signed-out shell did not become responsive within \(timeoutSeconds) seconds.\n\(app.debugDescription)"
      )
      app.terminate()
    }
  }

  func testReadyLaunchShowsProfileTab() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    XCTAssertTrue(app.staticTexts["Tim White"].exists)
    XCTAssertTrue(app.buttons["Open navigation drawer"].exists)
    XCTAssertTrue(app.buttons["Open Settings"].exists)
    XCTAssertTrue(app.buttons["dashboard-copy-url-button"].isEnabled)
    XCTAssertTrue(app.buttons["dashboard-share-profile-button"].isEnabled)
    XCTAssertTrue(app.buttons["Open Public Profile"].exists)
    attachScreenshot(named: "profile", app: app)
  }

  func testPublicProfileOpensInFullScreenEmbeddedBrowser() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Open Public Profile\"") {
      $0.buttons["Open Public Profile"]
    }

    app.buttons["Open Public Profile"].tap()

    XCTAssertTrue(
      app.buttons["Close Public Profile"].waitForExistence(timeout: 3),
      "Embedded public-profile browser did not open.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.buttons["Reload"].exists)
    XCTAssertTrue(
      app.staticTexts["Public Profile"].waitForExistence(timeout: 3),
      "Embedded public-profile content did not finish loading.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "public-profile-browser", app: app)

    app.buttons["Close Public Profile"].tap()
    XCTAssertTrue(app.buttons["Open Public Profile"].waitForExistence(timeout: 3))
  }

  func testPublicProfileBrowserErrorRetriesToLoadedContent() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-ready",
      additionalLaunchArguments: ["-ui-testing-public-profile-error"],
      expectedElementDescription: "\"Open Public Profile\""
    ) {
      $0.buttons["Open Public Profile"]
    }

    app.buttons["Open Public Profile"].tap()

    XCTAssertTrue(
      app.staticTexts["Couldn't load this profile."].waitForExistence(timeout: 3),
      "Embedded browser did not expose its recoverable error state.\n\(app.debugDescription)"
    )
    app.buttons["Retry"].tap()
    XCTAssertTrue(
      app.staticTexts["Public Profile"].waitForExistence(timeout: 3),
      "Retry did not recover the embedded browser.\n\(app.debugDescription)"
    )
  }

  func testReadyLaunchWithoutQRShowsUnavailableFallback() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-qr-unavailable",
      expectedElementDescription: "\"QR unavailable\""
    ) {
      $0.buttons["QR unavailable"]
    }

    XCTAssertTrue(app.staticTexts["Tim White"].exists)
    let copyButton = app.buttons["dashboard-copy-url-button"]
    let shareButton = app.buttons["dashboard-share-profile-button"]
    XCTAssertTrue(copyButton.exists)
    XCTAssertFalse(copyButton.isEnabled)
    XCTAssertTrue(shareButton.exists)
    XCTAssertFalse(shareButton.isEnabled)
    XCTAssertTrue(app.staticTexts["Profile link unavailable"].exists)
    XCTAssertTrue(
      app.buttons["QR unavailable"].exists,
      "Dashboard did not show the no-payload QR fallback.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "profile-controls-unavailable", app: app)
  }

  func testProfileLoadErrorRetryRestoresDashboard() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-profile-error",
      expectedElementDescription: "\"Retry\""
    ) {
      $0.buttons["Retry"]
    }

    XCTAssertTrue(app.staticTexts["Couldn't load your profile."].exists)
    attachScreenshot(named: "profile-error", app: app)

    app.buttons["Retry"].tap()

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Retry did not restore the dashboard.\n\(app.debugDescription)"
    )
  }

  func testNeedsOnboardingLaunchShowsNativeProfileCompletion() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-needs-onboarding",
      expectedElementDescription: "\"Finish Your Profile\""
    ) {
      $0.staticTexts["Finish Your Profile"]
    }

    XCTAssertTrue(app.textFields["profile-completion-display-name"].exists)
    XCTAssertTrue(app.textFields["profile-completion-handle"].exists)
    XCTAssertTrue(app.buttons["profile-completion-submit"].exists)
    XCTAssertFalse(
      app.buttons["profile-completion-web-fallback"].exists,
      "Core profile completion must stay inside the iOS app."
    )

    let displayName = app.textFields["profile-completion-display-name"]
    let handle = app.textFields["profile-completion-handle"]
    let submit = app.buttons["profile-completion-submit"]
    displayName.tap()
    displayName.typeText("Tim White")
    handle.tap()
    handle.typeText("timwhite")
    app.swipeDown()
    _ = app.keyboards.firstMatch.waitForNonExistence(timeout: 2)
    let submitMinYBeforeError = submit.frame.minY
    submit.tap()

    XCTAssertTrue(
      app.staticTexts["profile-completion-error"].waitForExistence(timeout: 3),
      "A failed native submission must remain recoverable on the native form.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      submit.frame.minY,
      submitMinYBeforeError,
      accuracy: 1,
      "A server error must swap into a reserved slot without moving Finish Profile.\n\(app.debugDescription)"
    )
    XCTAssertTrue(displayName.exists)
    XCTAssertTrue(handle.exists)
    XCTAssertTrue(submit.isEnabled)
    XCTAssertFalse(app.buttons["profile-completion-web-fallback"].exists)
    attachScreenshot(named: "needs-onboarding", app: app)
  }

  func testWaitlistPendingCanReturnToAccountSelection() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-waitlist-pending",
      expectedElementDescription: "\"Use a Different Account\"",
      timeout: 10
    ) {
      $0.buttons["waitlist-use-different-account"]
    }

    XCTAssertTrue(app.staticTexts["You're on the Waitlist"].exists)
    XCTAssertFalse(app.buttons["Open navigation drawer"].exists)

    let switchAccount = app.buttons["waitlist-use-different-account"]
    switchAccount.tap()
    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 10),
      "Waitlist account switch did not return to signed-out account selection.\n\(app.debugDescription)"
    )
  }

  func testWaitlistPendingHasNoShellChromeAndReservedAction() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-waitlist-pending",
      expectedElementDescription: "\"You're on the Waitlist\"",
      timeout: 10
    ) {
      $0.staticTexts["You're on the Waitlist"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["waitlist-pending"].exists,
      "Waitlist surface identifier missing.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["Open navigation drawer"].exists,
      "Waitlist must not mount the authenticated drawer.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-bar"),
      "Waitlist must not render the primary tab bar.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-talk-fab"),
      "Waitlist must not render the Talk FAB.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-chat"),
      "Waitlist must not render Chat as a primary tab.\n\(app.debugDescription)"
    )

    let header = app.staticTexts["You're on the Waitlist"]
    let action = app.buttons["waitlist-use-different-account"]
    XCTAssertTrue(action.exists)
    XCTAssertGreaterThan(
      action.frame.minY,
      header.frame.maxY,
      "Waitlist action overlapped the header.\n\(app.debugDescription)"
    )
    XCTAssertGreaterThanOrEqual(
      action.frame.height,
      44,
      "Waitlist action lost its reserved touch target.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "waitlist-layout", app: app)
  }

  func testExpiredProfileCompletionReturnsToNativeSignIn() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-needs-onboarding-unauthorized",
      expectedElementDescription: "\"Finish Your Profile\""
    ) {
      $0.staticTexts["Finish Your Profile"]
    }

    let displayName = app.textFields["profile-completion-display-name"]
    let handle = app.textFields["profile-completion-handle"]
    displayName.tap()
    displayName.typeText("Tim White")
    handle.tap()
    handle.typeText("timwhite")
    app.buttons["profile-completion-submit"].tap()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 3),
      "An expired onboarding session must return to native sign-in.\n\(app.debugDescription)"
    )
    XCTAssertFalse(app.staticTexts["Finish Your Profile"].exists)
    XCTAssertFalse(app.buttons["profile-completion-web-fallback"].exists)
  }

  func testFullScreenSettingsLogsOutToSignedOut() {
    let app = launchMockApp(launchArgument: "-ui-testing-settings", expectedElementDescription: "\"Settings\"") {
      $0.staticTexts["Settings"]
    }

    attachScreenshot(named: "settings", app: app)
    for linkTitle in ["Manage Account", "Support", "Billing", "Privacy", "Terms"] {
      XCTAssertTrue(
        app.buttons[linkTitle].waitForExistence(timeout: 2),
        "Settings row \(linkTitle) did not appear.\n\(app.debugDescription)"
      )
    }
    for valueTitle in ["Version", "Build"] {
      XCTAssertTrue(
        app.staticTexts[valueTitle].waitForExistence(timeout: 2),
        "Settings value row \(valueTitle) did not appear.\n\(app.debugDescription)"
      )
    }

    app.buttons["Log Out"].tap()

    XCTAssertTrue(
      app.buttons["Confirm Log Out"].waitForExistence(timeout: 3),
      "Logout confirmation did not appear.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "settings-logout-confirmation", app: app)
    app.buttons["Confirm Log Out"].tap()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 5),
      "Logout did not return to signed-out state.\n\(app.debugDescription)"
    )
  }

  func testDrawerSwitchesBetweenChatAndProfile() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.staticTexts["Ask Jovie"]
    }

    XCTAssertTrue(app.textFields["Ask Jovie"].exists)
    XCTAssertTrue(
      app.staticTexts["Ask Jovie about your profile, releases, and next moves."].exists,
      "Chat empty state did not explain the online intro behavior.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat", app: app)

    app.buttons["Open navigation drawer"].tap()
    let profileSurface = app.buttons["shell-drawer-surface-shell-tab-profile"]
    let chatSurface = app.buttons["shell-drawer-surface-shell-tab-chat"]
    XCTAssertTrue(
      profileSurface.waitForExistence(timeout: 3),
      "Drawer surface switcher did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(chatSurface.exists)

    profileSurface.tap()

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Drawer switcher did not switch to Profile.\n\(app.debugDescription)"
    )
  }

  // GH-12949: with the drawer closed, the recessed base plane must be fully
  // occluded — no drawer chrome hittable under the composer/content card.
  func testDrawerBasePlaneOccludedWhenClosed() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let composer = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(composer, timeout: 3),
      "Chat composer did not become hittable with drawer closed.\n\(app.debugDescription)"
    )

    let drawer = app.descendants(matching: .any)["shell-drawer"]
    XCTAssertFalse(
      drawer.isHittable,
      "Drawer base plane stayed hittable with drawer closed — content card must fully occlude it.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["shell-drawer-new-chat"].isHittable,
      "Drawer New chat control is hittable with drawer closed.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["shell-drawer-surface-shell-tab-profile"].isHittable,
      "Drawer surface switcher is hittable with drawer closed.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.staticTexts["Start a conversation to see recent conversations here."].isHittable,
      "Drawer empty-threads copy is hittable under content with drawer closed.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "drawer-base-plane-occluded-closed", app: app)
  }

  // Chat-first shell: no bottom tab bar. Talk lives in the toolbar/sidebar.
  func testPrimaryTabBarAndTalkFAB() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-bar"),
      "Bottom tab bar must be gone on the chat-first shell.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-chat"),
      "Chat must not be a bottom tab.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-library"),
      "Library must not be a bottom tab.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      firstMatchingButton(app, identifiers: ["shell-talk-fab"], labels: ["Talk"]).exists,
      "Talk must stay reachable off the bottom bar.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["chat-voice-button"].exists,
      "Composer mic should stay removed.\n\(app.debugDescription)"
    )

    app.buttons["Open navigation drawer"].tap()
    XCTAssertTrue(
      app.buttons["shell-drawer-surface-shell-tab-library"].waitForExistence(timeout: 3),
      "Sidebar must expose Library.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.buttons["shell-drawer-surface-shell-tab-calendar"].exists)
    XCTAssertTrue(app.buttons["shell-drawer-surface-shell-tab-inbox"].exists)
    XCTAssertTrue(app.buttons["shell-drawer-surface-shell-tab-profile"].exists)
    XCTAssertTrue(app.buttons["shell-drawer-talk"].exists)
    attachScreenshot(named: "chat-first-sidebar", app: app)
  }

  func testShellVlogControlOpensPromptCaptureDirectly() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let vlogControl = app.descendants(matching: .any)["shell-vlog-open"]
    XCTAssertTrue(
      waitForHittable(vlogControl, timeout: 3),
      "Direct Vlog control did not become available in the chat shell.\n\(app.debugDescription)"
    )
    XCTAssertGreaterThanOrEqual(vlogControl.frame.width, 44)
    XCTAssertGreaterThanOrEqual(vlogControl.frame.height, 44)

    vlogControl.tap()

    let prompt = app.descendants(matching: .any)["teleprompter-prompt"]
    XCTAssertTrue(
      prompt.waitForExistence(timeout: 3),
      "Direct Vlog control did not open the Prompt Mode capture surface.\n\(app.debugDescription)"
    )
    XCTAssertEqual(prompt.label, "What do you want to share?")
    XCTAssertTrue(app.buttons["teleprompter-content-prompt"].isSelected)
    XCTAssertTrue(app.buttons["teleprompter-header-close"].exists)
  }

  // GH-12948: "Audience" must stay on one line in the drawer surface switcher.
  func testDrawerSurfaceSwitcherLabelsStaySingleLine() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    app.buttons["Open navigation drawer"].tap()

    let profileSurface = app.buttons["shell-drawer-surface-shell-tab-profile"]
    let audienceSurface = app.buttons["shell-drawer-surface-shell-tab-audience"]
    let chatSurface = app.buttons["shell-drawer-surface-shell-tab-chat"]
    XCTAssertTrue(
      profileSurface.waitForExistence(timeout: 3),
      "Profile drawer surface did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      audienceSurface.waitForExistence(timeout: 3),
      "Audience drawer surface did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      chatSurface.waitForExistence(timeout: 3),
      "Chat drawer surface did not appear.\n\(app.debugDescription)"
    )

    // Wrapped labels stack vertically and make the offending tab much taller.
    let heights = [
      profileSurface.frame.height,
      audienceSurface.frame.height,
      chatSurface.frame.height,
    ]
    XCTAssertLessThanOrEqual(
      heights.max()! - heights.min()!,
      4,
      "Surface tab heights diverged — a label likely wrapped.\n\(app.debugDescription)"
    )
    XCTAssertEqual(audienceSurface.label, "Audience")
  }

  // JOV-3670 evidence (b): removing the bottom pill's safeAreaInset must not
  // leave a ghost reserved footprint. Assert the composer/content region
  // extends to fill the reclaimed space, and that layout stays stable across
  // chat/profile x chatEnabled(true/false) states.
  func testNoGhostFootprintAfterPillRemovalAcrossStates() {
    // chatEnabled == true (ready dashboard loaded): composer sits at the true
    // safe-area bottom, not floating above a reserved-but-empty pill gap.
    let chatApp = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }
    let composerInput = chatApp.textFields["Ask Jovie"]
    XCTAssertTrue(waitForHittable(composerInput, timeout: 3))
    let chatWindowMaxY = chatApp.windows.firstMatch.frame.maxY
    // Composer sits above the primary tab bar (~56pt) + home indicator.
    XCTAssertGreaterThan(
      composerInput.frame.maxY,
      chatWindowMaxY - 220,
      "Chat composer left an unexpected gap above the tab bar.\n\(chatApp.debugDescription)"
    )
    attachScreenshot(named: "no-ghost-footprint-chat", app: chatApp)

    chatApp.buttons["Open navigation drawer"].tap()
    let contentPlaneMarker = chatApp.buttons["Open navigation drawer"]
    let profileSurface = chatApp.buttons["shell-drawer-surface-shell-tab-profile"]
    XCTAssertTrue(
      waitForDrawerSurfaceToBeUncovered(
        profileSurface,
        contentPlaneMarker: contentPlaneMarker,
        // Hosted runners can spend more than a second on each accessibility
        // snapshot. Keep the geometry + stable-interval contract intact while
        // allowing enough time for two settled samples.
        timeout: 10
      ),
      "Profile surface stayed covered by the opening content plane.\n\(chatApp.debugDescription)"
    )
    profileSurface.tap()
    let copyURLButton = chatApp.buttons["Copy URL"]
    XCTAssertTrue(
      copyURLButton.waitForExistence(timeout: 10),
      "Shell navigation did not switch to Profile.\n\(chatApp.debugDescription)"
    )
    attachScreenshot(named: "no-ghost-footprint-profile", app: chatApp)
    endUITestSession(chatApp)

    // chatEnabled == false (needs-onboarding shell): no chat composer/pill at
    // all, and no leftover blank strip reserved at the bottom of the shell.
    let onboardingApp = launchMockApp(
      launchArgument: "-ui-testing-needs-onboarding",
      expectedElementDescription: "\"Finish Your Profile\""
    ) {
      $0.staticTexts["Finish Your Profile"]
    }
    let completionButton = onboardingApp.buttons["profile-completion-submit"]
    XCTAssertTrue(completionButton.waitForExistence(timeout: 3))
    XCTAssertFalse(
      shellControlExists(onboardingApp, identifier: "shell-talk-fab"),
      "Talk FAB should not render when chat is disabled.\n\(onboardingApp.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(onboardingApp, identifier: "shell-tab-chat"),
      "Removed pill must not render in the chatEnabled == false shell.\n\(onboardingApp.debugDescription)"
    )
    attachScreenshot(named: "no-ghost-footprint-needs-onboarding", app: onboardingApp)
  }

  func testTalkFABAppearsOnPrimaryTabBar() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let talkFAB = firstMatchingButton(
      app,
      identifiers: ["shell-talk-fab"],
      labels: ["Talk"],
      timeout: 3
    )
    XCTAssertTrue(
      talkFAB.exists,
      "Talk did not appear in the chat-first toolbar.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      shellControlExists(app, identifier: "shell-tab-bar"),
      "Talk must not require a bottom tab bar.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["chat-voice-button"].exists,
      "Composer mic must stay removed (FAB-only voice).\n\(app.debugDescription)"
    )
    XCTAssertFalse(app.staticTexts["STT"].exists)
    XCTAssertFalse(app.staticTexts["Transcription"].exists)
    attachScreenshot(named: "voice-button", app: app)
  }

  func testOfflineChatLaunchShowsCachedHistoryIntro() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-chat-offline",
      expectedElementDescription: "\"Ask Jovie (offline)\""
    ) {
      $0.textFields["Ask Jovie (offline)"]
    }

    let offlineStatusPredicate = NSPredicate(format: "label == %@", "Offline")
    XCTAssertEqual(
      app.staticTexts.matching(offlineStatusPredicate).count,
      1,
      "Offline chat should show exactly one status indicator in the shell header.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["Offline"].exists,
      "Shell header did not show the canonical offline status.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      app.staticTexts.matching(NSPredicate(format: "label == %@", "Offline")).count,
      1,
      "Offline chat launch showed more than one standalone offline status indicator.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["Offline. Drafts stay on this device and cached history remains available."].exists,
      "Offline chat empty state did not explain draft/cache behavior.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.textFields["Ask Jovie (offline)"].exists)

    app.buttons["Open navigation drawer"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["shell-drawer"].waitForExistence(timeout: 3),
      "Shell navigation did not reveal the left drawer.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["@tim"].exists,
      "Drawer account subtitle should keep the @handle while offline.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      app.staticTexts.matching(offlineStatusPredicate).count,
      1,
      "Opening the drawer must not add another Offline status indicator.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.descendants(matching: .any)["shell-drawer-account"].staticTexts["Offline"].exists,
      "Drawer account header showed a redundant offline status.\n\(app.debugDescription)"
    )
  }

  // JOV-3608: entity/skill chat tokens must render as clean label text, with
  // no raw `@kind:id[label]` / `/skill:id` wire syntax visible in the
  // transcript -- in either the assistant bubble (onDark chip tone) or the
  // user bubble (onLight chip tone). This is a text-level contract: chip
  // runs are concatenated `Text`, not separately-identifiable views, so the
  // assertion is "label text is present" + "no staticText matches the raw
  // token grammar" rather than a per-chip accessibility identifier.
  func testEntityAndSkillTokensRenderAsLabelsNotRawSyntax() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-chat-entity-fixture",
      expectedElementDescription: "\"Midnight Drive\""
    ) {
      $0.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Midnight Drive")).firstMatch
    }

    let rawTokenPredicate = NSPredicate(format: "label MATCHES %@", ".*@\\w+:.*")
    let rawSkillTokenPredicate = NSPredicate(format: "label MATCHES %@", ".*/skill:\\w+.*")

    XCTAssertEqual(
      app.staticTexts.matching(rawTokenPredicate).count,
      0,
      "Transcript rendered a raw @kind:id[...] entity token instead of a chip label.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      app.staticTexts.matching(rawSkillTokenPredicate).count,
      0,
      "Transcript rendered a raw /skill:id token instead of a chip label.\n\(app.debugDescription)"
    )

    // Assistant-bubble entity/skill labels (all four kinds + the skill token
    // from MobileChatEntityFixture.default).
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Midnight Drive")).firstMatch.exists,
      "Release entity chip label not found.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Opus")).firstMatch.exists,
      "Track entity chip label not found.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Coachella 2027")).firstMatch.exists,
      "Event entity chip label not found.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Generate album art")).firstMatch.exists,
      "Skill chip label not found.\n\(app.debugDescription)"
    )

    // User-bubble entity token (onLight tone) -- the fixture's first message
    // is a user turn mentioning @artist:art_1[Porter Robinson].
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Porter Robinson")).firstMatch.exists,
      "User-bubble artist entity chip label not found.\n\(app.debugDescription)"
    )

    attachScreenshot(named: "chat-entity-chips", app: app)
  }

  // Catalog: every in-chat display type that can live in a transcript is
  // seeded as raw wire and rendered by the shipped parser. Empty state and
  // offline placeholder stay on `-ui-testing-chat` /
  // `-ui-testing-chat-offline` (see testDrawerSwitchesBetweenChatAndProfile
  // and testOfflineChatLaunchShowsCachedHistoryIntro).
  func testAllChatComponentsRenderLabelsNotRawMarkup() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-chat-all-components",
      expectedElementDescription: "\"Ask Jovie\"",
      timeout: 10
    ) {
      $0.textFields["Ask Jovie"]
    }

    if app.buttons["whats-new-done"].waitForExistence(timeout: 1) {
      app.buttons["whats-new-done"].tap()
    }

    XCTAssertTrue(
      app.textFields["Ask Jovie"].exists,
      "Composer did not appear on the all-components fixture.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat-all-components-composer", app: app)

    var missingLabels: Set<String> = [
      "Creating merch options…",
      "Merch options ready",
      "Couldn't create merch",
      "Neon Pulse Tee",
      "Mono Mark",
      "Release day shout-out",
      "Midnight Drive",
      "Porter Robinson",
      "Opus",
      "Coachella 2027",
      "Generate album art",
      "Thinking",
    ]
    var sawToolCard = false
    var sawRetry = false
    var sawWebHandoff = false
    var snappedChips = false
    var snappedTool = false
    var snappedMerch = false
    var snappedVideo = false

    func consumeVisibleChatLabels() {
      for label in Array(missingLabels) {
        let predicate = NSPredicate(format: "label CONTAINS %@", label)
        if app.descendants(matching: .any).matching(predicate).firstMatch.exists {
          missingLabels.remove(label)
        }
      }
      if app.descendants(matching: .any)["mobile-chat-tool-card"].exists {
        sawToolCard = true
      }
      if app.buttons["Retry"].exists {
        sawRetry = true
      }
      if app.buttons["Continue on web"].exists || app.links["Continue on web"].exists {
        sawWebHandoff = true
      }
      if !snappedChips,
         !missingLabels.isSuperset(of: [
           "Midnight Drive", "Porter Robinson", "Opus", "Coachella 2027", "Generate album art",
         ])
      {
        attachScreenshot(named: "chat-all-components-entity-skill-chips", app: app)
        snappedChips = true
      }
      if !snappedTool, sawToolCard {
        attachScreenshot(named: "chat-all-components-tool-card", app: app)
        snappedTool = true
      }
      if !snappedMerch,
         !missingLabels.contains("Neon Pulse Tee") || !missingLabels.contains("Mono Mark")
      {
        attachScreenshot(named: "chat-all-components-merch", app: app)
        snappedMerch = true
      }
      if !snappedVideo, !missingLabels.contains("Release day shout-out") {
        attachScreenshot(named: "chat-all-components-video", app: app)
        snappedVideo = true
      }
      assertVisibleChatHasNoRawMarkup(in: app)
    }

    let chat = app.scrollViews["mobile-chat"]
    consumeVisibleChatLabels()
    for _ in 0..<16 {
      if missingLabels.isEmpty, sawToolCard, sawRetry, sawWebHandoff {
        break
      }
      if chat.exists { chat.swipeDown() } else { app.swipeDown() }
      consumeVisibleChatLabels()
    }

    XCTAssertTrue(
      missingLabels.isEmpty,
      "Missing in-chat labels: \(missingLabels.sorted().joined(separator: ", ")).\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      sawToolCard,
      "Tool card accessibility identifier missing.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      sawRetry,
      "Retry control did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      sawWebHandoff,
      "Web handoff link did not appear.\n\(app.debugDescription)"
    )

    let midnightDrive = app.descendants(matching: .any).matching(
      NSPredicate(format: "label CONTAINS %@", "Midnight Drive")
    ).firstMatch
    for _ in 0..<20 {
      if midnightDrive.isHittable { break }
      app.swipeDown()
    }
    XCTAssertTrue(
      midnightDrive.waitForExistence(timeout: 2),
      "Could not bring entity chips on-screen for the device screenshot.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat-all-components-entity-skill-chips-visible", app: app)

    let plusButton = app.buttons["Open workflow sheet"]
    XCTAssertTrue(
      waitForHittable(plusButton, timeout: 3),
      "Open workflow sheet was not hittable.\n\(app.debugDescription)"
    )
    plusButton.tap()
    XCTAssertTrue(
      app.buttons["Make merch"].waitForExistence(timeout: 3),
      "Workflow sheet did not show Make merch.\n\(app.debugDescription)"
    )

    attachScreenshot(named: "chat-all-components-workflow-sheet", app: app)
    attachScreenshot(named: "chat-all-components", app: app)
  }

  func testAllChatComponentsRuntimePerformance() throws {
    guard testEnvironmentValue("JOVIE_IOS_RUNTIME_PERFORMANCE") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_RUNTIME_PERFORMANCE=1 to run all-components hitch evidence.")
    }

    let timeoutSeconds =
      Double(testEnvironmentValue("JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS") ?? "") ?? 3
    let app = launchMockApp(
      launchArgument: "-ui-testing-chat-all-components",
      expectedElementDescription: "\"Ask Jovie\"",
      timeout: 10
    ) {
      $0.textFields["Ask Jovie"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["mobile-chat"].firstMatch.waitForExistence(
        timeout: timeoutSeconds
      ),
      "All-components chat did not appear before hitch measurement.\n\(app.debugDescription)"
    )

    measure(metrics: shellRuntimeMetrics(for: app)) {
      // Swipe the app, not `mobile-chat`: that identifier is on the chat
      // ZStack and also matches descendant rows, so XCUI cannot pick one.
      app.swipeUp()
      app.swipeDown()
      XCTAssertTrue(
        app.textFields["Ask Jovie"].waitForExistence(timeout: timeoutSeconds),
        "Composer disappeared during all-components scroll measurement.\n\(app.debugDescription)"
      )
    }
  }

  // JOV-3635: horizontal page-swipes between tabs are banned. Profile is
  // drawer-only — open the drawer, pick Profile, then return via Chat tab.
  func testSwipeNavigatesBetweenProfileAndChat() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    // Full-width swipe must NOT switch tabs (gesture ownership: edges only).
    app.swipeRight()
    XCTAssertTrue(
      app.textFields["Ask Jovie"].waitForExistence(timeout: 2),
      "Horizontal swipe incorrectly left Chat.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.buttons["Copy URL"].exists,
      "Horizontal swipe must not open Profile (drawer-only surface).\n\(app.debugDescription)"
    )

    app.buttons["Open navigation drawer"].tap()
    let profileSurface = app.buttons["shell-drawer-surface-shell-tab-profile"]
    XCTAssertTrue(
      profileSurface.waitForExistence(timeout: 3),
      "Drawer Profile surface missing.\n\(app.debugDescription)"
    )
    profileSurface.tap()
    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Selecting Profile from the drawer did not reveal Profile.\n\(app.debugDescription)"
    )

    let chatTab = firstMatchingButton(
      app,
      identifiers: ["shell-tab-chat"],
      labels: ["Chat"],
      timeout: 3
    )
    XCTAssertTrue(chatTab.exists, "Chat tab missing after Profile.\n\(app.debugDescription)")
    chatTab.tap()
    XCTAssertTrue(
      app.textFields["Ask Jovie"].waitForExistence(timeout: 3),
      "Chat tab did not return to Chat.\n\(app.debugDescription)"
    )
  }

  func testChatComposerWorkflowSheetShowsWorkflowGrid() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let plusButton = app.buttons["Open workflow sheet"]
    XCTAssertTrue(
      waitForHittable(plusButton, timeout: 3),
      "Chat composer plus button did not become hittable.\n\(app.debugDescription)"
    )

    plusButton.tap()

    XCTAssertTrue(
      app.buttons["Make merch"].waitForExistence(timeout: 3),
      "Workflow sheet did not appear.\n\(app.debugDescription)"
    )
    for title in [
      "Make merch",
      "Smart link",
      "Camera",
      "Photo/file",
      "Release campaign",
      "Lyric video",
    ] {
      XCTAssertTrue(
        app.buttons[title].waitForExistence(timeout: 2),
        "Workflow action \(title) did not appear.\n\(app.debugDescription)"
      )
    }

    app.buttons["Make merch"].tap()

    let input = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(input, timeout: 3),
      "Chat composer input did not become hittable after workflow selection.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      input.value as? String,
      "Make merch for my latest release.",
      "Workflow selection did not prefill the composer draft.\n\(app.debugDescription)"
    )
  }

  func testChatComposerSendSlotDoesNotShiftBarHeight() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let composer = app.descendants(matching: .any)["chat-composer"]
    XCTAssertTrue(
      composer.waitForExistence(timeout: 3),
      "Chat composer identifier missing.\n\(app.debugDescription)"
    )
    let heightBefore = composer.frame.height
    XCTAssertEqual(
      heightBefore,
      76,
      accuracy: 2,
      "Empty composer left the reserved 76pt bar.\n\(app.debugDescription)"
    )
    XCTAssertFalse(
      app.descendants(matching: .any)["chat-composer-send"].exists,
      "Send control must stay out of the tree while the reserved slot is empty.\n\(app.debugDescription)"
    )

    let input = app.textFields["Ask Jovie"]
    XCTAssertTrue(waitForHittable(input, timeout: 3))
    input.tap()
    input.typeText("Draft a follow-up")

    XCTAssertEqual(
      composer.frame.height,
      heightBefore,
      accuracy: 1,
      "Typing into the composer shifted the reserved bar height.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.descendants(matching: .any)["chat-composer-send"].waitForExistence(timeout: 2),
      "Send control did not appear in the reserved trailing slot.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat-composer-send-slot", app: app)
  }

  func testChatComposerSlashPaletteOpensAboveBar() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let plus = app.buttons["chat-composer-plus"]
    let input = app.textFields["Ask Jovie"]
    XCTAssertTrue(waitForHittable(input, timeout: 3))
    XCTAssertTrue(plus.exists)

    input.tap()
    _ = app.keyboards.firstMatch.waitForExistence(timeout: 3)
    let plusMinY = plus.frame.minY
    input.typeText("/")

    let palette = app.descendants(matching: .any)["composer-slash-palette"]
    let merchRow = app.descendants(matching: .any)["composer-slash-workflow-makeMerch"]
    XCTAssertTrue(
      palette.waitForExistence(timeout: 5) || merchRow.waitForExistence(timeout: 2),
      "Typing / did not open the slash palette.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      plus.frame.minY,
      plusMinY,
      accuracy: 1,
      "Slash palette shifted the composer plus control instead of overlaying above the bar.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "chat-composer-slash-palette", app: app)
  }

  func testChatComposerPreservesDraftAcrossShellNavigation() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let draft = "Draft the launch follow-up"
    let input = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(input, timeout: 3),
      "Chat composer input did not become hittable.\n\(app.debugDescription)"
    )

    XCTAssertEqual(app.textFields.count, 1)
    input.tap()
    input.typeText(draft)
    XCTAssertEqual(input.value as? String, draft)

    app.buttons["Open navigation drawer"].tap()
    let contentPlaneMarker = app.buttons["Open navigation drawer"]
    let profileSurface = app.buttons["shell-drawer-surface-shell-tab-profile"]
    XCTAssertTrue(
      waitForDrawerSurfaceToBeUncovered(
        profileSurface,
        contentPlaneMarker: contentPlaneMarker,
        timeout: 6
      ),
      "Profile surface stayed covered by the opening content plane.\n\(app.debugDescription)"
    )
    profileSurface.tap()
    let copyURLButton = app.buttons["Copy URL"]
    XCTAssertTrue(
      copyURLButton.waitForExistence(timeout: 10),
      "Shell navigation did not switch to Profile.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      waitForHittable(contentPlaneMarker, timeout: 6),
      "Drawer did not close after switching to Profile.\n\(app.debugDescription)"
    )

    // Return via the tab bar because chat stays mounted as a ZStack underlay.
    let chatTab = firstMatchingButton(
      app,
      identifiers: ["shell-tab-chat"],
      labels: ["Chat"],
      timeout: 3
    )
    XCTAssertTrue(chatTab.exists, "Chat tab missing after Profile.\n\(app.debugDescription)")
    chatTab.tap()
    let restoredInput = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(restoredInput, timeout: 10),
      "Shell navigation did not return to the chat composer.\n\(app.debugDescription)"
    )
    XCTAssertEqual(app.textFields.count, 1)
    XCTAssertEqual(
      restoredInput.value as? String,
      draft,
      "Chat draft was lost or duplicated after shell navigation.\n\(app.debugDescription)"
    )
  }

  func testShellNavigationRuntimePerformance() throws {
    guard testEnvironmentValue("JOVIE_IOS_RUNTIME_PERFORMANCE") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_RUNTIME_PERFORMANCE=1 to run shell runtime performance evidence.")
    }

    let timeoutSeconds =
      Double(testEnvironmentValue("JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS") ?? "") ?? 3
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let drawerOpenButton = app.buttons["Open navigation drawer"]
    let profileSurface = app.buttons["shell-drawer-surface-shell-tab-profile"]
    let chatSurface = app.buttons["shell-drawer-surface-shell-tab-chat"]
    let profileReady = app.buttons["Copy URL"]
    let chatReady = app.textFields["Ask Jovie"]

    XCTAssertTrue(
      drawerOpenButton.waitForExistence(timeout: timeoutSeconds),
      "Drawer open control did not appear before runtime measurement.\n\(app.debugDescription)"
    )

    measure(metrics: shellRuntimeMetrics(for: app)) {
      drawerOpenButton.tap()
      XCTAssertTrue(
        waitForDrawerSurfaceToBeUncovered(
          profileSurface,
          contentPlaneMarker: drawerOpenButton,
          timeout: timeoutSeconds
        ),
        "Drawer surface switcher stayed covered by the content plane.\n\(app.debugDescription)"
      )
      profileSurface.tap()
      XCTAssertTrue(
        waitForHittable(profileReady, timeout: timeoutSeconds),
        "Measured transition to Profile did not finish within \(timeoutSeconds) seconds.\n\(app.debugDescription)"
      )

      drawerOpenButton.tap()
      XCTAssertTrue(
        waitForDrawerSurfaceToBeUncovered(
          chatSurface,
          contentPlaneMarker: drawerOpenButton,
          timeout: timeoutSeconds
        ),
        "Drawer chat surface stayed covered by the content plane.\n\(app.debugDescription)"
      )
      chatSurface.tap()
      XCTAssertTrue(
        waitForHittable(chatReady, timeout: timeoutSeconds),
        "Measured transition to Chat did not finish within \(timeoutSeconds) seconds.\n\(app.debugDescription)"
      )
    }
  }

  func testAudienceHighlightsLaunchShowsHeroAndStatTiles() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-audience",
      expectedElementDescription: "\"Profile views\""
    ) {
      $0.staticTexts["Profile views"]
    }

    XCTAssertTrue(app.staticTexts["Audience"].exists)
    XCTAssertTrue(app.staticTexts["1,284"].exists)
    XCTAssertTrue(app.staticTexts["+18% vs last week"].exists)
    XCTAssertTrue(app.staticTexts["Unique fans"].exists)
    XCTAssertTrue(app.staticTexts["Subscribed fans"].exists)
    XCTAssertTrue(app.staticTexts["Link clicks"].exists)
    XCTAssertTrue(app.staticTexts["Listen clicks"].exists)
    XCTAssertTrue(app.buttons["Ask Jovie about your audience"].exists)
  }

  func testAudienceDrawerSurfaceOpensHighlights() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    app.buttons["Open navigation drawer"].tap()
    let audienceSurface = app.buttons["Audience"]
    XCTAssertTrue(
      audienceSurface.waitForExistence(timeout: 3),
      "Audience drawer surface did not appear.\n\(app.debugDescription)"
    )

    audienceSurface.tap()
    XCTAssertTrue(
      app.staticTexts["Profile views"].waitForExistence(timeout: 3),
      "Audience drawer surface did not open highlights.\n\(app.debugDescription)"
    )
  }

  func testAudienceAskJovieCTAOpensScopedChat() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-audience",
      expectedElementDescription: "\"Ask Jovie about your audience\""
    ) {
      $0.buttons["Ask Jovie about your audience"]
    }

    app.buttons["Ask Jovie about your audience"].tap()

    let chatInput = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(chatInput, timeout: 3),
      "Audience CTA did not open chat.\n\(app.debugDescription)"
    )
    XCTAssertEqual(
      chatInput.value as? String,
      "Ask Jovie about my audience trends and who is engaging most.",
      "Audience CTA did not scope chat to the audience prompt.\n\(app.debugDescription)"
    )
  }

  func testLibraryLaunchShowsPopulatedAssets() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-library",
      expectedElementDescription: "\"library-surface\""
    ) {
      $0.descendants(matching: .any)["library-surface"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["library-surface"].exists,
      "Library launch did not expose library-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.descendants(matching: .any)["library-asset-lib-release-midnight"].exists,
      "Populated library fixture did not render at least one asset card.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "library-populated", app: app)
  }

  func testLibraryEmptyLaunchShowsEmptyFilterCopy() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-library-empty",
      expectedElementDescription: "\"No assets in this filter.\""
    ) {
      $0.staticTexts["No assets in this filter."]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["library-surface"].exists,
      "Empty library launch did not expose library-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.staticTexts["No assets in this filter."].exists)
    XCTAssertFalse(
      app.descendants(matching: .any)["library-asset-lib-release-midnight"].exists,
      "Empty library fixture unexpectedly rendered a preview asset card.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "library-empty", app: app)
  }

  func testInboxLaunchShowsPreviewActions() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-inbox",
      expectedElementDescription: "\"inbox-surface\""
    ) {
      $0.descendants(matching: .any)["inbox-surface"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["inbox-surface"].exists,
      "Inbox launch did not expose inbox-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["1 pending action"].exists,
      "Preview inbox did not show the pending action count.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.descendants(matching: .any)["inbox-item-action-1"].exists,
      "Preview inbox did not render the cached action card.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.buttons["inbox-ask-jovie"].exists,
      "Preview inbox did not expose inbox-ask-jovie.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "inbox-preview", app: app)
  }

  func testInboxOfflineLaunchShowsCachedActionsCopy() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-inbox-offline",
      expectedElementDescription: "\"Offline — showing cached actions when available.\""
    ) {
      $0.staticTexts["Offline — showing cached actions when available."]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["inbox-surface"].exists,
      "Offline inbox launch did not expose inbox-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.staticTexts["Offline — showing cached actions when available."].exists)
    attachScreenshot(named: "inbox-offline", app: app)
  }

  func testInboxLoadingLaunchReservesAskJovieCTA() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-inbox-loading",
      expectedElementDescription: "\"inbox-ask-jovie\""
    ) {
      $0.buttons["inbox-ask-jovie"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["inbox-surface"].exists,
      "Loading inbox launch did not expose inbox-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.buttons["inbox-ask-jovie"].exists,
      "Loading inbox must reserve the Ask Jovie CTA so loaded content cannot shift it.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "inbox-loading", app: app)
  }

  func testCalendarLaunchShowsSurface() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-calendar",
      expectedElementDescription: "\"calendar-surface\""
    ) {
      $0.descendants(matching: .any)["calendar-surface"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["calendar-surface"].exists,
      "Calendar launch did not expose calendar-surface.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "calendar-preview", app: app)
  }

  func testCalendarOfflineLaunchShowsCachedCalendarCopy() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-calendar-offline",
      expectedElementDescription: "\"Offline — showing cached calendar when available.\""
    ) {
      $0.staticTexts["Offline — showing cached calendar when available."]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["calendar-surface"].exists,
      "Offline calendar launch did not expose calendar-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.staticTexts["Offline — showing cached calendar when available."].exists)
    attachScreenshot(named: "calendar-offline", app: app)
  }

  func testCalendarLoadingLaunchReservesAskJovieCTA() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-calendar-loading",
      expectedElementDescription: "\"calendar-ask-jovie\""
    ) {
      $0.buttons["calendar-ask-jovie"]
    }

    XCTAssertTrue(
      app.descendants(matching: .any)["calendar-surface"].exists,
      "Loading calendar launch did not expose calendar-surface.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.buttons["calendar-ask-jovie"].exists,
      "Loading calendar must reserve the Ask Jovie CTA so loaded content cannot shift it.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "calendar-loading", app: app)
  }

  func testShellDrawerAndSettingsNavigation() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    app.buttons["Open navigation drawer"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["shell-drawer"].waitForExistence(timeout: 3),
      "Shell navigation did not reveal the left drawer.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["Start a conversation to see recent conversations here."].exists,
      "Shell drawer did not show the empty recent conversations state.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.buttons["New chat"].exists)
    XCTAssertTrue(app.buttons["Settings"].exists)
    XCTAssertFalse(
      app.buttons["Close navigation drawer"].exists,
      "Drawer IA (gate 3A) removes the X close button; close is tap-content-card or edge-drag only.\n\(app.debugDescription)"
    )

    // Gate 3A: no close button. Closing happens by tapping the elevated
    // content card's exposed sliver (the transparent scrim covering it).
    let contentSliver = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.5))
    contentSliver.tap()
    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Tapping the exposed content card did not close the drawer.\n\(app.debugDescription)"
    )

    app.buttons["Open navigation drawer"].tap()
    app.buttons["Settings"].tap()
    XCTAssertTrue(
      app.staticTexts["Settings"].waitForExistence(timeout: 3),
      "Shell navigation did not open settings from the drawer.\n\(app.debugDescription)"
    )
  }

  // JOV-3672: while the drawer is open, the elevated content card must be
  // non-interactive so the drawer is the sole active switcher — a tap on the
  // (visually still-present but inert) gear icon must not open Settings.
  func testDrawerOpenMakesContentCardInert() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    app.buttons["Open navigation drawer"].tap()
    XCTAssertTrue(
      app.descendants(matching: .any)["shell-drawer"].waitForExistence(timeout: 3),
      "Shell navigation did not reveal the left drawer.\n\(app.debugDescription)"
    )

    XCTAssertFalse(
      app.buttons["Open Settings"].isHittable,
      "Content card's Settings gear stayed hittable while the drawer was open — content must be inert.\n\(app.debugDescription)"
    )

    // Drawer's own surface switcher remains the sole active switcher.
    XCTAssertTrue(app.buttons["shell-drawer-surface-shell-tab-profile"].isHittable)
  }

  // JOV-3672 (eng F11): an edge-drag starting while the composer has focus
  // must not open the drawer — it would fight text selection/cursor placement.
  func testEdgeDragDoesNotOpenDrawerWhileComposerFocused() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    let input = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(input, timeout: 3),
      "Chat composer input did not become hittable.\n\(app.debugDescription)"
    )
    input.tap()

    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.5))
    let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: end)

    XCTAssertFalse(
      app.descendants(matching: .any)["shell-drawer"].isHittable,
      "Edge-drag opened the drawer while the composer was focused.\n\(app.debugDescription)"
    )
  }

  func testVenueModeLaunchShowsFullscreenQR() {
    let app = launchMockApp(launchArgument: "-ui-testing-venue-mode", expectedElementDescription: "\"Done\"") {
      $0.buttons["Done"]
    }

    XCTAssertTrue(app.images["Fullscreen Profile QR Code"].exists || app.buttons["Done"].exists)
    attachScreenshot(named: "fullscreen-qr", app: app)
  }

  func testCopyURLButtonShowsCopiedState() throws {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["dashboard-copy-url-button"]
    }

    let copyURLButton = app.buttons["dashboard-copy-url-button"]
    XCTAssertTrue(
      copyURLButton.waitForExistence(timeout: 3),
      "Copy URL button did not appear.\n\(app.debugDescription)"
    )

    copyURLButton.tap()

    let copiedState = NSPredicate(format: "label == %@ OR value == %@", "Copied", "Copied")
    let copiedExpectation = expectation(for: copiedState, evaluatedWith: copyURLButton)
    XCTAssertEqual(
      XCTWaiter.wait(for: [copiedExpectation], timeout: 2),
      .completed,
      "Copy URL button did not show copied state.\n\(app.debugDescription)"
    )
  }

  func testLiveAuthViewRenders() throws {
    guard testEnvironmentValue("JOVIE_IOS_LIVE_AUTH_UI") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_AUTH_UI=1 to run the live Better Auth UI flow.")
    }

    let app = makeLiveAuthApp(launchArgument: "-ui-testing-live-auth")
    app.launch()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 10),
      "Browser auth entry button did not appear.\n\(app.debugDescription)"
    )
  }

  func testLiveDeviceChatTalksBack() throws {
    guard testEnvironmentValue("JOVIE_IOS_LIVE_CHAT") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_CHAT=1 to send a live chat turn on device.")
    }

    let callbackURL = try requiredEnvironmentValue("JOVIE_IOS_AUTH_CALLBACK_URL")
    let codeVerifier = try requiredEnvironmentValue("JOVIE_IOS_PENDING_CODE_VERIFIER")
    let apiBaseURL =
      testEnvironmentValue("JOVIE_IOS_API_BASE_URL") ??
      testEnvironmentValue("API_BASE_URL") ??
      "http://192.168.86.53:3100"
    let webBaseURL =
      testEnvironmentValue("JOVIE_IOS_WEB_BASE_URL") ??
      testEnvironmentValue("WEB_BASE_URL") ??
      apiBaseURL
    let prompt =
      testEnvironmentValue("JOVIE_IOS_LIVE_CHAT_PROMPT") ??
      "What should I work on next?"

    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-live-auth")
    app.launchArguments.append("-ui-testing-allow-exit")
    app.launchArguments.append("-ui-testing-open-auth-callback")
    app.launchArguments.append(callbackURL)
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    app.launchEnvironment["WEB_BASE_URL"] = webBaseURL
    app.launchEnvironment["JOVIE_IOS_PENDING_CODE_VERIFIER"] = codeVerifier
    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    app.launch()
    dismissWhatsNewIfNeeded(app)

    if app.staticTexts["Couldn't finish sign-in. Try again."].waitForExistence(timeout: 3) {
      attachScreenshot(named: "live-chat-auth-error", app: app)
      XCTFail("Live auth callback failed before chat.\n\(app.debugDescription)")
      return
    }

    if app.buttons["Continue in Browser"].waitForExistence(timeout: 2) {
      attachScreenshot(named: "live-chat-signed-out", app: app)
      XCTFail("Live auth stayed signed out.\n\(app.debugDescription)")
      return
    }

    let composer = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      composer.waitForExistence(timeout: 45),
      "Live auth did not reach the chat composer.\n\(app.debugDescription)"
    )
    dismissWhatsNewIfNeeded(app)
    XCTAssertTrue(
      waitForHittable(composer, timeout: 10),
      "Chat composer was not hittable after live auth.\n\(app.debugDescription)"
    )

    composer.tap()
    composer.typeText(prompt)

    let send = app.buttons["Send"]
    XCTAssertTrue(
      send.waitForExistence(timeout: 5),
      "Send button did not appear after typing.\n\(app.debugDescription)"
    )
    send.tap()

    XCTAssertTrue(
      app.staticTexts[prompt].waitForExistence(timeout: 10),
      "Typed chat turn did not appear in the transcript.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "live-chat-sent", app: app)

    let errorDeadline = Date().addingTimeInterval(90)
    var sawAssistantReply = false
    while Date() < errorDeadline {
      if app.buttons["Retry"].exists {
        attachScreenshot(named: "live-chat-retry", app: app)
        XCTFail("Chat turn failed and showed Retry.\n\(app.debugDescription)")
        return
      }

      let errorMatch = app.staticTexts.matching(
        NSPredicate(
          format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@",
          "Unauthorized",
          "Complete onboarding",
          "couldn't",
          "chat limit"
        )
      ).firstMatch
      if errorMatch.exists {
        attachScreenshot(named: "live-chat-error", app: app)
        XCTFail("Chat surfaced an error: \(errorMatch.label)\n\(app.debugDescription)")
        return
      }

      if liveChatAssistantReplyExists(in: app, prompt: prompt) {
        sawAssistantReply = true
        break
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }

    attachScreenshot(named: "live-chat-reply", app: app)
    XCTAssertTrue(
      sawAssistantReply,
      "Chat did not return a non-error assistant reply.\n\(app.debugDescription)"
    )
    XCTAssertFalse(app.buttons["Retry"].exists, "Chat reply still showed Retry.")
  }

  func testRealBrowserAuthProviderCompleteReachesAuthenticatedShell() throws {
    guard testEnvironmentValue("JOVIE_IOS_REAL_BROWSER_AUTH") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_REAL_BROWSER_AUTH=1 to run the HTTPS browser auth flow.")
    }

    let app = try makeRealBrowserAuthApp()
    app.launch()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 10),
      "Browser auth entry button did not appear.\n\(app.debugDescription)"
    )

    app.buttons["Continue in Browser"].tap()
    acceptSystemAuthPromptIfNeeded()

    let copyURLButton = app.buttons["Copy URL"]
    let continueOnWebButton = app.buttons["Continue on Web"]
    let authError = app.staticTexts["Couldn't finish sign-in. Try again."]
    let deadline = Date().addingTimeInterval(60)

    while Date() < deadline {
      acceptSystemAuthPromptIfNeeded()

      if copyURLButton.exists || continueOnWebButton.exists {
        attachScreenshot(named: "real-browser-auth", app: app)
        return
      }

      if authError.exists {
        XCTFail("Real browser auth rendered the generic sign-in error.\n\(app.debugDescription)")
        return
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }

    XCTFail("Real browser auth did not reach dashboard or onboarding.\n\(app.debugDescription)")
  }

  func testAuthCallbackDeepLinkCompletesHarness() throws {
    let callbackURL = "ie.jov.jovie://auth/complete?code=test_code&state=state_123"
    let app = launchMockApp(
      launchArgument: "-ui-testing-auth-callback",
      additionalLaunchArguments: ["-ui-testing-open-auth-callback", callbackURL],
      expectedElementDescription: "\"Copy URL\""
    ) {
      $0.buttons["Copy URL"]
    }

    app.terminate()
    app.launch()

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 10),
      "Duplicate auth callback should leave the authenticated shell stable.\n\(app.debugDescription)"
    )
  }

  /// Waits for `element` to appear, resending `resendURL` once if the shell
  /// hasn't appeared after a shorter checkpoint.
  ///
  /// `XCUIApplication.open(_:)` routes the deep link through Springboard,
  /// which can silently drop delivery to an already-foregrounded app under
  /// CI load (the "Open in Jovie" confirmation prompt races against a fixed
  /// `waitForExistence` window in `acceptSystemOpenPromptIfNeeded`, and when
  /// no prompt appears -- the common case for an app that's already frontmost
  /// -- there's no independent signal that delivery actually succeeded). A
  /// single resend after a short checkpoint absorbs that race without
  /// masking a genuine app-side regression, since the full timeout budget
  /// only elapses if the resend also fails to land.
  private func waitForShellWithResend(
    _ element: XCUIElement,
    resendURL rawURL: String,
    targetApp app: XCUIApplication,
    failureMessage: String,
    checkpoint: TimeInterval = 20,
    totalTimeout: TimeInterval = 60,
    file: StaticString = #filePath,
    line: UInt = #line
  ) throws {
    if element.waitForExistence(timeout: checkpoint) {
      return
    }

    try openAuthCallbackURL(rawURL, targetApp: app)

    XCTAssertTrue(
      element.waitForExistence(timeout: totalTimeout - checkpoint),
      "\(failureMessage)\n\(app.debugDescription)",
      file: file,
      line: line
    )
  }

  func testAuthCallbackProviderErrorShowsAuthError() throws {
    let app = launchMockApp(
      launchArgument: "-ui-testing-auth-callback",
      expectedElementDescription: "\"Continue in Browser\""
    ) {
      $0.buttons["Continue in Browser"]
    }

    try openAuthCallbackURL(
      "ie.jov.jovie://auth/complete?error=access_denied&state=state_123&iss=https%3A%2F%2Fjov.ie%2Fapi%2Fauth",
      targetApp: app
    )

    XCTAssertTrue(
      app.staticTexts["Sign-in was cancelled. Sign in again when you're ready."]
        .waitForExistence(timeout: 10),
      "Provider error callback did not render the auth error.\n\(app.debugDescription)"
    )
    let retryButton = app.buttons["Sign In Again"]
    XCTAssertTrue(
      retryButton.exists && retryButton.isEnabled && retryButton.isHittable,
      "Provider error callback did not expose the retry action.\n\(app.debugDescription)"
    )
    attachScreenshot(named: "auth-cancel-recovery", app: app)
  }

  private func dismissWhatsNewIfNeeded(_ app: XCUIApplication) {
    let done = app.buttons["whats-new-done"]
    if done.waitForExistence(timeout: 3), done.isHittable {
      done.tap()
    }
  }

  private func liveChatAssistantReplyExists(in app: XCUIApplication, prompt: String) -> Bool {
    let thinking = app.staticTexts["Thinking"]
    if thinking.exists {
      return false
    }

    let texts = app.staticTexts.allElementsBoundByIndex
    for element in texts {
      guard element.exists else { continue }
      let label = element.label.trimmingCharacters(in: .whitespacesAndNewlines)
      if label.isEmpty || label == prompt {
        continue
      }
      if [
        "Ask Jovie",
        "Ask Jovie about your profile, releases, and next moves.",
        "Send",
        "Chat",
        "Library",
        "Inbox",
        "Calendar",
        "Done",
        "Thinking",
      ].contains(label) {
        continue
      }
      if label.hasPrefix("Skill:") {
        continue
      }
      if label.count >= 8 {
        return true
      }
    }

    return false
  }

  private func makeLiveAuthApp(launchArgument: String) -> XCUIApplication {
    let apiBaseURL =
      testEnvironmentValue("JOVIE_IOS_API_BASE_URL") ??
      testEnvironmentValue("API_BASE_URL") ??
      "http://localhost:3003"
    let app = XCUIApplication()
    app.launchArguments.append(launchArgument)
    app.launchArguments.append("-ui-testing-allow-exit")
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    return app
  }

  private func makeRealBrowserAuthApp() throws -> XCUIApplication {
    let apiBaseURL = try requiredHTTPSURL("API_BASE_URL")
    let webBaseURL = try requiredHTTPSURL("WEB_BASE_URL")

    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-real-browser-auth")
    app.launchArguments.append("-ui-testing-allow-exit")
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    app.launchEnvironment["WEB_BASE_URL"] = webBaseURL
    app.launchEnvironment["JOVIE_IOS_REAL_BROWSER_AUTH"] = "1"
    app.launchEnvironment["JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA"] =
      testEnvironmentValue("JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA") ?? "creator-ready"
    if let token = testEnvironmentValue("JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN"),
       !token.isEmpty
    {
      app.launchEnvironment["JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN"] = token
    }

    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    return app
  }

  private func requiredEnvironmentValue(_ key: String) throws -> String {
    let value = testEnvironmentValue(key) ?? ""
    guard !value.isEmpty else {
      throw XCTSkip("Missing \(key) or TEST_RUNNER_\(key) for live auth UI testing.")
    }

    return value
  }

  private func requiredHTTPSURL(_ key: String) throws -> String {
    let value = testEnvironmentValue(key) ?? ""
    guard let url = URL(string: value),
          url.scheme?.lowercased() == "https",
          url.host?.isEmpty == false
    else {
      throw XCTSkip("Missing HTTPS \(key) for real browser auth testing.")
    }

    return value
  }

  private func testEnvironmentValue(_ key: String) -> String? {
    let environment = ProcessInfo.processInfo.environment

    if let value = environment[key], !value.isEmpty {
      return value
    }

    if let value = environment["TEST_RUNNER_\(key)"], !value.isEmpty {
      return value
    }

    guard
      let contents = try? String(
        contentsOfFile: "/tmp/jovie-ios-real-browser-auth.env",
        encoding: .utf8
      )
    else {
      return nil
    }

    for line in contents.split(separator: "\n") {
      let parts = line.split(separator: "=", maxSplits: 1).map(String.init)
      guard parts.count == 2, parts[0] == key || parts[0] == "TEST_RUNNER_\(key)" else {
        continue
      }
      return parts[1]
    }

    return nil
  }

  private func launchMockApp(
    launchArgument: String,
    additionalLaunchArguments: [String] = [],
    expectedElementDescription: String,
    timeout: TimeInterval = 5,
    file: StaticString = #filePath,
    line: UInt = #line,
    element: (XCUIApplication) -> XCUIElement
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments.append(launchArgument)
    app.launchArguments.append(contentsOf: additionalLaunchArguments)
    app.launchArguments.append("-ui-testing-allow-exit")
    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    for attempt in 1...2 {
      app.launch()
      if element(app).waitForExistence(timeout: timeout) {
        return app
      }

      guard attempt == 1 else { break }
      app.terminate()
    }

    XCTFail(
      "App did not reach expected element \(expectedElementDescription).\n\(app.debugDescription)",
      file: file,
      line: line
    )
    return app
  }

  private func shellRuntimeMetrics(for app: XCUIApplication) -> [any XCTMetric] {
    var metrics: [any XCTMetric] = [
      XCTClockMetric(),
      XCTCPUMetric(application: app),
      XCTMemoryMetric(application: app),
    ]

    if #available(iOS 26.0, *) {
      metrics.append(XCTHitchMetric(application: app))
    }

    return metrics
  }

  private func assertVisibleChatHasNoRawMarkup(
    in app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let rawPredicates = [
      NSPredicate(format: "label MATCHES %@", ".*@\\w+:.*"),
      NSPredicate(format: "label MATCHES %@", ".*/skill:\\w+.*"),
      NSPredicate(format: "label CONTAINS %@", "<tool_call>"),
    ]

    for predicate in rawPredicates {
      XCTAssertEqual(
        app.descendants(matching: .any).matching(predicate).count,
        0,
        "Transcript showed raw chat markup.\n\(app.debugDescription)",
        file: file,
        line: line
      )
    }
  }

  private func waitForHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)

    while Date() < deadline {
      if element.exists && element.isHittable {
        return true
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }

    return element.exists && element.isHittable
  }

  /// SwiftUI reports recessed drawer controls hittable before the animated
  /// content plane and delayed row reveal have settled. Wait on the actual
  /// frames and require a short stable interval so XCUITest cannot synthesize
  /// a tap into either transition.
  private func waitForDrawerSurfaceToBeUncovered(
    _ surface: XCUIElement,
    contentPlaneMarker: XCUIElement,
    timeout: TimeInterval
  ) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    let stableInterval: TimeInterval = 0.1
    var uncoveredSince: Date?

    while Date() < deadline {
      if surface.exists,
         surface.isHittable,
         contentPlaneMarker.exists,
         contentPlaneMarker.frame.minX >= surface.frame.maxX
      {
        let now = Date()
        if let uncoveredSince, now.timeIntervalSince(uncoveredSince) >= stableInterval {
          return true
        }
        uncoveredSince = uncoveredSince ?? now
      } else {
        uncoveredSince = nil
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    }

    return false
  }

  /// Resolve a primary tab bar / Talk FAB control by accessibility identifier.
  /// SwiftUI groups these as `Other` (not `Button`) when
  /// `accessibilityElement(children: .ignore)` is applied on tab buttons.
  private func firstMatchingButton(
    _ app: XCUIApplication,
    identifiers: [String],
    labels: [String],
    timeout: TimeInterval = 0
  ) -> XCUIElement {
    let deadline = Date().addingTimeInterval(max(0, timeout))
    repeat {
      for identifier in identifiers {
        let byID = app.descendants(matching: .any)[identifier]
        if byID.exists {
          return byID
        }
      }
      // When the parent HStack ID leaks, every primary tab shares
      // identifier "shell-tab-bar" and only the accessibility label differs.
      for label in labels {
        let leaked = app.buttons
          .matching(identifier: "shell-tab-bar")
          .matching(NSPredicate(format: "label == %@", label))
          .firstMatch
        if leaked.exists {
          return leaked
        }
        let byLabel = app.descendants(matching: .any)
          .matching(NSPredicate(format: "label == %@", label))
          .matching(
            NSPredicate(
              format: "identifier BEGINSWITH 'shell-tab-' OR identifier == 'shell-talk-fab'"
            )
          )
          .firstMatch
        if byLabel.exists {
          return byLabel
        }
      }
      if Date() >= deadline {
        break
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    } while Date() < deadline

    // Prefer the first identifier so callers can still assert on a stable query.
    return app.descendants(matching: .any)[identifiers.first ?? labels.first ?? ""]
  }

  private func shellControlExists(_ app: XCUIApplication, identifier: String) -> Bool {
    app.descendants(matching: .any)[identifier].exists
  }

  private func openAuthCallbackURL(
    _ rawURL: String,
    targetApp app: XCUIApplication,
    file: StaticString = #filePath,
    line: UInt = #line
  ) throws {
    guard let url = URL(string: rawURL) else {
      XCTFail("Invalid auth callback URL: \(rawURL)", file: file, line: line)
      return
    }

    app.open(url)
    acceptSystemOpenPromptIfNeeded()
    app.activate()
  }

  private func acceptSystemOpenPromptIfNeeded() {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let openButton = springboard.buttons["Open"]
    if openButton.waitForExistence(timeout: 2) {
      openButton.tap()
    }
  }

  private func acceptSystemAuthPromptIfNeeded() {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    for label in ["Continue", "Open"] {
      let button = springboard.buttons[label]
      if button.waitForExistence(timeout: 1) {
        button.tap()
        return
      }
    }
  }

  private func endUITestSession(_ app: XCUIApplication) {
    guard app.state != .notRunning else { return }

    app.terminate()
    _ = app.wait(for: .notRunning, timeout: 5)
  }

  private func attachScreenshot(named name: String, app: XCUIApplication) {
    let screenshot = app.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = "iOS \(name)"
    attachment.lifetime = .keepAlways
    add(attachment)

    if let directory = testEnvironmentValue("JOVIE_IOS_SCREENSHOT_DIR"), !directory.isEmpty {
      let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
      try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? screenshot.pngRepresentation.write(to: url)
    }
  }

}
