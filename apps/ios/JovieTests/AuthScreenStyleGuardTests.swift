import Foundation
import Testing
@testable import Jovie

struct AuthScreenStyleGuardTests {
  @Test func waitlistPendingUsesStandaloneAccountSwitchInsteadOfAppShell() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/App/RootView.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    let routeStart = try #require(source.range(of: "case .waitlistPending:"))
    let readyStart = try #require(
      source.range(of: "case .ready:", range: routeStart.upperBound..<source.endIndex)
    )
    let routeSource = source[routeStart.lowerBound..<readyStart.lowerBound]

    #expect(routeSource.contains("WaitlistPendingView(onUseDifferentAccount: onLogout)"))
    #expect(source.contains("accessibilityIdentifier(\"waitlist-use-different-account\")"))
    #expect(source.contains("accessibilityIdentifier(\"waitlist-pending\")"))
    #expect(source.contains(".disabled(isSwitchingAccount)"))
    #expect(source.contains("ScrollView"))
    #expect(source.contains("WaitlistPendingLayout.reservedActionMinHeight"))
    #expect(source.contains(".opacity(isSwitchingAccount ? 1 : 0)"))
    #expect(!source.contains("if isSwitchingAccount {\n                ProgressView()"))
    #expect(source.contains("WaitlistPendingLayout.contentMinHeight"))
    #expect(source.contains("alignment: .center"))
    #expect(source.contains(".scrollBounceBehavior(.basedOnSize)"))
  }

  @Test func waitlistActionCopyStaysStableAcrossSwitchingState() {
    #expect(
      WaitlistPendingLayout.actionTitle(isSwitchingAccount: false) == "Use a Different Account"
    )
    #expect(
      WaitlistPendingLayout.actionTitle(isSwitchingAccount: true) == "Switching Account…"
    )
    #expect(WaitlistPendingLayout.maxContentWidth == 420)
    #expect(WaitlistPendingLayout.reservedActionMinHeight == 48)
  }

  @Test func waitlistPendingCentersShortContentInTheSafeAreaViewport() {
    #expect(WaitlistPendingLayout.contentMaxWidth == 420)
    #expect(WaitlistPendingLayout.contentMinHeight(viewportHeight: 812) == 812)
    #expect(WaitlistPendingLayout.contentMinHeight(viewportHeight: 0) == 0)
    #expect(WaitlistPendingLayout.contentMinHeight(viewportHeight: -20) == 0)
  }

  @Test func continueInBrowserLoadingSpinnerUsesNeutralForeground() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Auth/AuthScreen.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    let buttonStart = try #require(source.range(of: "private struct ContinueInBrowserButton: View"))
    let buttonEnd = try #require(source.range(of: "private struct AuthErrorText: View"))
    let buttonSource = source[buttonStart.lowerBound..<buttonEnd.lowerBound]

    #expect(buttonSource.contains(".tint(JovieColor.backgroundBase)"))
    #expect(!buttonSource.contains(".tint(JovieColor.accentBlue)"))
  }

  /// System B token guard: JovieTheme must carry the canonical carbon-palette
  /// values from apps/web/styles/design-system.css and none of the pre-System-B
  /// drifted hexes.
  @Test func themeTokensMatchSystemBCanon() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/DesignSystem/JovieTheme.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    // Canonical values present.
    #expect(source.contains("surface3 = Color(hex: 0x2A2C32)"))
    #expect(source.contains("accent = Color(hex: 0x7170FF)"))
    #expect(source.contains("accentBlue = Color(hex: 0x4D7DFF)"))
    #expect(source.contains("accentPurple = Color(hex: 0x9B4DFF)"))
    #expect(source.contains("accentPink = Color(hex: 0xEA4A9C)"))
    #expect(source.contains("accentOrange = Color(hex: 0xFFAB2E)"))
    #expect(source.contains("pressScale: CGFloat = 0.96"))
    #expect(source.contains("timingCurve(0.4, 0, 0.2, 1, duration: subtleDuration)"))
    #expect(source.contains("timingCurve(0.22, 1, 0.36, 1, duration: cinematicDuration)"))

    // Drifted values banned.
    #expect(!source.contains("0x0070F3"))
    #expect(!source.contains("0x8B5CF6"))
    #expect(!source.contains("0xFF0080"))
    #expect(!source.contains("0x1F2430"))
  }

  /// Staged entrance guard: the auth screen's first-appearance animation
  /// must drop translateY under Reduce Motion (opacity-only) and must never
  /// animate from a hard scale(0)/hidden state that would jank on appear.
  @Test func authEntranceRespectsReduceMotionAndNeverStartsFromZeroScale() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Auth/AuthScreen.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    let modifierStart = try #require(source.range(of: "private struct AuthEntranceModifier: ViewModifier"))
    let modifierSource = source[modifierStart.lowerBound...]

    #expect(modifierSource.contains("reduceMotion ? 0 : (hasAppeared ? 0 : offset)"))
    #expect(!modifierSource.contains("scaleEffect"))
  }
}
