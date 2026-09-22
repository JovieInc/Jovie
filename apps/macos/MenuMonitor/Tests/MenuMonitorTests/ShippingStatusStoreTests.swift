import Foundation
import XCTest

@testable import MenuMonitor

final class ShippingStatusStoreTests: XCTestCase {
  func testKanbanCountsBucketKnownStatuses() {
    let rows: [[String: Any]] = [
      ["status": "in_progress"],
      ["status": "in-progress"],
      ["status": "running"],
      ["status": "shipping"],
      ["status": "ready"],
      ["status": "todo"],
      ["status": "queued"],
      ["status": "blocked"],
      ["status": "blocked"],
    ]

    let counts = ShippingStatusStore.counts(fromRows: rows)

    XCTAssertEqual(counts.inProgress, 4)
    XCTAssertEqual(counts.ready, 3)
    XCTAssertEqual(counts.blocked, 2)
  }

  func testKanbanCountsIgnoreUnknownMissingAndCaseVariants() {
    let rows: [[String: Any]] = [
      ["status": "IN_PROGRESS"],
      ["status": "Blocked"],
      ["status": "done"],
      ["status": "backlog"],
      ["status": ""],
      ["title": "no status field"],
      ["status": 42],
      [:],
    ]

    let counts = ShippingStatusStore.counts(fromRows: rows)

    XCTAssertEqual(counts.inProgress, 1)
    XCTAssertEqual(counts.ready, 0)
    XCTAssertEqual(counts.blocked, 1)
  }

  func testKanbanCountsEmptyRowsProduceZeroCounts() {
    let counts = ShippingStatusStore.counts(fromRows: [])

    XCTAssertEqual(counts.inProgress, 0)
    XCTAssertEqual(counts.ready, 0)
    XCTAssertEqual(counts.blocked, 0)
  }

  func testRunProcessReturnsTrimmedOutput() throws {
    let output = try ShippingStatusStore.runProcess(
      "/bin/zsh",
      args: ["-lc", "echo '  hello monitor  '"]
    )

    XCTAssertEqual(output, "hello monitor")
  }

  func testRunProcessThrowsOnSilentFailure() {
    XCTAssertThrowsError(
      try ShippingStatusStore.runProcess("/usr/bin/false", args: [])
    ) { error in
      XCTAssertEqual((error as NSError).domain, "MenuMonitor")
    }
  }

  func testRunProcessReturnsOutputDespiteNonzeroExit() throws {
    // Scripts that fail but still print diagnostics must surface that output;
    // the status menu renders it instead of a generic failure.
    let output = try ShippingStatusStore.runProcess(
      "/bin/zsh",
      args: ["-lc", "echo 'partial failure detail'; exit 3"]
    )

    XCTAssertEqual(output, "partial failure detail")
  }

  func testRunShellFailsClosedWithGenericMessage() async {
    let output = await ShippingStatusStore.runShell(
      "/nonexistent/jovie-binary",
      args: []
    )

    XCTAssertEqual(output, "Command failed")
  }

  func testGitHubIssueFallbackStaysRetired() async {
    // Linear-backed Symphony is the only intake; the retired GitHub Issue
    // fallback must keep failing closed rather than silently returning counts.
    do {
      _ = try await ShippingStatusStore.fetchGitHubInProgressCount()
      XCTFail("Expected retired GitHub Issue fallback to throw")
    } catch let error as NSError {
      XCTAssertEqual(error.domain, "Jovie.LinearOnlyIntake")
      XCTAssertEqual(error.code, 78)
    }
  }
}
