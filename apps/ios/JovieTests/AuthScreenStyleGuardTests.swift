import Foundation
import Testing

struct AuthScreenStyleGuardTests {
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
