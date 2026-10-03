import Foundation
import Testing
@testable import Jovie

// Guard against the settings-escape trap: Settings is presented as a native
// full-screen cover with its own NavigationStack. It MUST receive an onClose
// handler so the Done button can dismiss (JOV-11079 / JOV-5201).
struct SettingsEscapeTrapGuardTests {
  private var appShellSource: String {
    get throws {
      let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Jovie/Features/AppShell/AppShellView.swift")
      return try String(contentsOf: url, encoding: .utf8)
    }
  }

  private var settingsSource: String {
    get throws {
      let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Jovie/Features/Settings/SettingsView.swift")
      return try String(contentsOf: url, encoding: .utf8)
    }
  }

  @Test func settingsCoverPassesOnClose() throws {
    let source = try appShellSource
    #expect(
      source.contains("NavigationStack {"),
      "AppShellView must keep a NavigationStack host so MobileChatView keyboard toolbar items can render."
    )
    #expect(source.contains("fullScreenCover(isPresented: $isShowingSettings)"))
    #expect(
      source.contains("onClose: { isShowingSettings = false }"),
      "SettingsView in AppShellView must pass onClose — without it the native toolbar has no dismiss path."
    )
    #expect(!source.contains("onClose: nil"))
    #expect(
      source.contains("showsWorkspaceSwitch: showsWorkspaceSwitch"),
      "Settings cover must forward the admin workspace switch from AppShellView."
    )
    #expect(!source.contains("navigationPath.append(.settings)"))
  }

  @Test func settingsUsesNativeGroupedListAndToolbar() throws {
    let source = try settingsSource
    #expect(source.contains("List {"))
    #expect(source.contains(".listStyle(.insetGrouped)"))
    #expect(source.contains(".navigationTitle(\"Settings\")"))
    #expect(source.contains("accessibilityLabel(\"Close Settings\")"))
    #expect(source.contains(".toolbarBackground(.automatic, for: .navigationBar)"))
    #expect(source.contains("settings-workspace-switch"))
    #expect(source.contains("LabeledContent(\"Workspace\""))
    #expect(source.contains("if isLoggingOut {\n              ProgressView()"))
    #expect(source.contains(".tint(JovieColor.textPrimary)"))
    #expect(source.contains(".frame(width: 20, height: 20)"))
    #expect(!source.contains("ProgressView()\n            .controlSize(.small)\n            .opacity"))
  }

  @Test func settingsViewHidesNavBarOnlyWhenOnCloseIsPresent() throws {
    let source = try appShellSource
    let navHiddenMarker = "navigationBarBackButtonHidden()"
    guard source.contains(navHiddenMarker) else {
      return
    }

    guard
      let onCloseRange = source.range(of: "onClose: { isShowingSettings = false }"),
      let hiddenRange = source.range(of: navHiddenMarker)
    else {
      Issue.record("onClose or navigationBarBackButtonHidden not found in AppShellView.swift")
      return
    }

    #expect(
      onCloseRange.lowerBound < hiddenRange.lowerBound,
      "onClose must appear before .navigationBarBackButtonHidden() in the Settings cover."
    )
  }
}

struct SettingsStyleGuardTests {
  private var settingsSource: String {
    get throws {
      let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Jovie/Features/Settings/SettingsView.swift")
      return try String(contentsOf: url, encoding: .utf8)
    }
  }

  @Test func settingsUsesNativeLinksLabeledContentAndLiquidGlass() throws {
    let source = try settingsSource

    #expect(source.contains("Link(destination:"))
    #expect(source.contains("LabeledContent"))
    #expect(source.contains("Toggle(isOn: $isBiometricLockEnabled)"))
    #expect(source.contains("settings-biometric-lock-toggle"))
    #expect(source.contains(".jovieSurface(radius: JovieRadius.medium"))
    #expect(source.contains(".jovieSurface(radius: JovieRadius.medium, interactive: true)"))
    #expect(source.contains("SettingsLayout.reservedActionMinHeight"))
    #expect(!source.contains(".textCase(.uppercase)"))
    // A custom ButtonStyle on a List-row Link/Button swallows taps on iOS 26
    // (UITest-verified in the JOV-5202 merge-group lane), so Settings rows
    // must keep the native press feedback.
    #expect(!source.contains(".buttonStyle(JoviePressFeedbackButtonStyle"))
    #expect(!source.contains("SettingsRowButtonStyle"))
    #expect(!source.contains("JovieColor.surface0, in: RoundedRectangle"))
    #expect(!source.contains("if isLoggingOut {\n          ProgressView()"))
    #expect(!source.contains("URL(string: \"https://jov.ie/support\")!"))
  }

