import Foundation
import Testing
@testable import Jovie

// JOV-6095: executable route/state manifest. These tests certify that the
// shipped route graph declared in AppRouteManifest stays coherent with the
// compiled routes, and that the rendered navigation affordances the manifest
// names still exist in source — not just policy constants.
struct AppRouteManifestTests {
  private static func jovieSource(_ relativePath: String) throws -> String {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent(relativePath)
    return try String(contentsOf: url, encoding: .utf8)
  }

  @Test func manifestIsVersionedAndCoherent() {
    #expect(AppRouteManifest.version >= 1)
    #expect(AppRouteManifest.validate().isEmpty)
  }

  @Test func everyRootRouteIsClassified() {
    for route in AppRouter.allCases {
      let entry = AppRouteManifest.entry(id: "root.\(route)")
      #expect(entry != nil, "root.\(route) missing from manifest")
      #expect(entry?.classification == .shipped)
    }
  }

  @Test func everyShellSurfaceHasShippedOrGatedManifestEntry() {
    for tab in AppShellTab.allCases {
      let entry = AppRouteManifest.entry(id: "surface.\(tab)")
      #expect(entry != nil, "surface.\(tab) missing from manifest")
      #expect(entry?.classification == .shipped || entry?.classification == .gated)
      // Sidebar labels must agree with the destination they open.
      #expect(entry?.title == tab.title)
    }
  }

  @Test func drawerSidebarDestinationsMatchManifestSurfaces() {
    let rendered = AppShellPanePolicy.sidebarDestinations(
      chatEnabled: true, audienceEnabled: true
    )
    #expect(Set(rendered) == Set(AppShellTab.allCases))

    let chatOff = AppShellPanePolicy.sidebarDestinations(
      chatEnabled: false, audienceEnabled: true
    )
    #expect(chatOff.contains(.chat) == false)
    #expect(AppRouteManifest.entry(id: "surface.chat")?.gate != nil)

    let audienceOff = AppShellPanePolicy.sidebarDestinations(
      chatEnabled: true, audienceEnabled: false
    )
    #expect(audienceOff.contains(.audience) == false)
    #expect(AppRouteManifest.entry(id: "surface.audience")?.gate != nil)
  }

  @Test func everyIntentKindHasAManifestLanding() {
    #expect(IntentNavigationRequest.auditRepresentatives.count == 8)
    for intent in IntentNavigationRequest.auditRepresentatives {
      switch intent {
      case .openChat:
        #expect(AppRouteManifest.entry(id: "intent.openChat") != nil)
      case .sendMessage:
        #expect(AppRouteManifest.entry(id: "intent.sendMessage") != nil)
      case .startVoiceCapture:
        #expect(AppRouteManifest.entry(id: "intent.startVoiceCapture") != nil)
      case .startEyesFreeCapture:
        #expect(AppRouteManifest.entry(id: "intent.startEyesFreeCapture") != nil)
      case .continueLastConversation:
        #expect(AppRouteManifest.entry(id: "intent.continueLastConversation") != nil)
      case .openConversation:
        #expect(AppRouteManifest.entry(id: "intent.openConversation") != nil)
      case .openSettings:
        #expect(AppRouteManifest.entry(id: "intent.openSettings") != nil)
      }
    }
  }

  @Test func everyLaunchModeIsClassified() {
    for mode in LaunchMode.allCases {
      switch mode {
      case .live, .uiTestingLiveAuth, .uiTestingRealBrowserAuth:
        #expect(mode.usesLiveAuth, "\(mode) must resolve a live session path")
      default:
        #expect(mode.usesLiveAuth == false, "\(mode) is a UI-test fixture, not a live path")
      }
    }
    // No launch mode may leave the route graph unexplained: every mode lands
    // on an AppRouter case covered by the manifest.
    #expect(AppRouteManifest.entries(classification: .unreachable).isEmpty)
    #expect(AppRouteManifest.entries(classification: .deprecated).isEmpty)
  }

