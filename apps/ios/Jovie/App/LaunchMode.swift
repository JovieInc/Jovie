import Foundation

enum LaunchMode: Equatable {
  case live
  case unitTesting
  case uiTestingLiveAuth
  case uiTestingRealBrowserAuth
  case uiTestingAuthCallback
  case uiTestingSignedOut
  case uiTestingReady
  case uiTestingProfileError
  case uiTestingChat
  case uiTestingChatOffline
  case uiTestingChatEntityFixture
  case uiTestingSettings
  case uiTestingVenueMode
  case uiTestingQRUnavailable
  case uiTestingNeedsOnboarding
  case uiTestingSplash
  case uiTestingAudience

  var usesLiveAuth: Bool {
    switch self {
    case .live, .uiTestingLiveAuth, .uiTestingRealBrowserAuth:
      return true
    case .unitTesting,
         .uiTestingAuthCallback,
         .uiTestingSignedOut,
         .uiTestingReady,
         .uiTestingProfileError,
         .uiTestingChat,
         .uiTestingChatOffline,
         .uiTestingChatEntityFixture,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingQRUnavailable,
         .uiTestingNeedsOnboarding,
         .uiTestingSplash,
         .uiTestingAudience:
      return false
    }
  }

  var opensSettingsOnLaunch: Bool {
    self == .uiTestingSettings
  }

  var opensChatOnLaunch: Bool {
    self == .uiTestingChat || self == .uiTestingChatOffline || self == .uiTestingChatEntityFixture
  }

  /// When set, `RootView` seeds `ChatRepository` with a deterministic
  /// fixture timeline for this launch mode instead of hitting the network or
  /// cache. `nil` for launch modes that don't need seeded chat content.
  var chatEntityFixture: [MobileChatTimelineItem]? {
    self == .uiTestingChatEntityFixture ? MobileChatEntityFixture.default : nil
  }

  /// Live auth and chat fixtures need a repository. Other deterministic UI
  /// modes stay network-free.
  var needsChatRepository: Bool {
    usesLiveAuth || opensChatOnLaunch || chatEntityFixture != nil
  }

  var opensAudienceOnLaunch: Bool {
    self == .uiTestingAudience
  }

  var opensVenueModeOnLaunch: Bool {
    self == .uiTestingVenueMode
  }

  // Chat is the permanent home for live sessions. UI-testing modes that assert
  // Profile-tab content (QR code, Copy URL, venue-mode fullscreen) keep
  // .profile as their default so existing test assertions don't navigate first.
  var defaultInitialTab: AppShellTab {
    switch self {
    case .uiTestingReady,
         .uiTestingSettings,
         .uiTestingQRUnavailable,
         .uiTestingAuthCallback,
         .uiTestingVenueMode:
      return .profile
    default:
      return .chat
    }
  }

  var recoversProfileErrorOnRetry: Bool {
    self == .uiTestingProfileError
  }

  static func current(processInfo: ProcessInfo = .processInfo) -> LaunchMode {
    let arguments = processInfo.arguments

    if arguments.contains("-ui-testing-live-auth") {
      return .uiTestingLiveAuth
    }

    if arguments.contains("-ui-testing-real-browser-auth") {
      return .uiTestingRealBrowserAuth
    }

    if arguments.contains("-ui-testing-auth-callback") {
      return .uiTestingAuthCallback
    }

    if arguments.contains("-ui-testing-signed-out") {
      return .uiTestingSignedOut
    }

    if arguments.contains("-ui-testing-ready") {
      return .uiTestingReady
    }

    if arguments.contains("-ui-testing-profile-error") {
      return .uiTestingProfileError
    }

    if arguments.contains("-ui-testing-chat") {
      return .uiTestingChat
    }

    if arguments.contains("-ui-testing-chat-offline") {
      return .uiTestingChatOffline
    }

    if arguments.contains("-ui-testing-chat-entity-fixture") {
      return .uiTestingChatEntityFixture
    }

    if arguments.contains("-ui-testing-settings") {
      return .uiTestingSettings
    }

    if arguments.contains("-ui-testing-venue-mode") {
      return .uiTestingVenueMode
    }

    if arguments.contains("-ui-testing-qr-unavailable") {
      return .uiTestingQRUnavailable
    }

    if arguments.contains("-ui-testing-needs-onboarding") {
      return .uiTestingNeedsOnboarding
    }

    if arguments.contains("-ui-testing-splash") {
      return .uiTestingSplash
    }

    if arguments.contains("-ui-testing-audience") {
      return .uiTestingAudience
    }

    if processInfo.environment["XCTestConfigurationFilePath"] != nil {
      return .unitTesting
    }

    return .live
  }
}