  @Test func logoutCopyAndReservedHeightStayStableAcrossBusyState() {
    #expect(SettingsLayout.logoutTitle(isLoggingOut: false) == "Log Out")
    #expect(SettingsLayout.logoutTitle(isLoggingOut: true) == "Logging Out")
    #expect(SettingsLayout.reservedActionMinHeight == 48)
  }

  @Test func settingsExternalURLsAreWellFormed() {
    #expect(SettingsExternalURL.support?.absoluteString == "https://jov.ie/support")
    #expect(SettingsExternalURL.privacy?.absoluteString == "https://jov.ie/legal/privacy")
    #expect(SettingsExternalURL.terms?.absoluteString == "https://jov.ie/legal/terms")
  }
}

// JOV-7534: Settings reports Apple-controlled release provenance (App Store vs
// TestFlight) and exact commit identity; it never implies an in-app channel
// switch is possible.
struct ReleaseChannelGuardTests {
  @Test func provenanceDerivationMatchesAppleReceiptNames() {
    #expect(AppBuildInfo.provenance(receiptName: "receipt", isDebugBuild: false) == .appStore)
    #expect(AppBuildInfo.provenance(receiptName: "sandboxReceipt", isDebugBuild: false) == .testFlight)
    #expect(AppBuildInfo.provenance(receiptName: nil, isDebugBuild: false) == .unknown)
    #expect(AppBuildInfo.provenance(receiptName: "unexpected", isDebugBuild: false) == .unknown)
  }

  @Test func provenanceDisplayNamesAreHonest() {
    #expect(AppDistributionProvenance.appStore.displayName == "App Store")
    #expect(AppDistributionProvenance.testFlight.displayName == "TestFlight")
    #expect(AppDistributionProvenance.development.displayName == "Development")
    #expect(AppDistributionProvenance.unknown.displayName == "Unknown")
  }

  @Test func shortCommitOnlyTruncatesLongSHAs() {
    let long = AppBuildInfo(
      version: "1.0", build: "1", provenance: .testFlight,
      commit: "d12f22983e2ec0a4ea2a3b411708a181633b6a2c"
    )
    #expect(long.shortCommit == "d12f229")
    let short = AppBuildInfo(version: "1.0", build: "1", provenance: .appStore, commit: "abc123")
    #expect(short.shortCommit == "abc123")
    let none = AppBuildInfo(version: "1.0", build: "1", provenance: .development, commit: nil)
    #expect(none.shortCommit == nil)
  }

  @Test(arguments: [nil, "abc123", "d12f22983e2ec0a4ea2a3b411708a181633b6a2c"] as [String?])
  func commitDetailsStayOnTheAdminSurface(commit: String?) {
    let info = AppBuildInfo(version: "1.0", build: "1", provenance: .appStore, commit: commit)
    #expect(info.displayedCommit(isAdmin: false) == nil)
    #expect(info.displayedCommit(isAdmin: true) == info.shortCommit)
    #expect(info.version == "1.0")
    #expect(info.build == "1")
    #expect(info.channel == .stable)
  }

  @Test func currentBuildInfoCarriesProvenance() {
    #if DEBUG
      #expect(AppBuildInfo.current().provenance == .development)
      #expect(AppBuildInfo.current().channel == nil)
    #endif
  }

  @Test func settingsSourceExposesProvenanceAndAdminOnlyTestFlightEntry() throws {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Settings/SettingsView.swift")
    let source = try String(contentsOf: url, encoding: .utf8)

    #expect(source.contains("LabeledContent(\"Channel\", value: channel.displayName)"))
    #expect(source.contains("settings-release-channel"))
    #expect(source.contains("settings-build-commit"))
    #expect(source.contains("buildInfo.displayedCommit(isAdmin: showsWorkspaceSwitch)"))
    #expect(source.contains("https://testflight.apple.com"))
    // Admin gate + Apple-controlled install surface; no in-app channel toggle.
    #expect(source.contains("showsWorkspaceSwitch, buildInfo.provenance != .testFlight"))
    #expect(source.contains("settings-open-testflight"))
    #expect(!source.contains("switchChannel"))
    #expect(!source.contains("Join Beta"))
    #expect(!source.contains("appStoreReceiptURL?.lastPathComponent == \"sandboxReceipt\""),
            "Channel derivation must stay inside AppBuildInfo.provenance(receiptName:isDebugBuild:).")
  }

  @Test func testflightURLOpensAppleEnrollmentSurface() {
    #expect(SettingsExternalURL.testflight?.absoluteString == "https://testflight.apple.com")
  }
}