  // JOV-7632: every web-only path the boundary guards must be documented in
  // the manifest, and no web-only entry may present as an in-app surface.
  @Test func webOnlyBoundariesAreDocumented() {
    let webOnly = AppRouteManifest.entries(classification: .webOnly)
    #expect(webOnly.count == MobileWebOnlyRouteBoundary.pathPrefixes.count + 1)
    for prefix in MobileWebOnlyRouteBoundary.pathPrefixes {
      #expect(
        webOnly.contains { $0.stateOwner.contains(prefix) },
        "\(prefix) must be documented as web-only"
      )
    }
    // Merch checkout (/<handle>/merch/<cardId>) is web-only too but lives
    // outside /app/*, so it is documented without a boundary prefix.
    #expect(webOnly.contains { $0.id == "webOnly.merchCheckout" })
    for entry in webOnly {
      #expect(entry.presentation == .externalLink, "\(entry.id) must leave the app")
    }
  }

  @Test func liveRoutesDeclareVisibleEntryAndExit() {
    for route in AppRouteManifest.entries
    where route.classification == .shipped || route.classification == .gated {
      #expect(!route.entry.isEmpty, "\(route.id) needs a visible entry")
      #expect(!route.exit.isEmpty, "\(route.id) needs a predictable exit")
      #expect(!route.stateOwner.isEmpty, "\(route.id) needs a state owner")
    }
  }

  // Golden: the drawer rows that realize surface.* routes still render with
  // resolvable identifiers and selected-state traits.
  @Test func drawerRendersNamedSurfaceRows() throws {
    let source = try Self.jovieSource("Jovie/Features/AppShell/AppShellLeftDrawer.swift")
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer-surface-\(tab.accessibilityID)")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer-settings")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer-new-chat")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer-talk")"#))
    #expect(source.contains(".accessibilityAddTraits(isSelected ? [.isSelected] : [])"))
    #expect(source.contains("AppShellPanePolicy.rootDestinations("))
  }

  // Golden: the shell toolbar renders the drawer button, a single Actions
  // overflow menu, and the selected surface's title — not a tab bar.
  @Test func shellToolbarRendersDrawerAndSingleActionsMenu() throws {
    let source = try Self.jovieSource("Jovie/Features/AppShell/AppShellView.swift")
    #expect(source.contains(#".accessibilityIdentifier("shell-drawer-open")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-actions-menu")"#))
    #expect(source.contains("Text(selectedTab.title)"))
    #expect(source.contains(#".accessibilityIdentifier("shell-vlog-open")"#))
    #expect(source.contains(#".accessibilityIdentifier("shell-talk-fab")"#))
    #expect(source.contains(#".accessibilityLabel("Open Settings")"#))
    #expect(!source.contains("TabView"), "chat-first shell must not mount a TabView")
  }

  // Golden: each mounted presentation the manifest declares still exists.
  @Test func shellPresentationsMatchManifest() throws {
    let source = try Self.jovieSource("Jovie/Features/AppShell/AppShellView.swift")
    #expect(source.contains(".sheet(item: $entityContext)"), "sheet.entityContext")
    #expect(source.contains(".sheet(item: $videoPlaybackAsset)"), "sheet.libraryVideoPlayer")
    #expect(
      source.contains(".fullScreenCover(item: $publicProfileBrowserItem)"),
      "cover.publicProfileBrowser"
    )
    #expect(
      source.contains(".fullScreenCover(isPresented: $isShowingProfileQR)"),
      "cover.profileQR"
    )
    #expect(
      source.contains(".fullScreenCover(isPresented: $isShowingSettings)"),
      "cover.settings"
    )
    #expect(source.contains("TalkOverlayView("), "overlay.talk")
    #expect(source.contains("TeleprompterOverlayView("), "overlay.teleprompter")
    #expect(source.contains("LibraryItemScreen("), "screen.libraryItem")
  }

  // Golden: Settings keeps the native large-title collapse and a Done exit.
  @Test func settingsKeepsNativeTitleCollapseAndDoneExit() throws {
    let source = try Self.jovieSource("Jovie/Features/Settings/SettingsView.swift")
    #expect(source.contains(#".navigationTitle("Settings")"#))
    #expect(source.contains(".navigationBarTitleDisplayMode(.large)"))
    #expect(source.contains(".toolbarBackground(.automatic, for: .navigationBar)"))
    #expect(source.contains(#"Button("Done", action: onClose)"#))
    #expect(source.contains(#".accessibilityLabel("Close Settings")"#))
    #expect(source.contains(#".accessibilityIdentifier("settings-view")"#))
  }

  // Golden: dashboard share uses the system share sheet, and root sheets the
  // manifest declares are still mounted on RootView.
  @Test func shareAndRootSheetsMatchManifest() throws {
    let dashboard = try Self.jovieSource("Jovie/Features/Dashboard/DashboardView.swift")
    #expect(dashboard.contains("ShareLink(item:"), "system.shareProfile")
    #expect(dashboard.contains(#".accessibilityIdentifier("dashboard-share-profile-button")"#))

    let root = try Self.jovieSource("Jovie/App/RootView.swift")
    #expect(root.contains(".sheet(isPresented: $showWhatsNew"), "sheet.whatsNewVersioned")
    #expect(root.contains(".sheet(item: $changelogWhatsNew)"), "sheet.whatsNewChangelog")
  }

  // Golden: horizontal pans open rails, never switch surfaces — root-swipe
  // arbitration vs chart/photo scrubbing stays policy-owned and test-covered.
  @Test func horizontalSwipesNeverSwitchSurfaces() {
    #expect(AppShellGesturePolicy.shouldSwitchTabFromHorizontalSwipe() == false)
    #expect(AppShellGesturePolicy.allowsFullWidthRailSwipe(selectedTab: .chat))
    for tab in AppShellTab.allCases where tab != .chat {
      #expect(
        AppShellGesturePolicy.allowsFullWidthRailSwipe(selectedTab: tab) == false,
        "\(tab) must keep thumb-sized edge drags for its own scrubbing"
      )
    }
    #expect(AppShellPanePolicy.paneAfterLeadingSwipe(current: .none) == .sidebar)
    #expect(AppShellPanePolicy.paneAfterTrailingSwipe(current: .none) == .rail)
    #expect(AppShellPanePolicy.paneAfterDismiss() == .none)
  }
}
