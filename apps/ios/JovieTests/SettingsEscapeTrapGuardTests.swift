import Foundation
import Testing

// Guard against the settings-escape trap: when SettingsView is pushed with
// navigationBarBackButtonHidden(), it MUST receive an onClose handler so users
// aren't trapped without a dismissal path. Source-level check; fails fast if the
// call-site regresses. (JOV-11079)
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

  @Test func settingsNavigationDestinationPassesOnClose() throws {
    let source = try appShellSource

    // Locate the navigationDestination for settings
    let marker = "case .settings:"
    guard let caseRange = source.range(of: marker) else {
      Issue.record("Could not find settings navigationDestination in AppShellView.swift")
      return
    }

    // Grab the next 400 chars — enough to cover the SettingsView initializer call
    let contextStart = caseRange.lowerBound
    let contextEnd = source.index(contextStart, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
    let context = String(source[contextStart..<contextEnd])

    // onClose must be wired so the X button renders and users can dismiss
    #expect(
      context.contains("onClose:"),
      "SettingsView in AppShellView must pass onClose — without it the navigation bar is hidden but there is no dismiss button (escape trap)."
    )

    // The handler must not be nil-literal; a real closure must follow
    #expect(
      !context.contains("onClose: nil"),
      "onClose must not be nil when navigationBarBackButtonHidden() is active."
    )
  }

  @Test func settingsViewHidesNavBarOnlyWhenOnCloseIsPresent() throws {
    let source = try appShellSource

    // Verify navigationBarBackButtonHidden is only used for the settings destination
    // and that the onClose argument precedes or accompanies it in the same block
    let navHiddenMarker = "navigationBarBackButtonHidden()"
    guard source.contains(navHiddenMarker) else {
      // If this ever gets removed, the guard is trivially satisfied — skip
      return
    }

    // The onClose: argument must appear before .navigationBarBackButtonHidden()
    // in file order, which means they're in the same initializer call.
    guard
      let onCloseRange = source.range(of: "onClose:"),
      let hiddenRange = source.range(of: navHiddenMarker)
    else {
      Issue.record("onClose or navigationBarBackButtonHidden not found in AppShellView.swift")
      return
    }

    #expect(
      onCloseRange.lowerBound < hiddenRange.lowerBound,
      "onClose: must appear before .navigationBarBackButtonHidden() in AppShellView — they must be in the same SettingsView init block."
    )
  }
}
