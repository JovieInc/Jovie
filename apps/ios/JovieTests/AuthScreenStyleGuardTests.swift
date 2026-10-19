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

  @Test func continueInBrowserButtonPaddingStaysInsideHitTarget() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Auth/AuthScreen.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    let buttonStart = try #require(source.range(of: "private struct ContinueInBrowserButton: View"))
    let buttonEnd = try #require(source.range(of: "private struct AuthErrorText: View"))
    let buttonSource = source[buttonStart.lowerBound..<buttonEnd.lowerBound]

    #expect(buttonSource.contains("private static let minimumHitTargetHeight: CGFloat = 44"))
    #expect(buttonSource.contains("private static var minimumHitTargetPadding: CGFloat"))
    let hasHitTargetPaddingInsideLabel = buttonSource.range(
      of: #"\.padding\(\.vertical,\s*Self\.minimumHitTargetPadding\)\s*\.contentShape\(Rectangle\(\)\)"#,
      options: .regularExpression
    ) != nil
    #expect(hasHitTargetPaddingInsideLabel)

    let hasLegacyOuterPadding = buttonSource.range(
      of: #"\.contentShape\(Rectangle\(\)\)\s*\}\s*\.padding\(\.vertical,\s*6\)"#,
      options: .regularExpression
    ) != nil
    #expect(!hasLegacyOuterPadding)
  }

  /// Read the actual canonical JSON instead of preserving a second list of expected hexes.
  @Test func themeTokensMatchSystemBCanon() throws {
    let repo = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent()
    let source = try String(contentsOf: repo.appendingPathComponent("apps/ios/Jovie/DesignSystem/JovieTheme.swift"), encoding: .utf8)
    let manifestData = try Data(contentsOf: repo.appendingPathComponent("apps/ios/scripts/native-design-system.manifest.json"))
    let manifest = try #require(JSONSerialization.jsonObject(with: manifestData) as? [String: Any])
    let bindings = try #require(manifest["bindings"] as? [[String]])
    let palettePath = try #require(manifest["palette"] as? String)
    let paletteData = try Data(contentsOf: repo.appendingPathComponent(palettePath))
    let palette = try #require(JSONSerialization.jsonObject(with: paletteData) as? [String: Any])
    let names = bindings.map { $0[0] }
    #expect(Set(names).count == names.count)
    var mappedPaths = Set<String>()
    for binding in bindings {
      #expect(binding.count == 2)
      guard !binding[1].hasPrefix("--") else { continue }
      let path = binding[1].components(separatedBy: ".")
      let name = binding[0]
      #expect(mappedPaths.insert(path.joined(separator: ".")).inserted)
      var value: Any = palette
      for key in path { value = try #require((value as? [String: Any])?[key]) }
      let canonicalHex = try #require(value as? String)
      let hex = canonicalHex.dropFirst().uppercased()
      let declaration = "static let \(name) = Color(hex: 0x\(hex))"
      #expect(source.components(separatedBy: declaration).count == 2)
    }
    for (group, prefix) in [("elevations", "elevations.dark"), ("accents", "accents.hex")] {
      let family = try #require(palette[group] as? [String: Any])
      let roles = try #require(family["roles"] as? [String])
      for role in roles { #expect(mappedPaths.contains("\(prefix).\(role)")) }
    }
    #expect(source.contains("static let errorText = textPrimary"))
    #expect(source.contains("static let artist = JovieColor.accentPurple"))
    #expect(source.contains("static let event = JovieColor.accentOrange"))
    // These existing motion contracts are outside the palette slice and remain protected.
    #expect(source.contains("pressScale: CGFloat = 0.96"))
    #expect(source.contains("timingCurve(0.4, 0, 0.2, 1, duration: subtleDuration)"))
    #expect(source.contains("timingCurve(0.22, 1, 0.36, 1, duration: cinematicDuration)"))
  }

  @Test func productionWhatsNewFixturesUseTheRealResolverAndDestinations() throws {
    let single = try #require(WhatsNewUITestFixture.unseen(arguments: []))
    let multiple = try #require(WhatsNewUITestFixture.unseen(arguments: ["-ui-testing-whats-new-multiple"]))
    #expect(single.unseenCount == 1)
    #expect(single.link == single.entry.url)
    #expect(multiple.unseenCount == 2)
    #expect(multiple.link.path == "/changelog")
    let empty = try #require(WhatsNewUITestFixture.unseen(arguments: ["-ui-testing-whats-new-no-dogfood"]))
    #expect(empty.entry.dogfood.isEmpty)
    let long = try #require(WhatsNewUITestFixture.unseen(arguments: ["-ui-testing-whats-new-long"]))
    #expect(long.entry.title.count > single.entry.title.count)
    #expect(long.entry.summary.count > single.entry.summary.count)
    let feed = WhatsNewFeed(version: WhatsNewFeed.contractVersion, changelogUrl: multiple.link, entries: [single.entry])
    #expect(WhatsNewFeedPolicy.resolve(feed: feed, lastSeenID: single.id) == nil)
    #expect(WhatsNewFeedPolicy.resolve(feed: feed, lastSeenID: "aged-out")?.unseenCount == 1)
  }

  @Test func neutralPillKeepsCompactPaintAndAtLeast44PointHitArea() {
    #expect(JoviePillButtonStyle.visibleHeight == 28)
    #expect(JoviePillButtonStyle.visibleHeight + 2 * JoviePillButtonStyle.hitInset >= JoviePillButtonStyle.minimumHitHeight)
    // Locked chat controls retain their independent existing 32-point geometry.
    #expect(JovieActionButtonMetrics.height == 32)
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
