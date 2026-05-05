import XCTest

final class JovieUITests: XCTestCase {
  func testSignedOutLaunchShowsAuthScreen() {
    _ = launchMockApp(launchArgument: "-ui-testing-signed-out", expectedElementDescription: "\"Sign In\"") {
      $0.staticTexts["Sign In"]
    }
  }

  func testReadyLaunchShowsDashboard() {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    XCTAssertTrue(app.staticTexts["DJ Shadow"].exists)
  }

  func testNeedsOnboardingLaunchShowsContinueOnWeb() {
    _ = launchMockApp(
      launchArgument: "-ui-testing-needs-onboarding",
      expectedElementDescription: "\"Continue On Web\""
    ) {
      $0.buttons["Continue On Web"]
    }
  }

  func testCopyURLButtonShowsCopiedState() throws {
    let app = launchMockApp(launchArgument: "-ui-testing-ready", expectedElementDescription: "\"Copy URL\"") {
      $0.buttons["Copy URL"]
    }

    let copyButton = app.buttons["Copy URL"]
    copyButton.tap()

    XCTAssertTrue(app.buttons["Copied"].waitForExistence(timeout: 2))
  }

  func testLiveAuthViewRenders() throws {
    guard ProcessInfo.processInfo.environment["JOVIE_IOS_LIVE_AUTH_UI"] == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_AUTH_UI=1 to run the live Clerk UI spike.")
    }

    let app = try makeLiveClerkApp(launchArgument: "-ui-testing-live-auth")
    app.launch()

    XCTAssertTrue(
      app.staticTexts["Continue to Jovie"].waitForExistence(timeout: 10),
      "Clerk auth heading did not appear.\n\(app.debugDescription)"
    )
    XCTAssertTrue(
      app.staticTexts["Enter your email"].waitForExistence(timeout: 10),
      "Clerk email prompt did not appear.\n\(app.debugDescription)"
    )
  }

  func testLiveNativeSessionCanReachAnAuthenticatedMobileState() throws {
    guard ProcessInfo.processInfo.environment["JOVIE_IOS_LIVE_AUTH_UI"] == "1" else {
      throw XCTSkip("Set JOVIE_IOS_LIVE_AUTH_UI=1 to run the live Clerk UI spike.")
    }

    let app = try makeLiveClerkApp(launchArgument: "-ui-testing-auto-auth")
    app.launch()

    let copyURLButton = app.buttons["Copy URL"]
    let continueOnWebButton = app.buttons["Continue On Web"]
    let deadline = Date().addingTimeInterval(25)

    while Date() < deadline {
      if copyURLButton.exists || continueOnWebButton.exists {
        return
      }

      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    }

    XCTFail("Live auth did not reach dashboard or onboarding.\n\(app.debugDescription)")
  }

  private func makeLiveClerkApp(launchArgument: String) throws -> XCUIApplication {
    let publishableKey =
      ProcessInfo.processInfo.environment["CLERK_PUBLISHABLE_KEY"] ??
      ProcessInfo.processInfo.environment["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] ??
      ""
    let apiBaseURL = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:3003"
    let emailAddress = try requiredEnvironmentValue("E2E_CLERK_USER_USERNAME")
    let verificationCode = ProcessInfo.processInfo.environment["JOVIE_IOS_LIVE_AUTH_CODE"] ?? "424242"

    let app = XCUIApplication()
    app.launchArguments.append(launchArgument)
    app.launchEnvironment["API_BASE_URL"] = apiBaseURL
    app.launchEnvironment["E2E_CLERK_USER_USERNAME"] = emailAddress
    app.launchEnvironment["JOVIE_IOS_LIVE_AUTH_CODE"] = verificationCode

    if !publishableKey.isEmpty {
      app.launchEnvironment["CLERK_PUBLISHABLE_KEY"] = publishableKey
      app.launchEnvironment["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] = publishableKey
    }

    return app
  }

  private func requiredEnvironmentValue(_ key: String) throws -> String {
    let value = ProcessInfo.processInfo.environment[key] ?? ""
    guard !value.isEmpty else {
      throw XCTSkip("Missing \(key) for live Clerk UI testing.")
    }

    return value
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
}
