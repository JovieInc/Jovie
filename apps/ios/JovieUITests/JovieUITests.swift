import XCTest

final class JovieUITests: XCTestCase {
  func testSignedOutLaunchShowsAuthScreen() {
    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-signed-out")
    app.launch()

    XCTAssertTrue(app.staticTexts["Sign In"].waitForExistence(timeout: 2))
  }

  func testReadyLaunchShowsDashboard() {
    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-ready")
    app.launch()

    XCTAssertTrue(app.buttons["Copy URL"].waitForExistence(timeout: 2))
    XCTAssertTrue(app.staticTexts["DJ Shadow"].exists)
  }

  func testNeedsOnboardingLaunchShowsContinueOnWeb() {
    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-needs-onboarding")
    app.launch()

    XCTAssertTrue(app.buttons["Continue On Web"].waitForExistence(timeout: 2))
  }

  func testCopyURLButtonShowsCopiedState() throws {
    if ProcessInfo.processInfo.environment["CI"] == "true" {
      throw XCTSkip("Flaky on CI: transient 'Copied' state is timing-sensitive on simulator.")
    }

    let app = XCUIApplication()
    app.launchArguments.append("-ui-testing-ready")
    app.launch()

    let copyButton = app.buttons["Copy URL"]
    XCTAssertTrue(copyButton.waitForExistence(timeout: 2))
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
}
