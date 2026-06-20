import Foundation

/// Canonical iOS performance budgets. CI guard tests lock these values so
/// regressions past budget hard-block merge. iOS perf is weighted above web.
enum PerformanceBudgets {
  /// Product target for cold launch to interactive shell (ms).
  static let coldLaunchMilliseconds = 400

  /// Maximum hitch rate on ProMotion displays (ms/s).
  static let hitchRateMillisecondsPerSecond = 5.0

  /// Maximum single frame duration at 120 Hz (ms).
  static let maxFrameMilliseconds = 8.3

  /// Shell tab transition budget used by UI-test evidence (ms).
  static let shellTransitionMilliseconds = 3_000

  /// Signed-out launch readiness timeout for XCTest evidence (s).
  static let launchReadinessTimeoutSeconds = 4.0

  /// Dashboard god-view line ceiling per focused source file.
  static let dashboardViewMaxLines = 220
  static let dashboardAvatarViewMaxLines = 120
  static let qrCodeCardViewMaxLines = 80
  static let dashboardAppleWalletMaxLines = 90
}