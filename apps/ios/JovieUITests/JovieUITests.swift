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
    XCTAssertTrue(app.buttons["Chat"].exists)
    XCTAssertTrue(app.buttons["Profile"].exists)
    XCTAssertTrue(app.buttons["Open Settings"].exists)
    attachScreenshot(named: "profile", app: app)
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

  func testNeedsOnboardingLaunchShowsContinueOnWeb() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-needs-onboarding",
      expectedElementDescription: "\"Continue on Web\""
    ) {
      $0.buttons["Continue on Web"]
    }

    attachScreenshot(named: "needs-onboarding", app: app)
  }

  func testFullScreenSettingsLogsOutToSignedOut() {
    let app = launchMockApp(launchArgument: "-ui-testing-settings", expectedElementDescription: "\"Settings\"") {
      $0.staticTexts["Settings"]
    }

    attachScreenshot(named: "settings", app: app)
    app.buttons["Log Out"].tap()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 5),
      "Logout did not return to signed-out state.\n\(app.debugDescription)"
    )
  }

  func testBottomNavigationSwitchesBetweenChatAndProfile() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.staticTexts["Ask Jovie"]
    }

    XCTAssertTrue(app.textFields["Ask Jovie"].exists)
    let profileTab = app.buttons["shell-tab-profile"]
    let chatTab = app.buttons["shell-tab-chat"]
    XCTAssertTrue(
      profileTab.waitForExistence(timeout: 3),
      "Bottom navigation did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(chatTab.exists)
    attachScreenshot(named: "chat", app: app)

    profileTab.tap()

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Bottom nav did not switch to Profile.\n\(app.debugDescription)"
    )
  }

  func testSwipeNavigatesBetweenProfileAndChat() {
    let app = launchMockApp(launchArgument: "-ui-testing-chat", expectedElementDescription: "\"Ask Jovie\"") {
      $0.textFields["Ask Jovie"]
    }

    // Launches on Chat; swiping right reveals the Profile screen.
    app.swipeRight()
    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Swiping right did not reveal the Profile screen.\n\(app.debugDescription)"
    )

    // Swiping left returns to Chat.
    app.swipeLeft()
    XCTAssertTrue(
      app.textFields["Ask Jovie"].waitForExistence(timeout: 3),
      "Swiping left did not return to the Chat screen.\n\(app.debugDescription)"
    )
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

    app.buttons["shell-tab-profile"].tap()
    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Shell navigation did not switch to Profile.\n\(app.debugDescription)"
    )

    app.buttons["shell-tab-chat"].tap()
    let restoredInput = app.textFields["Ask Jovie"]
    XCTAssertTrue(
      waitForHittable(restoredInput, timeout: 3),
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

    let profileTab = app.buttons["shell-tab-profile"]
    let chatTab = app.buttons["shell-tab-chat"]
    let profileReady = app.buttons["Copy URL"]
    let chatReady = app.textFields["Ask Jovie"]

    XCTAssertTrue(
      profileTab.waitForExistence(timeout: timeoutSeconds),
      "Bottom navigation did not appear before runtime measurement.\n\(app.debugDescription)"
    )
    XCTAssertTrue(chatTab.exists)

    measure(metrics: shellRuntimeMetrics(for: app)) {
      profileTab.tap()
      XCTAssertTrue(
        waitForHittable(profileReady, timeout: timeoutSeconds),
        "Measured transition to Profile did not finish within \(timeoutSeconds) seconds.\n\(app.debugDescription)"
      )

      chatTab.tap()
      XCTAssertTrue(
        waitForHittable(chatReady, timeout: timeoutSeconds),
        "Measured transition to Chat did not finish within \(timeoutSeconds) seconds.\n\(app.debugDescription)"
      )
    }
  }

  func testShellMenuAndSettingsNavigationAreFullScreen() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    app.buttons["More"].tap()
    XCTAssertTrue(
      app.staticTexts["Jovie"].waitForExistence(timeout: 3),
      "Shell navigation did not reveal the menu.\n\(app.debugDescription)"
    )

    app.buttons["Close Menu"].tap()
    app.buttons["Open Settings"].tap()
    XCTAssertTrue(
      app.staticTexts["Settings"].waitForExistence(timeout: 3),
      "Shell navigation did not open settings.\n\(app.debugDescription)"
    )
  }

  func testRecentConversationSelectionOpensCachedChat() {
    let app = launchMockApp(
      launchArgument: "-ui-testing-recent-conversations",
      expectedElementDescription: "\"Copy URL\""
    ) {
      $0.buttons["Copy URL"]
    }

    app.buttons["More"].tap()

    let recentConversation = app.buttons["recent-conversation-conv_ui_recent_launch"]
    XCTAssertTrue(
      recentConversation.waitForExistence(timeout: 3),
      "Recent conversation row did not appear.\n\(app.debugDescription)"
    )

    recentConversation.tap()

    XCTAssertTrue(
      app.staticTexts["Here is the cached launch plan."].waitForExistence(timeout: 5),
      "Cached conversation content did not appear after selecting a recent conversation.\n\(app.debugDescription)"
    )
    XCTAssertTrue(app.textFields["Ask Jovie (offline)"].exists || app.textFields["Ask Jovie"].exists)
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

    var didShowCopiedState = false

    for attempt in 1...3 {
      let copyURLButton = app.buttons["dashboard-copy-url-button"]
      XCTAssertTrue(
        copyURLButton.waitForExistence(timeout: 3),
        "Copy URL button did not appear.\n\(app.debugDescription)"
      )
      XCTAssertTrue(
        waitForHittable(copyURLButton, timeout: 5),
        "Copy URL button was not hittable.\n\(app.debugDescription)"
      )

      copyURLButton.tap()

      let copiedStateTimeout: TimeInterval = attempt == 3 ? 5 : 2
      if app.buttons["Copied"].waitForExistence(timeout: copiedStateTimeout) {
        didShowCopiedState = true
        break
      }
    }

    XCTAssertTrue(
      didShowCopiedState,
      "Copy URL button did not show copied state.\n\(app.debugDescription)"
    )
  }

  func testLiveAuthViewRenders() throws {
    guard testEnvironmentValue("JOVIE_IOS_LIVE_AUTH_UI") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_AUTH_UI=1 to run the live Clerk UI spike.")
    }

    let app = try makeLiveClerkApp(launchArgument: "-ui-testing-live-auth")
    app.launch()

    XCTAssertTrue(
      app.buttons["Continue in Browser"].waitForExistence(timeout: 10),
      "Browser auth entry button did not appear.\n\(app.debugDescription)"
    )
  }

  func testLiveNativeSessionCanReachAnAuthenticatedMobileState() throws {
    guard testEnvironmentValue("JOVIE_IOS_LIVE_AUTH_UI") == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_AUTH_UI=1 to run the live Clerk UI spike.")
    }

    let app = try makeLiveClerkApp(launchArgument: "-ui-testing-auto-auth")
    app.launch()

    let copyURLButton = app.buttons["Copy URL"]
    let continueOnWebButton = app.buttons["Continue on Web"]
    let deadline = Date().addingTimeInterval(25)

    while Date() < deadline {
      if copyURLButton.exists || continueOnWebButton.exists {
        return
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    }

    XCTFail("Live auth did not reach dashboard or onboarding.\n\(app.debugDescription)")
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
    let app = launchMockApp(
      launchArgument: "-ui-testing-auth-callback",
      expectedElementDescription: "\"Continue in Browser\""
    ) {
      $0.buttons["Continue in Browser"]
    }

    try openAuthCallbackURL(
      "ie.jov.jovie://auth/complete?code=test_code&state=state_123",
      targetApp: app
    )

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 10),
      "Auth callback did not route to the authenticated shell.\n\(app.debugDescription)"
    )

    try openAuthCallbackURL(
      "ie.jov.jovie://auth/complete?code=test_code&state=state_123",
      targetApp: app
    )

    XCTAssertTrue(
      app.buttons["Copy URL"].waitForExistence(timeout: 3),
      "Duplicate auth callback should leave the authenticated shell stable.\n\(app.debugDescription)"
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
      "ie.jov.jovie://auth/complete?error=access_denied&error_description=Denied&state=state_123",
      targetApp: app
    )

    XCTAssertTrue(
      app.staticTexts["Couldn't finish sign-in. Try again."].waitForExistence(timeout: 10),
      "Provider error callback did not render the auth error.\n\(app.debugDescription)"
    )
  }

  private func makeLiveClerkApp(launchArgument: String) throws -> XCUIApplication {
    let publishableKey =
      testEnvironmentValue("CLERK_PUBLISHABLE_KEY") ??
      testEnvironmentValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ??
      ""
    let apiBaseURL =
      testEnvironmentValue("JOVIE_IOS_API_BASE_URL") ??
      testEnvironmentValue("API_BASE_URL") ??
      "http://localhost:3003"
    let emailAddress = try requiredEnvironmentValue("E2E_CLERK_USER_USERNAME")
    let verificationCode = testEnvironmentValue("JOVIE_IOS_LIVE_AUTH_CODE") ?? "424242"

    let app = XCUIApplication()
    app.launchArguments.append(launchArgument)
    app.launchArguments.append("-ui-testing-allow-exit")
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    app.launchEnvironment["E2E_CLERK_USER_USERNAME"] = emailAddress
    app.launchEnvironment["JOVIE_IOS_LIVE_AUTH_CODE"] = verificationCode

    if !publishableKey.isEmpty {
      app.launchEnvironment["CLERK_PUBLISHABLE_KEY"] = publishableKey
      app.launchEnvironment["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = publishableKey
    }

    addTeardownBlock { [app] in
      self.endUITestSession(app)
    }

    return app
  }

  private func makeRealBrowserAuthApp() throws -> XCUIApplication {
    let publishableKey =
      testEnvironmentValue("CLERK_PUBLISHABLE_KEY") ??
      testEnvironmentValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ??
      ""
    let apiBaseURL = try requiredHTTPSURL("API_BASE_URL")
    let webBaseURL = try requiredHTTPSURL("WEB_BASE_URL")

    guard !publishableKey.isEmpty else {
      throw XCTSkip("Missing CLERK_PUBLISHABLE_KEY for HTTPS browser auth testing.")
    }

    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-real-browser-auth")
    app.launchArguments.append("-ui-testing-allow-exit")
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    app.launchEnvironment["WEB_BASE_URL"] = webBaseURL
    app.launchEnvironment["JOVIE_IOS_REAL_BROWSER_AUTH"] = "1"
    app.launchEnvironment["JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA"] =
      testEnvironmentValue("JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA") ?? "creator-ready"
    app.launchEnvironment["CLERK_PUBLISHABLE_KEY"] = publishableKey
    app.launchEnvironment["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = publishableKey

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
      throw XCTSkip("Missing \(key) or TEST_RUNNER_\(key) for live Clerk UI testing.")
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
    expectedElementDescription: String,
    timeout: TimeInterval = 5,
    file: StaticString = #filePath,
    line: UInt = #line,
    element: (XCUIApplication) -> XCUIElement
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments.append(launchArgument)
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

    if app.state == .runningForeground {
      let exitButton = app.buttons["ui-test-exit"]
      if exitButton.waitForExistence(timeout: 1) {
        exitButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      }
    }

    if !app.wait(for: .notRunning, timeout: 5) {
      app.terminate()
      _ = app.wait(for: .notRunning, timeout: 2)
    }
  }

  private func attachScreenshot(named name: String, app: XCUIApplication) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "iOS \(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

}
