import Foundation

/// Lifecycle classification for every destination reachable — or deliberately
/// unreachable — in the release route graph (JOV-6095).
enum AppRouteClassification: String, Equatable, Sendable {
  /// Reachable in release builds for entitled users.
  case shipped
  /// Shipped, but only when a runtime gate (chatEnabled, admin, QR payload)
  /// opens the entry affordance.
  case gated
  /// Only reachable via `-ui-testing-*` launch arguments.
  case uiTestOnly
  /// Only compiled or armed in DEBUG builds.
  case debugOnly
  /// Kept for reference; no live entry point.
  case deprecated
  /// Declared but no path leads to it.
  case unreachable
  /// Intentionally served by the web app only (JOV-7632). The AASA excludes
  /// the path from universal links and `MobileWebOnlyRouteBoundary` hands any
  /// stragglers back to Safari; no in-app surface may claim the destination.
  case webOnly
}

/// How a destination is mounted or left.
enum AppRoutePresentation: String, Equatable, Sendable {
  /// `AppState.route` switch in RootView (cold/warm launch gate).
  case rootSwap
  /// `AppShellTab` selection inside the shell's paged content.
  case surfacePane
  /// Recessed left drawer plane (leading rail).
  case drawerPane
  /// Trailing right rail plane (entity context).
  case railPane
  /// In-shell full-screen overlay (Talk, teleprompter).
  case overlay
  /// `.sheet` presentation.
  case sheet
  /// `.fullScreenCover` presentation.
  case fullScreenCover
  /// Screen swapped inside a surface pane (LibraryItemScreen).
  case inPaneScreen
  /// Leaves the app via `Link`/Safari.
  case externalLink
  /// `ShareLink` / system share sheet.
  case systemShare
  /// `confirmationDialog`.
  case confirmation
  /// App Intent / deep-link ingress that lands on another route.
  case intent
}

/// One row of the shipped route/state manifest: route → source → user task →
/// state owner → entry/exit contract → executed test.
struct AppRouteEntry: Equatable, Sendable {
  /// Stable dotted identifier, e.g. `surface.chat`, `cover.settings`.
  let id: String
  /// User-visible title where one exists; empty for system presentations.
  let title: String
  let classification: AppRouteClassification
  let presentation: AppRoutePresentation
  /// Primary source file, relative to `apps/ios/`.
  let source: String
  /// The user task this route serves.
  let userTask: String
  /// Type or `@State` that owns the route's visibility/selection.
  let stateOwner: String
  /// The visible entry affordance (row, button, swipe, deep link).
  let entry: String
  /// How the user leaves: back vs dismiss vs swipe alternative.
  let exit: String
  /// Runtime gate that must hold for `entry` to be visible, if any.
  let gate: String?
  /// Tracking issue covering the contract, if any.
  let issue: String?
  /// Test that executes or goldens this route, if any.
  let test: String?

  init(
    id: String,
    title: String = "",
    classification: AppRouteClassification,
    presentation: AppRoutePresentation,
    source: String,
    userTask: String,
    stateOwner: String,
    entry: String,
    exit: String,
    gate: String? = nil,
    issue: String? = nil,
    test: String? = nil
  ) {
    self.id = id
    self.title = title
    self.classification = classification
    self.presentation = presentation
    self.source = source
    self.userTask = userTask
    self.stateOwner = stateOwner
    self.entry = entry
    self.exit = exit
    self.gate = gate
    self.issue = issue
    self.test = test
  }
}

/// One representative value per intent kind so the manifest can be checked
/// exhaustively without making the enum `CaseIterable`.
extension IntentNavigationRequest {
  static var auditRepresentatives: [IntentNavigationRequest] {
    [
      .openChat,
      .sendMessage(text: "audit", autoSend: false),
      .sendMessage(text: "audit", autoSend: true),
      .startVoiceCapture,
      .startEyesFreeCapture(
        EyesFreeCaptureLaunch(
          destination: .jovie,
          spokenText: nil,
          idempotencyKey: "audit"
        )
      ),
      .continueLastConversation,
      .openConversation("audit-conversation"),
      .openSettings,
    ]
  }
}

