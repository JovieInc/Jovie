import XCTest

final class LibraryAccessibilityUITests: XCTestCase {
  private let minimumTouchTarget: CGFloat = 44

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  func testLibraryPrimaryControlsMeetMinimumTouchTarget() {
    let app = launchLibrary()

    assertPrimaryControlsMeetMinimumTouchTarget(in: app)
  }

  func testLibraryPillExpandedHitAreaAndLandscapeConformance() {
    // Launch already rotated: a fresh app presented into the device's current
    // orientation settles deterministically, unlike rotating mid-test and
    // racing the scene's orientation change on fresh CI simulators.
    let app = launchLibrary(orientation: .landscapeLeft)

    let landscapeSettled = XCTWaiter.wait(
      for: [XCTNSPredicateExpectation(
        predicate: NSPredicate { _, _ in app.frame.width > app.frame.height },
        object: app
      )],
      timeout: 10
    )
    guard landscapeSettled == .completed else {
      XCTFail(
        "Library window did not settle into landscape after launching rotated. frame=\(app.frame)\n\(app.debugDescription)"
      )
      return
    }

    assertPrimaryControlsMeetMinimumTouchTarget(in: app)
    let collections = app.buttons["library-home-collections"]
    collections.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)).tap()
    let selectedExpectation = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in app.buttons["library-home-collections"].isSelected },
      object: app
    )
    XCTAssertEqual(
      XCTWaiter.wait(for: [selectedExpectation], timeout: 6),
      .completed,
      "The expanded top edge must activate the pill after rotation."
    )
  }

  private func launchLibrary(orientation: UIDeviceOrientation = .portrait) -> XCUIApplication {
    XCUIDevice.shared.orientation = orientation
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing-library", "-ui-testing-allow-exit"]
    addTeardownBlock {
      app.terminate()
      XCUIDevice.shared.orientation = .portrait
    }
    app.launch()

    let surface = app.descendants(matching: .any)["library-surface"]
    XCTAssertTrue(
      surface.waitForExistence(timeout: 8),
      "Library fixture did not expose library-surface.\n\(app.debugDescription)"
    )
    return app
  }

  private func assertPrimaryControlsMeetMinimumTouchTarget(in app: XCUIApplication) {
    let controls: [(name: String, element: XCUIElement)] = [
      ("Catalog home switcher", app.buttons["library-home-catalog"]),
      ("Collections home switcher", app.buttons["library-home-collections"]),
      ("Ideas home switcher", app.buttons["library-home-ideas"]),
      ("All filter", app.buttons["library-filter-all"]),
      ("Releases filter", app.buttons["library-filter-release"]),
      ("Merch filter", app.buttons["library-filter-merch"]),
      ("Docs filter", app.buttons["library-filter-press"]),
      ("Catalog search", app.textFields["library-search"]),
    ]

    for control in controls {
      XCTAssertTrue(
        control.element.exists,
        "\(control.name) did not exist.\n\(app.debugDescription)"
      )
      XCTAssertGreaterThanOrEqual(
        control.element.frame.height,
        minimumTouchTarget,
        "\(control.name) must keep a \(minimumTouchTarget)-point minimum touch target."
      )
    }
  }
}
