import XCTest

/// JOV-4572 foundation slice: a deterministic, scriptable dogfood driver for
/// the native shell. Each surface visit emits one JSONL event to
/// `JOVIE_IOS_DOGFOOD_EVENTS_PATH` and a PNG to `JOVIE_IOS_SCREENSHOT_DIR`, so
/// `apps/ios/scripts/dogfood-ios.sh` can assemble a structured run report
/// (schema `jovie-ios-dogfood/v1`) without scraping xcodebuild output.
///
/// Unlike the assertion-heavy fixtures in `JovieUITests`, this suite keeps
/// going after a failed check (`continueAfterFailure = true`): the run's job
/// is *discovery*, so a broken surface must not starve evidence for the rest.
final class DogfoodExplorationUITests: XCTestCase {
  private let screenshotPrefix = "dogfood"

  override func setUp() {
    super.setUp()
    continueAfterFailure = true
  }

  // MARK: - Surfaces

  private struct DogfoodCheck {
    let name: String
    let passed: Bool
    let detail: String?
  }

  private struct DogfoodSurface {
    let name: String
    let launchArgument: String
    let anchorDescription: String
    let anchor: (XCUIApplication) -> XCUIElement
    let anchorTimeout: TimeInterval
    let checks: [(XCUIApplication) -> DogfoodCheck]
  }

  private func staticCheck(
    _ name: String,
    _ evaluate: @escaping (XCUIApplication) -> Bool,
    detail: String? = nil
  ) -> (XCUIApplication) -> DogfoodCheck {
    { app in DogfoodCheck(name: name, passed: evaluate(app), detail: detail) }
  }

  private func elementExistsCheck(
    _ name: String,
    _ element: @escaping (XCUIApplication) -> XCUIElement,
    timeout: TimeInterval = 2
  ) -> (XCUIApplication) -> DogfoodCheck {
    { app in
      DogfoodCheck(
        name: name,
        passed: element(app).waitForExistence(timeout: timeout),
        detail: nil
      )
    }
  }

  private var signedOutSurface: DogfoodSurface {
    DogfoodSurface(
      name: "signed-out",
      launchArgument: "-ui-testing-signed-out",
      anchorDescription: "\"Continue to Jovie\"",
      anchor: { $0.buttons["Continue to Jovie"] },
      anchorTimeout: 8,
      checks: [
        elementExistsCheck("auth-screen-only", { app in
          app.buttons["Continue to Jovie"]
        }),
        staticCheck("no-email-field", { !$0.staticTexts["Email"].exists }),
      ]
    )
  }