/// Versioned, executable census of the iOS route graph (JOV-6095). Bump
/// `version` whenever a route is added, reclassified, or removed.
enum AppRouteManifest {
  static let version = 3

  static let entries: [AppRouteEntry] = [
    // MARK: Root routes (AppState.route → RootView)

    AppRouteEntry(
      id: "root.launching",
      classification: .shipped,
      presentation: .rootSwap,
      source: "Jovie/Features/Splash/SplashView.swift",
      userTask: "Wait for the session/dashboard bootstrap to resolve",
      stateOwner: "AppState.route",
      entry: "Cold launch",
      exit: "Automatic cross-fade to signedOut/needsOnboarding/waitlistPending/ready",
      test: "JovieUITests splash coverage"
    ),
    AppRouteEntry(
      id: "root.signedOut",
      classification: .shipped,
      presentation: .rootSwap,
      source: "Jovie/Features/Auth/AuthScreen.swift",
      userTask: "Sign in or recover the account",
      stateOwner: "AppState.route",
      entry: "Cold launch without a session, expired session, logout",
      exit: "PKCE callback via MobileAuthCallbackURLInbox → ready/needsOnboarding",
      test: "MobileAuthFinalizationTests"
    ),
    AppRouteEntry(
      id: "root.needsOnboarding",
      classification: .shipped,
      presentation: .rootSwap,
      source: "Jovie/Features/NeedsOnboarding/NeedsOnboardingView.swift",
      userTask: "Complete display name and username",
      stateOwner: "AppState.route",
      entry: "Signed-in account without a completed profile",
      exit: "Complete → ready; expired session → signedOut",
      test: "-ui-testing-needs-onboarding UITest"
    ),
    AppRouteEntry(
      id: "root.waitlistPending",
      classification: .shipped,
      presentation: .rootSwap,
      source: "Jovie/App/RootView.swift",
      userTask: "See waitlist status or switch account",
      stateOwner: "AppState.route",
      entry: "Signed-in account pending approval",
      exit: "Use a Different Account → signedOut",
      test: "-ui-testing-waitlist-pending UITest"
    ),
    AppRouteEntry(
      id: "root.ready",
      classification: .shipped,
      presentation: .rootSwap,
      source: "Jovie/App/RootView.swift",
      userTask: "Use the app",
      stateOwner: "AppState.route",
      entry: "Signed-in account with a completed profile",
      exit: "Session expiry → signedOut",
      issue: "JOV-5203",
      test: "AppStateTests, AppShellChatFirstTests"
    ),

    // MARK: Shell surfaces (AppShellTab selection)

    AppRouteEntry(
      id: "surface.chat",
      title: "Home",
      classification: .gated,
      presentation: .surfacePane,
      source: "Jovie/Features/Chat/MobileChatView.swift",
      userTask: "Talk to Jovie, draft and send messages",
      stateOwner: "AppShellView.selectedTab / ChatRepository",
      entry: "Drawer surface row, composer, deep link, App Intents; permanent home when enabled",
      exit: "Drawer surface switch; stays mounted as underlay",
      gate: "chatEnabled (dashboard response loaded)",
      issue: "JOV-5203",
      test: "AppShellChatFirstTests"
    ),
    AppRouteEntry(
      id: "surface.library",
      title: "Work",
      classification: .shipped,
      presentation: .surfacePane,
      source: "Jovie/Features/Library/LibrarySurfaceView.swift",
      userTask: "Browse releases, products, videos, writing, and campaigns",
      stateOwner: "AppShellView.selectedTab + libraryHome",
      entry: "Drawer surface row; vlog save lands here",
      exit: "Drawer surface switch",
      issue: "JOV-5075"
    ),
    AppRouteEntry(
      id: "surface.calendar",
      title: "Calendar",
      classification: .shipped,
      presentation: .surfacePane,
      source: "Jovie/Features/Calendar/CalendarSurfaceView.swift",
      userTask: "Review the action-loop calendar",
      stateOwner: "AppShellView.selectedTab",
      entry: "Drawer surface row",
      exit: "Drawer surface switch; Ask Jovie → surface.chat",
      test: "-ui-testing-calendar UITest"
    ),
    AppRouteEntry(
      id: "surface.inbox",
      title: "Inbox",
      classification: .shipped,
      presentation: .surfacePane,
      source: "Jovie/Features/Inbox/InboxSurfaceView.swift",
      userTask: "Triage the action-loop inbox",
      stateOwner: "AppShellView.selectedTab",
      entry: "Drawer surface row",
      exit: "Drawer surface switch; Ask Jovie → surface.chat",
      test: "-ui-testing-inbox UITest"
    ),
    AppRouteEntry(
      id: "surface.profile",
      title: "Identity",
      classification: .shipped,
      presentation: .surfacePane,
      source: "Jovie/Features/Dashboard/DashboardView.swift",
      userTask: "Show QR, copy/share the public profile, add Wallet pass",
      stateOwner: "AppShellView.selectedTab",
      entry: "Drawer surface row; fallback home when chat is disabled",
      exit: "Drawer surface switch",
      test: "-ui-testing-ready UITest"
    ),
    AppRouteEntry(
      id: "surface.audience",
      title: "Audience",
      classification: .gated,
      presentation: .surfacePane,
      source: "Jovie/Features/Audience/AudienceHighlightsView.swift",
      userTask: "Read audience highlights",
      stateOwner: "AppShellView.selectedTab",
      entry: "Drawer surface row",
      exit: "Drawer surface switch; Ask Jovie → surface.chat",
      gate: "audienceEnabled",
      test: "-ui-testing-audience UITest"
    ),

    // MARK: Panes and overlays inside the shell

    AppRouteEntry(
      id: "pane.sidebar",
      title: "Surfaces",
      classification: .shipped,
      presentation: .drawerPane,
      source: "Jovie/Features/AppShell/AppShellLeftDrawer.swift",
      userTask: "Switch surface, find threads, open Settings/Talk/account",
      stateOwner: "AppShellView.isShowingDrawer + drawerDragOffset",
      entry: "Avatar button; leading edge swipe (full-width on chat home)",
      exit: "Tap outside / reverse swipe → pane dismisses; row select commits tab",
      issue: "JOV-5201",
      test: "AppShellChatFirstTests.drawerRowsRevealDuringInteractiveLeadingDrag"
    ),
    AppRouteEntry(
      id: "pane.rightRail",
      classification: .shipped,
      presentation: .railPane,
      source: "Jovie/Features/AppShell/EntityContextSheet.swift",
      userTask: "See context for the last tapped entity and act on it",
      stateOwner: "AppShellView.isShowingRightRail + railDragOffset",
      entry: "Trailing edge swipe; tapping an entity in chat",
      exit: "Right-edge swipe or Close → pane dismisses",
      issue: "JOV-5201",
      test: "AppShellChatFirstTests.shellRailGestureResetsOffsetsAndHonorsSubviewSuppression"
    ),
    AppRouteEntry(
      id: "overlay.talk",
      title: "Talk",
      classification: .gated,
      presentation: .overlay,
      source: "Jovie/Features/AppShell/TalkOverlayView.swift",
      userTask: "Speak a message hands-free",
      stateOwner: "AppShellView.isShowingTalkOverlay",
      entry: "Drawer Talk row, Actions ▸ Talk, composer mic, voice intents",
      exit: "Cancel; submit → surface.chat; failure may hand off a composer draft",
      gate: "chatEnabled; offline/chat-disabled surfaces an unavailable message",
      test: "AppShellIntentNavigationTests voice capture cases"
    ),
    AppRouteEntry(
      id: "overlay.teleprompter",
      title: "Vlog Mode",
      classification: .gated,
      presentation: .overlay,
      source: "Jovie/Features/Teleprompter/TeleprompterOverlayView.swift",
      userTask: "Record a scripted vlog take",
      stateOwner: "AppShellView.teleprompterProposal",
      entry: "Actions ▸ Vlog Mode or a chat video proposal",
      exit: "Close → shell; Save → surface.library",
      gate: "chatEnabled",
      issue: "JOV-5075",
      test: "-ui-testing-teleprompter fixture"
    ),
    AppRouteEntry(
      id: "sheet.entityContext",
      classification: .shipped,
      presentation: .sheet,
      source: "Jovie/Features/AppShell/EntityContextSheet.swift",
      userTask: "Inspect a tapped entity from chat or library",
      stateOwner: "AppShellView.entityContext",
      entry: "Entity tap in chat; library asset that opens as a sheet",
      exit: "Swipe down / dismiss; Edit in Chat → surface.chat with draft"
    ),
    AppRouteEntry(
      id: "screen.libraryItem",
      classification: .shipped,
      presentation: .inPaneScreen,
      source: "Jovie/Features/Library/LibrarySurfaceView.swift",
      userTask: "View one library asset",
      stateOwner: "AppShellView.selectedLibraryAsset",
      entry: "Tap a non-sheet library asset",
      exit: "Back → surface.library; Edit in Chat → surface.chat with draft"
    ),
    AppRouteEntry(
      id: "sheet.libraryVideoPlayer",
      classification: .shipped,
      presentation: .sheet,
      source: "Jovie/Features/AppShell/AppShellView.swift",
      userTask: "Play a locally stored video asset",
      stateOwner: "AppShellView.videoPlaybackAsset",
      entry: "Video asset with a local file URL",
      exit: "Swipe down / system player close",
      test: "library-video-player identifier"
    ),
    AppRouteEntry(
      id: "cover.publicProfileBrowser",
      classification: .gated,
      presentation: .fullScreenCover,
      source: "Jovie/Features/Dashboard/PublicProfileBrowserView.swift",
      userTask: "Open the embedded public profile",
      stateOwner: "AppShellView.publicProfileBrowserItem / DashboardView",
      entry: "Drawer account header or dashboard Open button",
      exit: "Browser close → shell",
      gate: "PublicProfileURLPolicy validates the URL",
      test: "PublicProfileBrowserMediaPolicyTests"
    ),
    AppRouteEntry(
      id: "cover.profileQR",
      title: "Profile QR",
      classification: .gated,
      presentation: .fullScreenCover,
      source: "Jovie/Features/Dashboard/VenueModeView.swift",
      userTask: "Show the venue-mode QR at full brightness",
      stateOwner: "AppShellView.isShowingProfileQR / DashboardView.isShowingVenueMode",
      entry: "Drawer QR button or dashboard QR button",
      exit: "Dismiss → origin surface; brightness restored",
      gate: "profile.qrPayload != nil",
      test: "-ui-testing-venue-mode UITest"
    ),
    AppRouteEntry(
      id: "sheet.appleWalletPass",
      classification: .shipped,
      presentation: .sheet,
      source: "Jovie/Features/Dashboard/AppleWalletViews.swift",
      userTask: "Add the profile pass to Apple Wallet",
      stateOwner: "DashboardView.appleWalletPassSheet",
      entry: "Dashboard Add to Wallet button",
      exit: "Sheet dismiss",
      test: "apple-wallet-profile-pass-button identifier"
    ),
    AppRouteEntry(
      id: "system.shareProfile",
      classification: .shipped,
      presentation: .systemShare,
      source: "Jovie/Features/Dashboard/DashboardView.swift",
      userTask: "Share the public profile URL",
      stateOwner: "SwiftUI ShareLink",
      entry: "Dashboard share-profile ShareLink",
      exit: "System sheet cancel/complete",
      test: "dashboard-share-profile-button identifier"
    ),

    // MARK: Settings (full-screen cover, native List)

    AppRouteEntry(
      id: "cover.settings",
      title: "Settings",
      classification: .shipped,
      presentation: .fullScreenCover,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Manage account, workspace, legal, logout",
      stateOwner: "AppShellView.isShowingSettings",
      entry: "Drawer Settings row; Actions ▸ Settings; /settings deep link; openSettings intent",
      exit: "Done (top-bar trailing) → shell; native large-title collapse preserved",
      test: "SettingsEscapeTrapGuardTests; -ui-testing-settings UITest"
    ),
    AppRouteEntry(
      id: "settings.manageAccount",
      title: "Manage Account",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Manage the account on the web",
      stateOwner: "Link",
      entry: "Settings ▸ Account row",
      exit: "Safari back to app"
    ),
    AppRouteEntry(
      id: "settings.billing",
      title: "Billing",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Manage billing",
      stateOwner: "Link",
      entry: "Settings ▸ Jovie row",
      exit: "Safari back to app"
    ),
    AppRouteEntry(
      id: "settings.support",
      title: "Support",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Get help",
      stateOwner: "Link",
      entry: "Settings ▸ Jovie row",
      exit: "Safari back to app"
    ),
    AppRouteEntry(
      id: "settings.privacy",
      title: "Privacy",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Read the privacy policy",
      stateOwner: "Link",
      entry: "Settings ▸ Jovie row",
      exit: "Safari back to app"
    ),
    AppRouteEntry(
      id: "settings.terms",
      title: "Terms",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Read the terms",
      stateOwner: "Link",
      entry: "Settings ▸ Jovie row",
      exit: "Safari back to app"
    ),
    AppRouteEntry(
      id: "settings.workspaceSwitch",
      title: "Workspace",
      classification: .gated,
      presentation: .surfacePane,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Switch between Jovie and Ovie workspaces",
      stateOwner: "RootView.workspaceMode",
      entry: "Settings ▸ Account row",
      exit: "Row tap toggles; Done → shell",
      gate: "showsWorkspaceSwitch (admin) or -ui-testing-admin (DEBUG)",
      issue: "JOV-5358"
    ),
    AppRouteEntry(
      id: "settings.logout",
      title: "Log Out",
      classification: .shipped,
      presentation: .confirmation,
      source: "Jovie/Features/Settings/SettingsView.swift",
      userTask: "Sign out of the device",
      stateOwner: "SettingsView.isShowingLogoutConfirmation",
      entry: "Settings ▸ Log Out row",
      exit: "Cancel → Settings; Confirm → root.signedOut",
      test: "-ui-testing-delayed-logout UITest"
    ),

    // MARK: Release-note sheets

    AppRouteEntry(
      id: "sheet.whatsNewVersioned",
      classification: .uiTestOnly,
      presentation: .sheet,
      source: "Jovie/App/RootView.swift",
      userTask: "Preview the versioned What's New fixture",
      stateOwner: "AppContentView.showWhatsNew",
      entry: "-ui-testing-whats-new launch argument",
      exit: "Sheet dismiss → marks version presented"
    ),
    AppRouteEntry(
      id: "sheet.whatsNewChangelog",
      classification: .shipped,
      presentation: .sheet,
      source: "Jovie/App/RootView.swift",
      userTask: "See unseen changelog highlights once per release",
      stateOwner: "AppContentView.changelogWhatsNew",
      entry: "Live launch/foreground with an unseen feed entry",
      exit: "Sheet dismiss; last-seen recorded on presentation"
    ),

    // MARK: Ingress (deep links and App Intents)

    AppRouteEntry(
      id: "deeplink.settings",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/AppShell/AppShellIntentNavigation.swift",
      userTask: "Jump to Settings from a signed-in URL",
      stateOwner: "IntentNavigationStore.pending",
      entry: "ie.jov.jovie /settings or /app/settings URL",
      exit: "Lands on cover.settings",
      test: "MobileSignedInLinkRoute tests"
    ),
    AppRouteEntry(
      id: "deeplink.start",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/AppShell/AppShellIntentNavigation.swift",
      userTask: "Return to chat home from /start",
      stateOwner: "IntentNavigationStore.pending",
      entry: "/start or /app/start URL",
      exit: "Lands on surface.chat",
      test: "MobileSignedInLinkRoute tests"
    ),
    AppRouteEntry(
      id: "deeplink.authCallback",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/App/JovieApp.swift",
      userTask: "Complete PKCE sign-in",
      stateOwner: "MobileAuthCallbackURLInbox",
      entry: "Custom-scheme or universal-link auth callback (onOpenURL + app delegate)",
      exit: "Consumed by the live root → root transition"
    ),
    AppRouteEntry(
      id: "deeplink.pushCtaUrl",
      classification: .shipped,
      presentation: .externalLink,
      source: "Jovie/App/JovieApp.swift",
      userTask: "Open a push notification's call-to-action link",
      stateOwner: "UIApplication.open",
      entry: "APNs payload.url via notification response tap",
      exit: "Hands off to the system browser",
      issue: "JOV-7730",
      test: "PushNotificationDeepLinkTests"
    ),
    AppRouteEntry(
      id: "deeplink.conversationActivity",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/ConversationUserActivity.swift",
      userTask: "Resume a conversation from Spotlight/handoff",
      stateOwner: "IntentNavigationStore.pending",
      entry: "NSUserActivity continuation",
      exit: "Lands on surface.chat with the conversation loaded",
      test: "ConversationUserActivityTests"
    ),
    AppRouteEntry(
      id: "intent.openChat",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/JovieAppIntents.swift",
      userTask: "Open chat from Siri/Shortcuts",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent",
      exit: "Lands on surface.chat",
      test: "JovieAppIntentsTests"
    ),
    AppRouteEntry(
      id: "intent.sendMessage",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/JovieAppIntents.swift",
      userTask: "Draft or auto-send a message from Siri/Shortcuts",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent",
      exit: "Lands on surface.chat with draft or sent turn",
      test: "AppShellIntentNavigationTests"
    ),
    AppRouteEntry(
      id: "intent.startVoiceCapture",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/JovieAppIntents.swift",
      userTask: "Start listening from Siri/Shortcuts",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent",
      exit: "Opens overlay.talk",
      test: "AppShellIntentNavigationTests"
    ),
    AppRouteEntry(
      id: "intent.startEyesFreeCapture",
      classification: .gated,
      presentation: .intent,
      source: "Jovie/Features/AppShell/AppShellIntentNavigation.swift",
      userTask: "Submit a transcript to Jovie or Summer eyes-free",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent",
      exit: "Opens overlay.talk or auto-submits; gated per EyesFreeCaptureGate",
      gate: "chatEnabled; summer destination requires admin workspace switch",
      test: "AppShellIntentNavigationTests"
    ),
    AppRouteEntry(
      id: "intent.continueLastConversation",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/JovieAppIntents.swift",
      userTask: "Resume the most recent conversation",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent",
      exit: "Lands on surface.chat",
      test: "JovieAppIntentsTests"
    ),
    AppRouteEntry(
      id: "intent.openConversation",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/Intents/ConversationUserActivity.swift",
      userTask: "Open a specific conversation",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent / Spotlight",
      exit: "Lands on surface.chat with the conversation loaded",
      test: "AppShellIntentNavigationTests"
    ),
    AppRouteEntry(
      id: "intent.openSettings",
      classification: .shipped,
      presentation: .intent,
      source: "Jovie/Features/AppShell/AppShellIntentNavigation.swift",
      userTask: "Open Settings from an intent",
      stateOwner: "IntentNavigationStore.pending",
      entry: "App Intent / deeplink.settings",
      exit: "Opens cover.settings",
      test: "AppShellIntentNavigationTests"
    ),

    // MARK: Web-only boundaries (JOV-7632; documented, never mounted in-app)

    AppRouteEntry(
      id: "webOnly.youtube",
      title: "YouTube",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/app/(shell)/youtube",
      userTask: "Run the YouTube packaging optimizer",
      stateOwner: "web app; AASA NOT /app/youtube*",
      entry: "Browser only — excluded from universal links",
      exit: "Safari"
    ),
    AppRouteEntry(
      id: "webOnly.insights",
      title: "Insights",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/app/(shell)/insights",
      userTask: "Read audience/release insights",
      stateOwner: "web app; AASA NOT /app/insights*",
      entry: "Browser only — excluded from universal links",
      exit: "Safari"
    ),
    AppRouteEntry(
      id: "webOnly.jovieWork",
      title: "Jovie Work",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/app/(shell)/jovie-work",
      userTask: "Use the Jovie Work workspace",
      stateOwner: "web app; AASA NOT /app/jovie-work*",
      entry: "Browser only — excluded from universal links",
      exit: "Safari"
    ),
    AppRouteEntry(
      id: "webOnly.releasePlan",
      title: "Release Plan",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/app/(shell)/dashboard/release-plan",
      userTask: "Review the release plan",
      stateOwner: "web app; AASA NOT /app/dashboard/release-plan*",
      entry: "Browser only — excluded from universal links",
      exit: "Safari"
    ),
    AppRouteEntry(
      id: "webOnly.dashboardInsights",
      title: "Dashboard Insights",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/app/(shell)/dashboard/insights",
      userTask: "Read insights under the dashboard namespace",
      stateOwner: "web app; AASA NOT /app/dashboard/insights*",
      entry: "Browser only — excluded from universal links",
      exit: "Safari"
    ),
    AppRouteEntry(
      id: "webOnly.merchCheckout",
      title: "Merch Checkout",
      classification: .webOnly,
      presentation: .externalLink,
      source: "apps/web/app/[username]/merch/[cardId]/page.tsx",
      userTask: "Buy a merch item",
      stateOwner: "web app; /<handle>/merch/<cardId> is outside /app/* and never claimed by the AASA",
      entry: "Browser only — public profile route",
      exit: "Safari"
    ),

    // MARK: DEBUG / UITest-only branches (not shipped surface area)

    AppRouteEntry(
      id: "debug.liveChatProbe",
      classification: .debugOnly,
      presentation: .overlay,
      source: "Jovie/App/RootView.swift",
      userTask: "Send a scripted live-chat probe",
      stateOwner: "AppContentView.didSendLiveChatProbe",
      entry: "JOVIE_IOS_LIVE_CHAT_PROMPT env in DEBUG builds",
      exit: "Fires once into chatRepository.send"
    ),
    AppRouteEntry(
      id: "debug.authCallbackHarness",
      classification: .debugOnly,
      presentation: .rootSwap,
      source: "Jovie/App/UITestHarnessViews.swift",
      userTask: "Exercise the auth callback without a live session",
      stateOwner: "JovieApp DEBUG branch",
      entry: "-ui-testing-auth-callback",
      exit: "Harness-owned"
    ),
    AppRouteEntry(
      id: "debug.reduceMotionMarker",
      classification: .debugOnly,
      presentation: .overlay,
      source: "Jovie/Features/AppShell/AppShellView.swift",
      userTask: "Expose interactive rail progress to UITest",
      stateOwner: "AppShellView.didExposeInteractiveRailProgressForUITest",
      entry: "-ui-testing-reduce-motion",
      exit: "1pt hidden marker view only"
    ),
    AppRouteEntry(
      id: "debug.adminWorkspaceArg",
      classification: .debugOnly,
      presentation: .surfacePane,
      source: "Jovie/App/RootView.swift",
      userTask: "Force the workspace switch visible in tests",
      stateOwner: "AppContentView.showsWorkspaceSwitch",
      entry: "-ui-testing-admin launch argument",
      exit: "Shows settings.workspaceSwitch"
    ),
    AppRouteEntry(
      id: "debug.teleprompterFixture",
      classification: .debugOnly,
      presentation: .overlay,
      source: "Jovie/Features/AppShell/AppShellView.swift",
      userTask: "Open Prompt Mode without a chat proposal",
      stateOwner: "AppShellView.teleprompterProposal",
      entry: "-ui-testing-teleprompter launch argument",
      exit: "Overlay close"
    ),
  ]

