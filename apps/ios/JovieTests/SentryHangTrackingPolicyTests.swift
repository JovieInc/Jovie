import Foundation
import Testing
@testable import Jovie

/// Locks the app-hang tracking policy for the Sentry iOS SDK (JOV-8646).
///
/// Sentry reported "App Hanging: App hanging for at least 2000 ms" against
/// this app. sentry-cocoa enables app-hang tracking by default with a 2 s
/// threshold, but the app never pinned those options — the signal depended
/// on SDK defaults that can change between majors. Hang tracking must stay
/// explicitly enabled at the locked threshold and must never be silently
/// disabled, weakened, or retuned.
struct SentryHangTrackingPolicyTests {
  @Test func appHangTrackingStaysEnabledAtTheLockedThreshold() {
    #expect(SentryHangTrackingPolicy.isTrackingEnabled == true)
    #expect(SentryHangTrackingPolicy.timeoutInterval == 2.0)
  }

  @Test func sentryStartAppliesTheLockedHangTrackingPolicy() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Core/Observability/SentryObservabilityProvider.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(
      source.contains("options.enableAppHangTracking = SentryHangTrackingPolicy.isTrackingEnabled")
    )
    #expect(
      source.contains("options.appHangTimeoutInterval = SentryHangTrackingPolicy.timeoutInterval")
    )
  }
}