  private var coreSurfaces: [DogfoodSurface] {
    [
      DogfoodSurface(
        name: "chat-home",
        launchArgument: "-ui-testing-chat",
        anchorDescription: "\"chat-composer-input\"",
        anchor: { $0.textFields["chat-composer-input"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("empty-greeting") { $0.staticTexts["chat-empty-greeting"] },
          elementExistsCheck("drawer-open-control") { app in
            app.buttons.matching(
              NSPredicate(format: "identifier == 'shell-drawer-open' OR label == 'Open navigation drawer'")
            ).firstMatch
          },
          staticCheck("no-bottom-tab-bar", { !$0.descendants(matching: .any)["shell-tab-bar"].exists }),
        ]
      ),
      DogfoodSurface(
        name: "dashboard",
        launchArgument: "-ui-testing-ready",
        anchorDescription: "\"Copy URL\"",
        anchor: { $0.buttons["Copy URL"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("share-profile") { $0.buttons["dashboard-share-profile-button"] },
          elementExistsCheck("open-public-profile") { $0.buttons["Open Public Profile"] },
          elementExistsCheck("open-settings") { $0.buttons["Open Settings"] },
        ]
      ),
      DogfoodSurface(
        name: "settings",
        launchArgument: "-ui-testing-settings",
        anchorDescription: "\"Settings\"",
        anchor: { $0.staticTexts["Settings"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("manage-account-row", timeout: 4) { app in
            app.descendants(matching: .any)
              .matching(NSPredicate(format: "label == %@", "Manage Account"))
              .firstMatch
          },
          elementExistsCheck("logout-row", timeout: 4) { app in
            app.buttons["Log Out"]
          },
          elementExistsCheck("version-row") { $0.staticTexts["Version"] },
        ]
      ),
      DogfoodSurface(
        name: "library",
        launchArgument: "-ui-testing-library",
        anchorDescription: "\"library-surface\"",
        anchor: { $0.descendants(matching: .any)["library-surface"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("asset-card", timeout: 4) { app in
            app.descendants(matching: .any)["library-asset-lib-release-midnight"]
          },
        ]
      ),
      DogfoodSurface(
        name: "inbox",
        launchArgument: "-ui-testing-inbox",
        anchorDescription: "\"inbox-surface\"",
        anchor: { $0.descendants(matching: .any)["inbox-surface"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("pending-action-count") { $0.staticTexts["1 pending action"] },
          elementExistsCheck("ask-jovie-cta") { $0.buttons["inbox-ask-jovie"] },
        ]
      ),
      DogfoodSurface(
        name: "calendar",
        launchArgument: "-ui-testing-calendar",
        anchorDescription: "\"calendar-surface\"",
        anchor: { $0.descendants(matching: .any)["calendar-surface"] },
        anchorTimeout: 8,
        checks: []
      ),
      DogfoodSurface(
        name: "audience",
        launchArgument: "-ui-testing-audience",
        anchorDescription: "\"Profile views\"",
        anchor: { $0.staticTexts["Profile views"] },
        anchorTimeout: 8,
        checks: [
          elementExistsCheck("audience-title") { $0.staticTexts["Audience"] },
          elementExistsCheck("audience-cta") { $0.buttons["Ask Jovie about your audience"] },
        ]
      ),
    ]
  }

  /// Drawer surface switcher targets reachable from the authenticated shell,
  /// keyed to the anchor that proves the destination mounted.
  private var drawerDestinations: [(tab: String, anchorDescription: String, anchor: (XCUIApplication) -> XCUIElement)] {
    [
      ("shell-tab-chat", "\"chat-composer-input\"", { $0.textFields["chat-composer-input"] }),
      ("shell-tab-profile", "\"Copy URL\"", { $0.buttons["Copy URL"] }),
      ("shell-tab-library", "\"library-surface\"", { $0.descendants(matching: .any)["library-surface"] }),
      ("shell-tab-inbox", "\"inbox-surface\"", { $0.descendants(matching: .any)["inbox-surface"] }),
      ("shell-tab-calendar", "\"calendar-surface\"", { $0.descendants(matching: .any)["calendar-surface"] }),
      ("shell-tab-audience", "\"Profile views\"", { $0.staticTexts["Profile views"] }),
    ]
  }

  // MARK: - Tests

  /// The real first-run surface: signed-out account selection.
  func testDogfoodSignedOutSurface() {
    visitSurface(signedOutSurface)
  }

  /// Launch → anchor → bounded checks → screenshot → relaunch, across every
  /// authenticated fixture surface. A dead surface fails the check but not the
  /// rest of the journey.
  func testDogfoodCoreSurfaceExploration() {
    for surface in coreSurfaces {
      visitSurface(surface)
    }
  }

  /// User-style navigation: open the drawer and cycle every reachable surface
  /// switcher, proving each switch lands on its destination anchor.
  func testDogfoodDrawerSurfaceSwitching() {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing-ready", "-ui-testing-allow-exit"]
    addTeardownBlock { [app] in
      self.endDogfoodSession(app)
    }
    app.launch()

    let dashboardAnchor = app.buttons["Copy URL"]
    XCTAssertTrue(
      dashboardAnchor.waitForExistence(timeout: 8),
      "Dogfood drawer pass did not reach dashboard.\n\(app.debugDescription)"
    )

    for destination in drawerDestinations {
      let start = Date()
      var checks: [DogfoodCheck] = []
      var issues: [String] = []

      let drawerOpened = openDrawerIfNeeded(app)
      checks.append(DogfoodCheck(
        name: "drawer-open",
        passed: drawerOpened,
        detail: drawerOpened ? nil : "drawer control did not open the drawer"
      ))

      let switcher = app.descendants(matching: .any)["shell-drawer-surface-\(destination.tab)"]
      var landed = false
      if drawerOpened, switcher.waitForExistence(timeout: 3) {
        switcher.tap()
        landed = destination.anchor(app).waitForExistence(timeout: 5)
        checks.append(DogfoodCheck(
          name: "surface-landed",
          passed: landed,
          detail: landed ? nil : "\(destination.tab) did not mount \(destination.anchorDescription)"
        ))
      } else {
        checks.append(DogfoodCheck(
          name: "surface-switcher-present",
          passed: false,
          detail: "drawer switcher shell-drawer-surface-\(destination.tab) absent"
        ))
      }

      if !landed {
        issues.append("drawer surface \(destination.tab) failed: \(checks.compactMap(\.detail).joined(separator: "; "))")
      }

      recordSurfaceEvent(
        name: "drawer-\(destination.tab.replacingOccurrences(of: "shell-tab-", with: ""))",
        launchArgument: "-ui-testing-ready",
        status: landed ? "pass" : "fail",
        duration: Date().timeIntervalSince(start),
        checks: checks,
        issues: issues,
        app: app
      )
      attachDogfoodScreenshot(named: "\(screenshotPrefix)-drawer-\(destination.tab)", app: app)

      XCTAssertTrue(
        app.state == .runningForeground,
        "App left the foreground during drawer exploration of \(destination.tab)."
      )
    }
  }

  // MARK: - Journey helpers

  private func visitSurface(_ surface: DogfoodSurface) {
    let app = XCUIApplication()
    app.launchArguments = [surface.launchArgument, "-ui-testing-allow-exit"]
    let start = Date()
    var issues: [String] = []

    app.launch()

    var checks: [DogfoodCheck] = []
    let anchored = surface.anchor(app).waitForExistence(timeout: surface.anchorTimeout)
    checks.append(DogfoodCheck(
      name: "anchor",
      passed: anchored,
      detail: anchored ? nil : "missing \(surface.anchorDescription)"
    ))

    if anchored {
      for check in surface.checks {
        let result = check(app)
        checks.append(result)
        if !result.passed {
          issues.append(result.detail ?? "check \(result.name) failed")
        }
      }
    } else {
      issues.append("surface never mounted \(surface.anchorDescription)")
    }

    let alive = app.state == .runningForeground
    checks.append(DogfoodCheck(
      name: "app-alive",
      passed: alive,
      detail: alive ? nil : "app.state=\(app.state.rawValue)"
    ))
    if !alive {
      issues.append("app terminated during surface visit")
    }

    let status = checks.allSatisfy(\.passed) ? "pass" : "fail"
    recordSurfaceEvent(
      name: surface.name,
      launchArgument: surface.launchArgument,
      status: status,
      duration: Date().timeIntervalSince(start),
      checks: checks,
      issues: issues,
      app: app
    )
    attachDogfoodScreenshot(named: "\(screenshotPrefix)-\(surface.name)", app: app)

    XCTAssertTrue(anchored, "Dogfood surface \(surface.name) did not mount.\n\(app.debugDescription)")
    XCTAssertTrue(alive, "Dogfood surface \(surface.name) lost the app process.")
    endDogfoodSession(app)
  }

  private func openDrawerIfNeeded(_ app: XCUIApplication, timeout: TimeInterval = 6) -> Bool {
    let drawer = app.descendants(matching: .any)["shell-drawer"]
    if drawer.waitForExistence(timeout: 1), drawer.isHittable {
      return true
    }

    let opener = app.buttons.matching(
      NSPredicate(format: "identifier == 'shell-drawer-open' OR label == 'Open navigation drawer'")
    ).firstMatch
    guard opener.waitForExistence(timeout: timeout) else {
      return false
    }
    opener.tap()
    return drawer.waitForExistence(timeout: timeout)
  }

  // MARK: - Evidence

  private func recordSurfaceEvent(
    name: String,
    launchArgument: String,
    status: String,
    duration: TimeInterval,
    checks: [DogfoodCheck],
    issues: [String],
    app: XCUIApplication
  ) {
    let event: [String: Any] = [
      "type": "surface",
      "name": name,
      "launch": launchArgument,
      "status": status,
      "duration_ms": Int(duration * 1000),
      "timestamp": iso8601Now(),
      "app_state": app.state.rawValue,
      "screenshot": "\(screenshotPrefix)-\(name).png",
      "checks": checks.map {
        [
          "name": $0.name,
          "status": $0.passed ? "pass" : "fail",
          "detail": $0.detail ?? NSNull(),
        ] as [String: Any]
      },
      "issues": issues,
    ]
    appendDogfoodEvent(event)

    recordTestEvent([
      "type": "test",
      "name": name,
      "status": status,
      "timestamp": iso8601Now(),
    ])
  }

  private func recordTestEvent(_ event: [String: Any]) {
    appendDogfoodEvent(event)
  }

  private func appendDogfoodEvent(_ event: [String: Any]) {
    guard let path = dogfoodEnvironmentValue("JOVIE_IOS_DOGFOOD_EVENTS_PATH"), !path.isEmpty else {
      return
    }
    guard let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
          var line = String(data: data, encoding: .utf8)
    else {
      return
    }
    line.append("\n")

    let url = URL(fileURLWithPath: path)
    let fileManager = FileManager.default
    try? fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )

    if fileManager.fileExists(atPath: url.path),
       let handle = try? FileHandle(forWritingTo: url) {
      handle.seekToEndOfFile()
      handle.write(Data(line.utf8))
      try? handle.close()
    } else {
      try? line.write(to: url, atomically: true, encoding: .utf8)
    }
  }

  private func attachDogfoodScreenshot(named name: String, app: XCUIApplication) {
    let screenshot = app.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = "iOS \(name)"
    attachment.lifetime = .keepAlways
    add(attachment)

    if let directory = dogfoodEnvironmentValue("JOVIE_IOS_SCREENSHOT_DIR"), !directory.isEmpty {
      let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
      try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? screenshot.pngRepresentation.write(to: url)
    }
  }

  private func endDogfoodSession(_ app: XCUIApplication) {
    guard app.state != .notRunning else { return }

    app.terminate()
    _ = app.wait(for: .notRunning, timeout: 5)
  }

  private func dogfoodEnvironmentValue(_ key: String) -> String? {
    let environment = ProcessInfo.processInfo.environment

    if let value = environment[key], !value.isEmpty {
      return value
    }

    if let value = environment["TEST_RUNNER_\(key)"], !value.isEmpty {
      return value
    }

    return nil
  }

  private func iso8601Now() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
  }
}
