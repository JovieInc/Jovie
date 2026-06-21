import Foundation
import Testing
@testable import Jovie

struct PerformanceBudgetGuardTests {
  @Test func canonicalBudgetsMatchProductTargets() {
    #expect(PerformanceBudgets.coldLaunchMilliseconds == 400)
    #expect(PerformanceBudgets.hitchRateMillisecondsPerSecond == 5.0)
    #expect(PerformanceBudgets.maxFrameMilliseconds == 8.3)
    #expect(PerformanceBudgets.shellTransitionMilliseconds == 3_000)
  }

  @Test func uiTestsReferenceLaunchBudgetEnv() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("JovieUITests/JovieUITests.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(source.contains("JOVIE_IOS_LAUNCH_PERFORMANCE"))
    #expect(source.contains("JOVIE_IOS_RUNTIME_PERFORMANCE"))
    #expect(source.contains("XCTApplicationLaunchMetric"))
    #expect(source.contains("XCTHitchMetric"))
  }
}