  static func entry(id: String) -> AppRouteEntry? {
    entries.first { $0.id == id }
  }

  static func entries(classification: AppRouteClassification) -> [AppRouteEntry] {
    entries.filter { $0.classification == classification }
  }

  /// Surfaces the drawer must render when both runtime gates are open.
  static func surfaceEntryIDs() -> [String] {
    AppShellTab.allCases.map { "surface.\($0)" }
  }

  /// Cross-checks the manifest against the compiled route surface. Returns one
  /// string per violation; empty means the census is coherent.
  static func validate() -> [String] {
    var issues: [String] = []

    let ids = entries.map(\.id)
    for id in ids where ids.filter({ $0 == id }).count > 1 {
      issues.append("duplicate route id \(id)")
    }

    for route in AppRouter.allCases where entry(id: "root.\(route)") == nil {
      issues.append("missing manifest entry for AppRouter.\(route)")
    }

    for tab in AppShellTab.allCases {
      guard let surface = entry(id: "surface.\(tab)") else {
        issues.append("missing manifest entry for AppShellTab.\(tab)")
        continue
      }
      if surface.classification == .unreachable || surface.classification == .deprecated {
        issues.append("AppShellTab.\(tab) is declared \(surface.classification)")
      }
      if surface.classification == .gated, surface.gate == nil {
        issues.append("gated surface.\(tab) must name its gate")
      }
      if !surface.title.isEmpty, surface.title != tab.title {
        issues.append("surface.\(tab) title '\(surface.title)' disagrees with sidebar label '\(tab.title)'")
      }
    }

    for tab in AppShellPanePolicy.sidebarDestinations(chatEnabled: true, audienceEnabled: true) {
      guard let surface = entry(id: "surface.\(tab)"),
            surface.classification == .shipped || surface.classification == .gated
      else {
        issues.append("sidebar destination \(tab) is not a shipped/gated route")
        continue
      }
    }

    for intent in IntentNavigationRequest.auditRepresentatives {
      let key: String
      switch intent {
      case .openChat: key = "intent.openChat"
      case .sendMessage: key = "intent.sendMessage"
      case .startVoiceCapture: key = "intent.startVoiceCapture"
      case .startEyesFreeCapture: key = "intent.startEyesFreeCapture"
      case .continueLastConversation: key = "intent.continueLastConversation"
      case .openConversation: key = "intent.openConversation"
      case .openSettings: key = "intent.openSettings"
      }
      if entry(id: key) == nil {
        issues.append("missing manifest entry for IntentNavigationRequest \(key)")
      }
    }

    for route in entries {
      if (route.classification == .shipped || route.classification == .gated),
         route.entry.isEmpty || route.exit.isEmpty
      {
        issues.append("live route \(route.id) must declare a visible entry and exit")
      }
    }

    for prefix in MobileWebOnlyRouteBoundary.pathPrefixes {
      if !entries.contains(where: { $0.classification == .webOnly && $0.stateOwner.contains(prefix) }) {
        issues.append("web-only path \(prefix) lacks a webOnly manifest entry")
      }
    }

    return issues
  }
}
