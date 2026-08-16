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
  case uiTestingNeedsOnboardingUnauthorized
  case uiTestingSplash
  case uiTestingAudience
  case uiTestingLibrary
  case uiTestingLibraryEmpty
  case uiTestingInbox
  case uiTestingInboxOffline
  case uiTestingCalendar
  case uiTestingCalendarOffline

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
         .uiTestingNeedsOnboardingUnauthorized,
         .uiTestingSplash,
         .uiTestingAudience,
         .uiTestingLibrary,
         .uiTestingLibraryEmpty,
         .uiTestingInbox,
         .uiTestingInboxOffline,
         .uiTestingCalendar,
         .uiTestingCalendarOffline:
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
    case .uiTestingLibrary, .uiTestingLibraryEmpty:
      return .library
    case .uiTestingInbox, .uiTestingInboxOffline:
      return .inbox
    case .uiTestingCalendar, .uiTestingCalendarOffline:
      return .calendar
    default:
      return .chat
    }
  }

  /// Empty-library fixture for CI. Other deterministic ready modes keep
  /// `LibraryFeed.previewAssets` until a dedicated mobile library API ships.
  var usesEmptyLibraryPreview: Bool {
    self == .uiTestingLibraryEmpty
  }

  var recoversProfileErrorOnRetry: Bool {
    self == .uiTestingProfileError
  }

  static func current(processInfo: ProcessInfo = .processInfo) -> LaunchMode {
    resolving(
      arguments: processInfo.arguments,
      isXCTest: processInfo.environment["XCTestConfigurationFilePath"] != nil
    )
  }

  /// Parses launch arguments independently of `ProcessInfo` so unit tests can
  /// cover Library / Inbox / Calendar fixtures without spinning up XCUITest.
  static func resolving(arguments: [String], isXCTest: Bool) -> LaunchMode {
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

    if arguments.contains("-ui-testing-needs-onboarding-unauthorized") {
      return .uiTestingNeedsOnboardingUnauthorized
    }

    if arguments.contains("-ui-testing-splash") {
      return .uiTestingSplash
    }

    if arguments.contains("-ui-testing-audience") {
      return .uiTestingAudience
    }

    if arguments.contains("-ui-testing-library-empty") {
      return .uiTestingLibraryEmpty
    }

    if arguments.contains("-ui-testing-library") {
      return .uiTestingLibrary
    }

    if arguments.contains("-ui-testing-inbox-offline") {
      return .uiTestingInboxOffline
    }

    if arguments.contains("-ui-testing-inbox") {
      return .uiTestingInbox
    }

    if arguments.contains("-ui-testing-calendar-offline") {
      return .uiTestingCalendarOffline
    }

    if arguments.contains("-ui-testing-calendar") {
      return .uiTestingCalendar
    }

    if isXCTest {
      return .unitTesting
    }

    return .live
  }
}
