import Foundation
import XCTest

@testable import MenuMonitor

final class MenuMonitorConformanceTests: XCTestCase {
  func testMenuUsesSingleMetricPresentationOwner() throws {
    let source = try String(contentsOf: menuMonitorAppSourceURL, encoding: .utf8)

    XCTAssertFalse(source.contains("Text(\"In Progress:"))
    XCTAssertFalse(source.contains("Text(\"Ready:"))
    XCTAssertFalse(source.contains("Text(\"Blocked:"))
    XCTAssertTrue(source.contains("ForEach(presentation.metrics)"))
    XCTAssertTrue(source.contains("Text(presentation.text(for: metric))"))
    XCTAssertTrue(source.contains("Button(\"Quit MenuMonitor\")"))
    XCTAssertTrue(source.contains(".keyboardShortcut(\"q\")"))

    let presentationSource = try String(
      contentsOf: menuMonitorPresentationSourceURL,
      encoding: .utf8
    )
    XCTAssertFalse(presentationSource.contains("shippingCountText"))
  }

  func testMenuRendersEveryPublishedPresentationState() throws {
    let source = try String(contentsOf: menuMonitorAppSourceURL, encoding: .utf8)

    XCTAssertTrue(source.contains("presentation.showsInitialLoading"))
    XCTAssertTrue(source.contains("presentation.actionMessage"))
    XCTAssertTrue(source.contains("presentation.lastError"))
  }

  func testMetricsShareCanonicalOrderAndGrammar() {
    let singular = MenuMonitorPresentation(
      inProgressCount: 1,
      readyCount: 1,
      blockedCount: 1,
      lastRefreshDescription: "now",
      lastError: nil,
      actionMessage: nil,
      statusOutput: nil
    )
    let plural = MenuMonitorPresentation(
      inProgressCount: 2,
      readyCount: 0,
      blockedCount: 3,
      lastRefreshDescription: "now",
      lastError: nil,
      actionMessage: nil,
      statusOutput: nil
    )

    XCTAssertEqual(
      singular.metrics.map(\.text),
      ["In Progress: 1 issue shipping", "Ready: 1 card waiting", "Blocked: 1 card blocked"]
    )
    XCTAssertEqual(
      plural.metrics.map(\.text),
      ["In Progress: 2 issues shipping", "Ready: 0 cards waiting", "Blocked: 3 cards blocked"]
    )
    XCTAssertEqual(Set(singular.metrics.map(\.id)).count, MenuMetric.Kind.allCases.count)
  }

  func testInitialLoadingEndsAfterSuccessOrError() {
    let loading = presentation(lastRefreshDescription: nil, lastError: nil)
    let loaded = presentation(lastRefreshDescription: "now", lastError: nil)
    let failed = presentation(lastRefreshDescription: nil, lastError: "Unavailable")

    XCTAssertTrue(loading.showsInitialLoading)
    XCTAssertTrue(loading.metrics.isEmpty)
    XCTAssertFalse(loaded.showsInitialLoading)
    XCTAssertEqual(loaded.metrics.count, MenuMetric.Kind.allCases.count)
    XCTAssertFalse(failed.showsInitialLoading)
    XCTAssertTrue(failed.metrics.isEmpty)
  }

  func testStaleMetricsAreQualifiedAsLastKnown() {
    let fresh = presentation(lastRefreshDescription: "now", lastError: nil)
    let stale = presentation(lastRefreshDescription: "2m ago", lastError: "Unavailable")

    XCTAssertEqual(
      fresh.metrics.map(fresh.text(for:)),
      [
        "In Progress: 0 issues shipping",
        "Ready: 0 cards waiting",
        "Blocked: 0 cards blocked",
      ]
    )
    XCTAssertEqual(
      stale.metrics.map(stale.text(for:)),
      [
        "Last known: In Progress: 0 issues shipping",
        "Last known: Ready: 0 cards waiting",
        "Last known: Blocked: 0 cards blocked",
      ]
    )
  }

  func testMenuBarDistinguishesLoadingFreshAndUnavailableStatus() {
    let loading = menuBar(count: 0, hasLoaded: false)
    let freshZero = menuBar(count: 0, hasLoaded: true)
    let freshOne = menuBar(count: 1, hasLoaded: true)
    let capped = menuBar(count: 100, hasLoaded: true)
    let unavailable = menuBar(count: 0, hasLoaded: false, hasError: true)
    let stale = menuBar(count: 4, hasLoaded: true, hasError: true)
    let acting = menuBar(
      count: 4,
      hasLoaded: true,
      actionMessage: "Restarting Hermes gateway…"
    )

    XCTAssertNil(loading.badgeText)
    XCTAssertEqual(loading.accessibilityValue, "Refreshing shipping status")
    XCTAssertNil(freshZero.badgeText)
    XCTAssertEqual(freshZero.accessibilityValue, "0 issues shipping")
    XCTAssertEqual(freshOne.badgeText, "1")
    XCTAssertEqual(freshOne.accessibilityValue, "1 issue shipping")
    XCTAssertEqual(capped.badgeText, "99+")
    XCTAssertEqual(unavailable.badgeText, "!")
    XCTAssertEqual(unavailable.accessibilityValue, "Shipping status unavailable")
    XCTAssertEqual(stale.badgeText, "!")
    XCTAssertEqual(
      stale.accessibilityValue,
      "Shipping status unavailable; last known: 4 issues shipping"
    )
    XCTAssertEqual(acting.badgeText, "…")
    XCTAssertEqual(
      acting.accessibilityValue,
      "Restarting Hermes gateway… 4 issues shipping"
    )
  }

  private func presentation(
    lastRefreshDescription: String?,
    lastError: String?
  ) -> MenuMonitorPresentation {
    MenuMonitorPresentation(
      inProgressCount: 0,
      readyCount: 0,
      blockedCount: 0,
      lastRefreshDescription: lastRefreshDescription,
      lastError: lastError,
      actionMessage: nil,
      statusOutput: nil
    )
  }

  private func menuBar(
    count: Int,
    hasLoaded: Bool,
    hasError: Bool = false,
    actionMessage: String? = nil
  ) -> MenuBarPresentation {
    MenuBarPresentation(
      count: count,
      hasLoaded: hasLoaded,
      hasError: hasError,
      actionMessage: actionMessage
    )
  }

  private var menuMonitorAppSourceURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Sources/MenuMonitor/MenuMonitorApp.swift")
  }

  private var menuMonitorPresentationSourceURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Sources/MenuMonitor/MenuMonitorPresentation.swift")
  }
}
